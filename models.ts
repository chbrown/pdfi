import {StringIterator} from 'lexing';
import {flatMap, groups, assign} from 'tarry';

import {logger} from './logger';
import {OBJECT} from './parsers/states';
import {IndirectObject, PDFObject, Rectangle, DictionaryObject} from './pdfdom';
import {decodeBuffer} from './filters/decoders';

/**
Importing PDF from './PDF' induces a breaking circular dependency.
*/
export interface PDF {
  getObject(object_number: number, generation_number: number): PDFObject;
  getModel<T extends Model>(object_number: number,
                            generation_number: number,
                            ctor: { new(pdf: PDF, object: PDFObject): T }): T;
}

/**
Most of the classes in this module are wrappers for typed objects in a PDF,
where the object's Type indicates useful ways it may be processed.
*/

export class IndirectReference {
  constructor(public object_number: number, public generation_number: number) { }

  static isIndirectReference(object): boolean {
    if (object === undefined || object === null) return false;
    return (object['object_number'] !== undefined) && (object['generation_number'] !== undefined);
  }
  /**
  Create an IndirectReference from an "object[:reference=0]" string.
  */
  static fromString(reference: string): IndirectReference {
    const reference_parts = reference.split(':');
    const object_number = parseInt(reference_parts[0], 10);
    const generation_number = (reference_parts.length > 1) ? parseInt(reference_parts[1], 10) : 0;
    return new IndirectReference(object_number, generation_number);
  }
  toString(): string {
    return `${this.object_number}:${this.generation_number}`;
  }
}

/**
_pdf: PDF -- the base PDF
_object: the original plain old javascript object parsed from the PDF

The _object may be an IndirectReference; if so, it will not be resolved
immediately, but only when the `object` getter is called.

If a new Model is constructed with a null `_object`, it will create the Model,
but Model#object will return null.
*/
export class Model {
  private _resolved: boolean;
  constructor(protected _pdf: PDF,
              private _object: PDFObject) {
    // if the given _object looks like an indirect reference, mark it unresolved
    this._resolved = !IndirectReference.isIndirectReference(_object);
  }

  get object(): PDFObject {
    if (!this._resolved) {
      const object_number = this._object['object_number'];
      const generation_number = this._object['generation_number'];
      this._object = this._pdf.getObject(object_number, generation_number);
      this._resolved = true;
    }
    return this._object;
  }

  /**
  Read a value from the `object` mapping (assuming `this` is a PDFDictionary or
  behaves like one), resolving indirect references as needed.

  Much like `new Model(this._pdf, this.object[key]).object`, but avoids creating
  a whole new Model.
  */
  get(key: string): any {
    let value = this.object[key];
    if (value !== undefined && value['object_number'] !== undefined && value['generation_number'] !== undefined) {
      value = this._pdf.getObject(value['object_number'], value['generation_number']);
    }
    return value;
  }

  /**
  This is an (icky?) hack to get around circular dependencies with subclasses
  of Model (like Font).
  */
  asType<T extends Model>(ctor: { new(pdf: PDF, object: PDFObject): T }): T {
    return new ctor(this._pdf, this.object);
  }

  toJSON() {
    return this.object;
  }
}

/**
interface Pages {
  Type: 'Pages';
  Kids: IndirectReference[]; // -> Array<Pages | Page>
}
*/
export class Pages extends Model {
  get Kids(): Array<Pages | Page> {
    return this.object['Kids'].map(Kid => {
      const kid_object = new Model(this._pdf, Kid).object;
      return (kid_object['Type'] === 'Pages') ?
        new Pages(this._pdf, kid_object) : new Page(this._pdf, kid_object);
    });
  }

  /**
  "Pages"-type objects have a field, Kids: IndirectReference[].
  Each indirect reference will resolve to a Page or Pages object.

  This will flatten the page list breadth-first, returning only the Page objects
  at the leaves of the pages tree.
  */
  getLeaves(): Page[] {
    return flatMap(this.Kids, Kid => {
      return (Kid instanceof Pages) ? Kid.getLeaves() : [Kid];
    });
  }

  toJSON() {
    return {
      Type: 'Pages',
      Kids: this.Kids,
    };
  }
}

/**
Only `Type`, `Parent`, `Resources`, and `MediaBox` are required.

Optional fields:

    LastModified?: string; // actually Date
    Annots?: IndirectReference;
    CropBox?: Rectangle;
    BleedBox?: Rectangle;
    TrimBox?: Rectangle;
    ArtBox?: Rectangle;
    BoxColorInfo?: DictionaryObject;
    Contents?: IndirectReference | IndirectReference[];
    Rotate?: number;
    Group?: DictionaryObject;
    Thumb?: Stream;

See "Table 30 – Entries in a page object".
*/
export class Page extends Model {
  get Parent(): Pages {
    return new Pages(this._pdf, this.object['Parent']);
  }

