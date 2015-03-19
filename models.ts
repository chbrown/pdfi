/// <reference path="type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');

import PDF = require('./PDF');
import pdfdom = require('./pdfdom');
import graphics = require('./parsers/graphics');
import cmap = require('./parsers/cmap');
import decoders = require('./filters/decoders');
import drawing = require('./drawing');

/**
glyphlist is a mapping from PDF glyph names to unicode strings
*/
var glyphlist: {[index: string]: string} = require('./encoding/glyphlist');

/**
Most of the classes in this module are wrappers for typed objects in a PDF,
where the object's Type indicates useful ways it may be processed.
*/

/**
A Rectangle is a 4-tuple [x1, y1, x2, y2], where [x1, y1] and [x2, y2] are
points in any two diagonally opposite corners, usually lower-left to
upper-right.

From the spec:

> **rectangle**
> a specific array object used to describe locations on a page and bounding
> boxes for a variety of objects and written as an array of four numbers giving
> the coordinates of a pair of diagonally opposite corners, typically in the
> form `[ llx lly urx ury ]` specifying the lower-left x, lower-left y,
> upper-right x, and upper-right y coordinates of the rectangle, in that order
*/
export type Rectangle = [number, number, number, number]

export type Point = [number, number]

interface CharacterSpecification {
  char: string;
  glyphname: string;
  std: number;
  mac: number;
  win: number;
  pdf: number;
}

var latin_charset: CharacterSpecification[] = require('./encoding/latin_charset');

