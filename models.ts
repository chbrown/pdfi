/// <reference path="type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');
var util = require('util-enhanced');

import Arrays = require('./Arrays');
import pdfdom = require('./pdfdom');
import decoders = require('./filters/decoders');

/**
Importing PDF like `import PDF = require('./PDF')` introduces a breaking
circular dependency.
*/
interface PDF {
  getObject(object_number: number, generation_number: number): pdfdom.PDFObject;
}

/**
Most of the classes in this module are wrappers for typed objects in a PDF,
where the object's Type indicates useful ways it may be processed.
*/

export class IndirectReference {
  constructor(public object_number: number, public generation_number: number) { }

  static isIndirectReference(object): boolean {
    if (object === undefined || object === null) return false;
    // return ('object_number' in object) && ('generation_number' in object);
    var object_number = object['object_number'];
    var generation_number = object['generation_number'];
    return (object_number !== undefined) && (generation_number !== undefined);
  }
  /**
  Create an IndirectReference from an "object[:reference=0]" string.
  */
  static fromString(reference: string): IndirectReference {
    var reference_parts = reference.split(':');
    var object_number = parseInt(reference_parts[0], 10);
    var generation_number = (reference_parts.length > 1) ? parseInt(reference_parts[1], 10) : 0;
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
*/
export class Model {
  private _resolved: boolean;
  constructor(protected _pdf: PDF,
              private _object: pdfdom.PDFObject) {
    // if the given _object looks like an indirect reference, mark it unresolved
    this._resolved = !IndirectReference.isIndirectReference(_object);
  }

  get object(): pdfdom.PDFObject {
    if (!this._resolved) {
      var object_number = this._object['object_number'];
      var generation_number = this._object['generation_number'];
      this._object = this._pdf.getObject(object_number, generation_number);
      this._resolved = true;
    }
    return this._object;
  }

  /**
  This is an (icky?) hack to get around circular dependencies with subclasses
  of Model.
  */
  asType<T extends Model>(ctor: { new(pdf: PDF, object: pdfdom.PDFObject): T }): T {
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
      var kid_object = new Model(this._pdf, Kid).object;
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
    return Arrays.flatMap(this.Kids, Kid => {
      // return (Kid instanceof Pages) ? Kid.getLeaves() : [Kid];
      if (Kid instanceof Pages) {
        return Kid.getLeaves();
      }
      // TypeScript should realize that `else {` is exhaustive
      else if (Kid instanceof Page) {
        return [Kid];
      }
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

  get MediaBox(): pdfdom.Rectangle {
    return this.object['MediaBox'];
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
    var strings = [].concat(this.Contents.object).map(stream => {
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

  get Filter(): string[] {
    return [].concat(this.object['dictionary']['Filter'] || []);
  }

  get Resources(): Resources {
    var object = this.object['dictionary']['Resources'];
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
    var buffer = this.object['buffer'];
    this.Filter.forEach(filter => {
      var decoder = decoders[filter];
      if (decoder) {
        buffer = decoder(buffer);
      }
      else {
        var message = `Could not find decoder named "${filter}" to fully decode stream`;
        // logger.error(message);
        throw new Error(message);
      }
    });
    // TODO: delete the dictionary['Filter'] field?
    return buffer;
  }

  toJSON(): any {
    return {
      Length: this.Length,
      Filter: this.Filter,
      buffer: this.buffer,
    };
  }

  static isContentStream(object): boolean {
    if (object === undefined || object === null) return false;
    return (object['dictionary'] !== undefined) && (object['buffer'] !== undefined);
  }
}

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
  get ExtGState(): any {
    return this.object['ExtGState'];
  }
  get ColorSpace(): any {
    return this.object['ColorSpace'];
  }
  get Pattern(): any {
    return this.object['Pattern'];
  }
  get Shading(): any {
    return this.object['Shading'];
  }
  get ProcSet(): string[] {
    return this.object['ProcSet'];
  }
  get Properties(): any {
    return this.object['Properties'];
  }
  // get Font(): any {
  //   return new Model(this._pdf, this.object['Font']).object;
  // }
  getFontModel(name: string): Model {
    var Font_dictionary = new Model(this._pdf, this.object['Font']).object;
    var Font_object = Font_dictionary[name];
    return new Model(this._pdf, Font_object);
  }

  getXObject(name: string): ContentStream {
    var XObject_dictionary = new Model(this._pdf, this.object['XObject']).object;
    var object = XObject_dictionary[name];
    return object ? new ContentStream(this._pdf, object) : undefined;
  }

  toJSON() {
    return {
      ExtGState: this.ExtGState,
      ColorSpace: this.ColorSpace,
      Pattern: this.Pattern,
      Shading: this.Shading,
      XObject: this.object['XObject'],
      Font: this.object['Font'],
      ProcSet: this.ProcSet,
      Properties: this.Properties,
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
  get Names(): any {
    return this.object['Names'];
  }
  get PageMode(): string {
    return this.object['PageMode'];
  }
  get OpenAction(): any {
    return this.object['OpenAction'];
  }

  toJSON() {
    return {
      Type: 'Catalog',
      Pages: this.Pages,
      Names: this.Names,
      PageMode: this.PageMode,
      OpenAction: this.OpenAction,
    };
  }
}

/**
The Trailer is not a typical extension of models.Model, because it is not
backed by a single PDFObject, but by a collection of PDFObjects.
*/
export class Trailer {
  constructor(private _pdf: PDF, private _object: any = {}) { }

  /**
  The PDF's trailers are read from newer to older. The newer trailers' values
  should be preferred, so we merge the older trailers under the newer ones.
  */
  merge(object: any): void {
    this._object = util.extend(object, this._object);
  }

  get Size(): number {
    return this._object['Size'];
  }

  get Root(): Catalog {
    return new Catalog(this._pdf, this._object['Root']);
  }

  get Info(): any {
    return new Model(this._pdf, this._object['Info']).object;
  }

  toJSON() {
    return {
      Size: this.Size,
      Root: this.Root,
      Info: this.Info,
    };
  }
}