  get MediaBox(): Rectangle {
    return this.get('MediaBox');
  }

  get Resources(): Resources {
    return new Resources(this._pdf, this.object['Resources']);
  }

  /**
  The Contents field may be a reference to a Stream object, an array of
  references to Stream objects, or a reference to an array (of references to
  stream objects)
  */
  get Contents(): Model {
    return new Model(this._pdf, this.object['Contents']);
  }

  /**
  A page's 'Contents' field may be a single stream or an array of streams. We
  need to iterate through all of them and concatenate them into a single stream.

  From the spec:

  > If the value is an array, the effect shall be as if all of the streams in the array were concatenated, in order, to form a single stream. Conforming writers can create image objects and other resources as they occur, even though they interrupt the content stream. The division between streams may occur only at the boundaries between lexical tokens but shall be unrelated to the page's logical content or organization. Applications that consume or produce PDF files need not preserve the existing structure of the Contents array. Conforming writers shall not create a Contents array containing no elements.

  Merging the streams would be pretty simple, except that the separations
  between them count as token separators, so we can't feed the result of
  `Buffer.concat(...)` directly into the StackOperationParser (via Canvas).

  TODO: don't combine the strings (more complex)
        see MultiStringIterator in scratch.txt
  */
  joinContents(separator: string): string {
    const strings = [].concat(this.Contents.object).map(stream => {
      return new ContentStream(this._pdf, stream).buffer.toString('binary');
    });
    return strings.join(separator);
  }

  toJSON() {
    return {
      Type: 'Page',
      // Parent: this.Parent, // try to avoid circularity
      MediaBox: this.MediaBox,
      Resources: this.Resources,
      Contents: this.Contents,
    };
  }
}

/**
interface ContentStream {
  dictionary: {
    Length: number;
    Filter?: string | string[];
  };
  buffer: Buffer;
}
*/
export class ContentStream extends Model {
  get Length(): number {
    return <number>new Model(this._pdf, this.object['dictionary']['Length']).object;
  }

  get Resources(): Resources {
    const object = this.object['dictionary']['Resources'];
    return object ? new Resources(this._pdf, object) : undefined;
  }

  get Subtype(): string {
    // this may be 'Form' or 'Image', etc., in Resources.XObject values
    return this.object['dictionary']['Subtype'];
  }

  get dictionary(): any {
    return this.object['dictionary'];
  }

  /**
  Return the object's buffer, decoding if necessary.
  */
  get buffer(): Buffer {
    const filters = [].concat(this.object['dictionary']['Filter'] || []);
    const decodeParmss = [].concat(this.object['dictionary']['DecodeParms'] || []);
    return decodeBuffer(this.object['buffer'], filters, decodeParmss);
  }

  toJSON(): any {
    return {
      Length: this.Length,
      buffer: this.buffer,
    };
  }

  static isContentStream(object): boolean {
    if (object === undefined || object === null) return false;
    return (object['dictionary'] !== undefined) && (object['buffer'] !== undefined);
  }
}

/**
An ObjectStream is denoted by Type='ObjStm', and documented in PDF32000_2008.pdf:7.5.7 Object Streams
*/
export class ObjectStream extends ContentStream {
  get objects(): IndirectObject[] {
    const buffer = this.buffer;
    // the prefix designates where each object in the stream occurs in the content
    const prefix = buffer.slice(0, this.dictionary.First);
    // const content = buffer.slice(this.dictionary.First)
    const object_number_index_pairs = groups(prefix.toString('ascii').trim().split(/\s+/).map(x => parseInt(x, 10)), 2);
    return object_number_index_pairs.map(([object_number, offset]) => {
      const iterable = StringIterator.fromBuffer(buffer, 'binary', this.dictionary.First + offset);
      const value = new OBJECT(iterable, 1024).read();
      return {object_number, generation_number: 0, value};
    });
  }

  toJSON(): any {
    return {
      Length: this.Length,
      buffer: this.buffer,
    };
  }
}

import {Font} from './font/index';

/**
Pages that render to text are defined by their `Contents` field, but
that field sometimes references objects or fonts in the `Resources` field,
which in turns has a field, `XObject`, which is a mapping from names object
names to nested streams of content. I'm pretty sure they're always streams.

Despite being plural, the `Resources` field is always a single object,
as far as I can tell.

None of the fields are required.
*/
export class Resources extends Model {
  private _cached_fonts: {[index: string]: Font} = {};