export class IndirectReference {
  static isIndirectReference(object): boolean {
    if (object === undefined || object === null) return false;
    // return ('object_number' in object) && ('generation_number' in object);
    var object_number = object['object_number'];
    var generation_number = object['generation_number'];
    return (object_number !== undefined) && (generation_number !== undefined);
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

  This function will flatten the page list breadth-first, returning
  */
  getLeaves(): Page[] {
    var PageGroups: Page[][] = this.Kids.map(Kid => {
      // return (Kid instanceof Pages) ? Kid.getLeaves() : [Kid];
      if (Kid instanceof Pages) {
        return Kid.getLeaves();
      }
      // TypeScript should realize that `else {` is exhaustive
      else if (Kid instanceof Page) {
        return [Kid];
      }
    });
    // flatten Page[][] into Page[]
    return Array.prototype.concat.apply([], PageGroups);
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

  > If the value is an array, the effect shall be as if all of the streams in the array were concatenated, in order, to form a single stream. Conforming writers can create image objects and other resources as they occur, even though they interrupt the content stream. The division between streams may occur only at the boundaries between lexical tokens but shall be unrelated to the page’s logical content or organization. Applications that consume or produce PDF files need not preserve the existing structure of the Contents array. Conforming writers shall not create a Contents array containing no elements.

  Merging the streams would be pretty simple, except that the separations
  between them count as token separators, so we can't feed the result of
  `Buffer.concat(...)` directly into the StackOperationParser (via Canvas).

  TODO: don't combine the strings (more complex)
        see MultiStringIterator in scratch.txt
  */
  joinContents(separator: string, encoding: string = 'ascii'): string {
    var strings = [].concat(this.Contents.object).map(stream => {
      return new ContentStream(this._pdf, stream).buffer.toString(encoding)
    });
    return strings.join(separator);
  }

  renderCanvas(): drawing.Canvas {
    var canvas = new drawing.Canvas(this.MediaBox);

    var contents_string = this.joinContents('\n', 'ascii');
    var contents_string_iterable = new lexing.StringIterator(contents_string);
    canvas.render(contents_string_iterable, this.Resources);

    return canvas;
  }

  getParagraphStrings(section_names: string[]): string[] {
    var canvas = this.renderCanvas();
    var sections = canvas.getSections();
    var selected_sections = sections.filter(section => section_names.indexOf(section.name) > -1);
    var selected_sections_paragraphs = selected_sections.map(section => section.getParagraphs());
    // flatten selected_sections_paragraphs into a single Array of Paragraphs
    var paragraphs: drawing.Paragraph[] = selected_sections_paragraphs.reduce((a, b) => a.concat(b))
    // render each Paragraph into a single string with any pre-existing EOL
    // markers stripped out
    return paragraphs.map(paragraph => paragraph.getText().replace(/(\r\n|\r|\n)/g, ' '));
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
        logger.error(message);
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

Despite being plural, the `Resources` field is always a single object, as far as I can tell.

None of the fields are required.

Caches Fonts (which is pretty hot when rendering a page)
*/
export class Resources extends Model {
  private _cached_fonts: {[index: string]: Font} = {};

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

  getXObject(name: string): ContentStream {
    var XObject_dictionary = new Model(this._pdf, this.object['XObject']).object;
    var object = XObject_dictionary[name];
    return object ? new ContentStream(this._pdf, object) : undefined;
  }
  /**
  Retrieve a Font instance from the Resources' Font dictionary.

  Returns null if the dictionary has no `name` key.

  Caches fonts, even missing ones (as null).
  */
  getFont(name: string): Font {
    var cached_font = this._cached_fonts[name];
    if (cached_font === undefined) {
      var Font_dictionary = new Model(this._pdf, this.object['Font']).object;
      var object = Font_dictionary[name];
      cached_font = this._cached_fonts[name] = object ? new Font(this._pdf, object) : null;
    }
    return cached_font;
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
`_charCodeMapping` is a cached mapping from in-PDF character codes to native
Javascript (unicode) strings.
*/
export class Font extends Model {
  private _charCodeMapping: string[];

  get Subtype(): any {
    return this.object['Subtype'];
  }
  get BaseFont(): any {
    return this.object['BaseFont'];
  }
  get FontDescriptor(): any {
    // I don't think I need any of the FontDescriptor stuff for text extraction
    return this.object['FontDescriptor'];
  }
  get Encoding(): Encoding {
    var object = this.object['Encoding'];
    return object ? new Encoding(this._pdf, object) : undefined;
  }
  get ToUnicode(): any {
    var object = this.object['ToUnicode'];
    return object ? new ToUnicode(this._pdf, object) : undefined;
  }
  /**
  The PDF spec actually recommends that Widths is an indirect reference.
  */
  get Widths(): number[] {
    var model = new Model(this._pdf, this.object['Widths']);
    return <number[]>model.object;
  }
  get FirstChar(): number {
    return this.object['FirstChar'];
  }
  get LastChar(): number {
    return this.object['LastChar'];
  }

  /**
  We need the Font's Encoding (not always specified) to read its Differences,
  which we use to map character codes into the glyph name (which can then easily
  be mapped to the unicode string representation of that glyph).
  */
  getCharCodeMapping(): string[] {
    // try the ToUnicode object first
    if (this.ToUnicode) {
      return this.ToUnicode.Mapping;
    }

    // No luck? Try the Encoding dictionary
    if (this.Encoding) {
      return this.Encoding.Mapping;
    }

    // Neither Encoding nor ToUnicode are specified; that's bad!
    logger.warn(`Could not find any character code mapping for font; using default mapping`);
    return Encoding.getDefaultMapping('std');
  }

  /**
  Returns a native (unicode) Javascript string representing the given character
  codes.

  Caches the required Mapping.

  Uses ES6-like `\u{...}`-style escape sequences if the character code cannot
  be resolved to a string.
  */
  decodeString(charCodes: number[]): string {
    // initialize if needed
    if (this._charCodeMapping === undefined) {
      this._charCodeMapping = this.getCharCodeMapping();
    }
    return charCodes.map(charCode => {
      var string = this._charCodeMapping[charCode];
      if (string === undefined) {
        logger.error(`Could not decode character code: ${charCode}`)
        return '\\u{' + charCode.toString(16) + '}';
      }
      return string;
    }).join('');
  }

  measureString(charCodes: number[], defaultWidth = 1000): number {
    var Widths = this.Widths;
    var FirstChar = this.FirstChar;
    if (Widths === undefined || FirstChar === undefined) {
      return charCodes.length & defaultWidth;
    }
    var charWidths = charCodes.map(charCode => this.Widths[charCode - FirstChar] || defaultWidth);
    return charWidths.reduce((a, b) => a + b);
  }

  toJSON() {
    return {
      Type: 'Font',
      Subtype: this.Subtype,
      Encoding: this.Encoding,
      FontDescriptor: this.FontDescriptor,
      Widths: this.Widths,
      BaseFont: this.BaseFont,
      Mapping: this.getCharCodeMapping(),
    };
  }

  static isFont(object): boolean {
    if (object === undefined || object === null) return false;
    return object['Type'] === 'Font';
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
interface Encoding {
  Type: 'Encoding';
  BaseEncoding: string;
  Differences: Array<number | string>;
}
*/
export class Encoding extends Model {
  get BaseEncoding(): any {
    return this.object['BaseEncoding'];
  }
  get Differences(): Array<number | string> {
    return this.object['Differences'];
  }

  /**
  Mapping returns an object mapping character codes to unicode strings.

  If there are no `Differences` specified, return a default mapping.
  */
  get Mapping(): string[] {
    var mapping = Encoding.getDefaultMapping('std');
    var current_character_code = 0;
    (this.Differences || []).forEach(difference => {
      if (typeof difference === 'number') {
        current_character_code = difference;
      }
      else {
        // difference is a glyph name, but we want a mapping from character
        // codes to native unicode strings, so we resolve the glyphname via the
        // PDF standard glyphlist
        // TODO: handle missing glyphnames
        mapping[current_character_code++] = glyphlist[difference];
      }
    });
    return mapping;
  }

  toJSON() {
    return {
      Type: 'Encoding',
      BaseEncoding: this.BaseEncoding,
      Differences: this.Differences,
      Mapping: this.Mapping,
    };
  }

  /**
  This loads the character codes listed in encoding/latin_charset.json into
  a (sparse?) Array of strings mapping indices (character codes) to unicode
  strings (not glyphnames).

  `base` should be one of 'std', 'mac', 'win', or 'pdf'
  */
  static getDefaultMapping(base: string): string[] {
    var mapping: string[] = [];
    latin_charset.forEach(charspec => {
      var charCode: number = charspec[base];
      if (charCode !== null) {
        mapping[charspec[base]] = glyphlist[charspec.glyphname];
      }
    });
    return mapping;
  }

  static isEncoding(object): boolean {
    if (object === undefined || object === null) return false;
    return object['Type'] === 'Encoding';
  }
}

export class ToUnicode extends ContentStream {
  get Mapping(): string[] {
    var string_iterable = lexing.StringIterator.fromBuffer(this.buffer, 'ascii');
    var parser = new cmap.CMapParser();
    return parser.parse(string_iterable);
  }

  toJSON(): any {
    return {
      Mapping: this.Mapping,
    };
  }
}
