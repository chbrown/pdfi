/// <reference path="type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');

import PDF = require('./PDF');
import pdfdom = require('./pdfdom');
import graphics = require('./parsers/graphics');
import cmap = require('./parsers/cmap');
import decoders = require('./filters/decoders');
import drawing = require('./drawing');
import shapes = require('./shapes');

var unorm = require('unorm');

/**
glyphlist is a mapping from PDF glyph names to unicode strings
*/
var glyphlist: {[index: string]: string} = require('./encoding/glyphlist');

/**
Most of the classes in this module are wrappers for typed objects in a PDF,
where the object's Type indicates useful ways it may be processed.
*/

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

  get MediaBox(): [number, number, number, number] {
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
  joinContents(separator: string): string {
    var strings = [].concat(this.Contents.object).map(stream => {
      return new ContentStream(this._pdf, stream).buffer.toString('binary');
    });
    return strings.join(separator);
  }

  /**
  When we render a page, we specify a ContentStream as well as a Resources
  dictionary. That Resources dictionary may contain XObject streams that are
  embedded as `Do` operations in the main contents, as well as sub-Resources
  in those XObjects.
  */
  renderCanvas(): drawing.Canvas {
    var pageBox = new shapes.Rectangle(this.MediaBox[0], this.MediaBox[1], this.MediaBox[2], this.MediaBox[3]);
    var canvas = new drawing.Canvas(pageBox);

    var contents_string = this.joinContents('\n');
    var contents_string_iterable = new lexing.StringIterator(contents_string);

    var context = new graphics.DrawingContext(this.Resources);
    context.render(contents_string_iterable, canvas);

    return canvas;
  }

  /**
  Returns one string (one line) for each paragraph.
  */
  getParagraphStrings(section_names: string[]): string[] {
    var canvas = this.renderCanvas();
    var sections = canvas.getSections();
    var selected_sections = sections.filter(section => section_names.indexOf(section.name) > -1);
    var selected_sections_paragraphs = selected_sections.map(section => section.getParagraphs());
    // flatten selected_sections_paragraphs into a single Array of Paragraphs
    var paragraphs: drawing.Paragraph[] = selected_sections_paragraphs.reduce((a, b) => a.concat(b), [])
    // render each Paragraph into a single string with any pre-existing EOL
    // markers stripped out
    return paragraphs.map(paragraph => {
      var parargraph_text = paragraph.getText();
      var line = parargraph_text.replace(/(\r\n|\r|\n|\t)/g, ' ');
      var visible_line = parargraph_text.replace(/[\x00-\x1F]/g, '');
      var normalized_line = unorm.nfkc(visible_line);
      return normalized_line;
    });
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
      var Font_model = (name in Font_dictionary) ? new Font(this._pdf, Font_dictionary[name]) : null;
      // See Table 110 – Font types:
      // Type0 | Type1 | MMType1 | Type3 | TrueType | CIDFontType0 | CIDFontType2
      if (Type0Font.isType0Font(Font_model.object)) {
        Font_model = new Type0Font(this._pdf, Font_model.object);
      }
      else if (Type1Font.isType1Font(Font_model.object)) {
        Font_model = new Type1Font(this._pdf, Font_model.object);
      }
      // TODO: add the others...
      cached_font = this._cached_fonts[name] = Font_model;
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
`_widthMapping` is a cached mapping from charCodes to character widths
(numbers).
`_defaultWidth` is a cached number representing the default character width,
when the character code cannot be found in `_widthMapping`.
*/
export class Font extends Model {
  private _charCodeMapping: string[];
  private _widthMapping: number[];
  private _defaultWidth: number;

  get Subtype(): any {
    return this.object['Subtype'];
  }
  get BaseFont(): string {
    return this.object['BaseFont'];
  }
  get FontDescriptor(): any {
    // I don't think I need any of the FontDescriptor stuff for text extraction
    var model = new Model(this._pdf, this.object['FontDescriptor']);
    return model.object;
  }
  get Encoding(): Encoding {
    var object = this.object['Encoding'];
    return object ? new Encoding(this._pdf, object) : undefined;
  }
  get ToUnicode(): any {
    var object = this.object['ToUnicode'];
    return object ? new ToUnicode(this._pdf, object) : undefined;
  }

  getDefaultWidth(): number {
    return 1000;
  }

  getWidthMapping(): number[] {
    return [];
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
  decodeString(charCodes: number[], skipMissing = false): string {
    // initialize if needed
    if (this._charCodeMapping === undefined) {
      this._charCodeMapping = this.getCharCodeMapping();
    }
    return charCodes.map(charCode => {
      var string = this._charCodeMapping[charCode];
      if (string === undefined) {
        logger.error(`Could not decode character code: ${charCode}`)
        if (skipMissing) {
          return '';
        }
        return '\\u{' + charCode.toString(16) + '}';
      }
      return string;
    }).join('');
  }

  measureString(charCodes: number[]): number {
    if (this._widthMapping === undefined) {
      this._widthMapping = this.getWidthMapping();
      this._defaultWidth = this.getDefaultWidth();
    }

    var total_width = 0;
    charCodes.forEach(charCode => {
      var width = this._widthMapping[charCode];
      total_width += (width !== undefined) ? width : this._defaultWidth;
    });
    return total_width;
  }

  toJSON() {
    return {
      Type: 'Font',
      Subtype: this.Subtype,
      Encoding: this.Encoding,
      FontDescriptor: this.FontDescriptor,
      BaseFont: this.BaseFont,
      Mapping: this.getCharCodeMapping(),
      defaultWidth: this.getDefaultWidth(),
      widthMapping: this.getWidthMapping(),
    };
  }

  static isFont(object): boolean {
    if (object === undefined || object === null) return false;
    return object['Type'] === 'Font';
  }
}

export class Type1Font extends Font {
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

  getDefaultWidth(): number {
    return this.FontDescriptor['MissingWidth'];
  }

  getWidthMapping(): number[] {
    var mapping: number[] = [];
    var FirstChar = this.FirstChar;
    this.Widths.forEach((width, width_index) => {
      mapping[FirstChar + width_index] = width;
    });
    return mapping;
  }

  static isType1Font(object): boolean {
    if (object === undefined || object === null) return false;
    return object['Type'] === 'Font' && object['Subtype'] === 'Type1';
  }
}

/**
Composite font (PDF32000_2008.pdf:9.7)

> Type: 'Font'
> Subtype: 'Type0'
*/
export class Type0Font extends Font {
  /**
  > DescendantFonts: array (Required): A one-element array specifying the
  > CIDFont dictionary that is the descendant of this Type 0 font.
  */
  get DescendantFont(): CIDFont {
    return new CIDFont(this._pdf, this.object['DescendantFonts'][0]);
  }

  getDefaultWidth(): number {
    return this.DescendantFont.getDefaultWidth();
  }

  getWidthMapping(): number[] {
    return this.DescendantFont.getWidthMapping();
  }

  static isType0Font(object): boolean {
    if (object === undefined || object === null) return false;
    return object['Type'] === 'Font' && object['Subtype'] === 'Type0';
  }
}

/**
CIDFonts (PDF32000_2008.pdf:9.7.4)

Goes well with Type 0 fonts.

> Type: 'Font'
> Subtype: 'CIDFontType0' or 'CIDFontType2'
> CIDSystemInfo: dictionary (Required)
> DW: integer (Optional) The default width for glyphs in the CIDFont. Default
    value: 1000 (defined in user units).
> W: array (Optional) A description of the widths for the glyphs in the CIDFont.
    The array’s elements have a variable format that can specify individual
    widths for consecutive CIDs or one width for a range of CIDs. Default
    value: none (the DW value shall be used for all glyphs).

*/
export class CIDFont extends Font {
  get CIDSystemInfo(): string {
    return this.object['CIDSystemInfo'];
  }

  getDefaultWidth(): number {
    return this.object['DW'];
  }

  /**
  The W array allows the definition of widths for individual CIDs. The elements of the array shall be organized in groups of two or three, where each group shall be in one of these two formats:
  `c [w1 w2 ... wn]`: c shall be an integer specifying a starting CID value; it shall be followed by an array of n numbers that shall specify the widths for n consecutive CIDs, starting with c.
  `c_first c_last w`: define the same width, w, for all CIDs in the range c_first to c_last.
  */
  getWidthMapping(): number[] {
    var mapping: number[] = [];
    var addConsecutive = (starting_cid_value: number, widths: number[]) => {
      widths.forEach((width, width_offset) => {
        mapping[starting_cid_value + width_offset] = width;
      });
    };
    var addRange = (c_first: number, c_last: number, width: number) => {
      for (var cid = c_first; cid <= c_last; cid++) {
        mapping[cid] = width;
      }
    };
    var W_object = new Model(this._pdf, this.object['W']).object;
    var cid_widths = <Array<number | number[]>>(W_object || []);
    var index = 0;
    var length = cid_widths.length;
    while (index < length) {
      if (Array.isArray(cid_widths[index + 1])) {
        var starting_cid_value = <number>cid_widths[index];
        var widths = <number[]>cid_widths[index + 1];
        addConsecutive(starting_cid_value, widths);
        index += 2;
      }
      else {
        var c_first = <number>cid_widths[index];
        var c_last = <number>cid_widths[index + 1];
        var width = <number>cid_widths[index + 2];
        addRange(c_first, c_last, width);
        index += 3;
      }
    }
    return mapping;
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