  /**
  returns `undefined` if no matching XObject is found.
  */
  getXObject(name: string): ContentStream {
    const XObject_dictionary = this.get('XObject');
    const object = XObject_dictionary[name];
    return object ? new ContentStream(this._pdf, object) : undefined;
  }

  /**
  Retrieve a Font instance from the given Resources' Font dictionary.

  Caches Fonts (which is pretty hot when rendering a page),
  even missing ones (as null).

  Using PDF#getModel() allows reuse of all the memoizing each Font instance does.
  Otherwise, we have to create a new Font instance (albeit, perhaps using the
  PDF's object cache, which is helpful) for each Resources.

  throws an Error if the Font dictionary has no matching `name` key.
  */
  getFont(name: string): Font {
    let cached_font = this._cached_fonts[name];
    if (cached_font === undefined) {
      const Font_dictionary = this.get('Font');

      const dictionary_value = Font_dictionary[name];
      const font_object = new Model(this._pdf, dictionary_value).object;
      if (font_object === undefined) {
        throw new Error(`Cannot find font object for name=${name}`);
      }
      const ctor = Font.getConstructor(font_object['Subtype']);
      // this `object` will usually be an indirect reference.
      if (IndirectReference.isIndirectReference(dictionary_value)) {
        cached_font = this._cached_fonts[name] = this._pdf.getModel(dictionary_value['object_number'], dictionary_value['generation_number'], ctor);
        cached_font.Name = name;
      }
      else if (font_object) {
        // if `object` is not an indirect reference, the only caching we can do
        // is on this Resources object.
        cached_font = this._cached_fonts[name] = new ctor(this._pdf, font_object);
      }
      else {
        throw new Error(`Cannot find font "${name}" in Resources: ${JSON.stringify(this)}`);
      }
    }
    return cached_font;
  }

  /**
  return a Model since the values may be indirect references.
  returns `undefined` if no matching ExtGState is found.
  */
  getExtGState(name: string): Model {
    const ExtGState_dictionary = this.get('ExtGState');
    const object = ExtGState_dictionary[name];
    return object ? new Model(this._pdf, object) : undefined;
  }

  toJSON() {
    return {
      ExtGState: this.get('ExtGState'),
      ColorSpace: this.get('ColorSpace'),
      Pattern: this.get('Pattern'),
      Shading: this.get('Shading'),
      XObject: this.get('XObject'),
      Font: this.get('Font'),
      ProcSet: this.get('ProcSet'),
      Properties: this.get('Properties'),
    };
  }
}

/**
The PDF points to its catalog object with its trailer's `Root` reference.

interface Catalog {
  Type: 'Catalog';
  Pages: IndirectReference; // reference to a {type: 'Pages', ...} object
  Names?: IndirectReference;
  PageMode?: string;
  OpenAction?: IndirectReference;
}
*/
export class Catalog extends Model {
  get Pages(): Pages {
    return new Pages(this._pdf, this.object['Pages']);
  }

  toJSON() {
    return {
      Type: 'Catalog',
      // Pages: this.Pages,
      Names: this.get('Names'),
      PageMode: this.get('PageMode'),
      OpenAction: this.get('OpenAction'),
    };
  }
}

/**
The Trailer is not a typical extension of models.Model, because it is not
backed by a single PDFObject, but by a collection of PDFObjects.
*/
export class Trailer {
  constructor(private _pdf: PDF, public objects: DictionaryObject[] = []) { }

  /**
  The PDF's trailers are read from newer to older.
  */
  add(object: DictionaryObject) {
    this.objects.push(object);
  }

  /**
  this._objects contains the trailers from older to newer, so merging the
  the newer trailers' values over the older trailers is straightfoward.

  Not as generic as the typical Model#object getter, but similar enough to
  warrant using the same name.
  */
  get object() {
    // TODO: memoize this (but bust the cache if the underlying objects change)
    return <DictionaryObject>assign({}, ...this.objects);
  }

  get Size() {
    return <number>this.object['Size'];
  }

  /**
  I'm pretty sure the `Root` reference is always a reference.
  */
  get Root() {
    return new Catalog(this._pdf, this.object['Root']);
  }

  /**
  I'm pretty sure the `Info` reference is also always a reference.
  */
  get Info() {
    return new Model(this._pdf, this.object['Info']).object;
  }

  toJSON() {
    return {
      Size: this.Size,
      Root: this.Root,
      Info: this.Info,
    };
  }
}
