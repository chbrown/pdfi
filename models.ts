/// <reference path="type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');

var afm = require('afm');

import Arrays = require('./Arrays');
import PDF = require('./PDF');
import pdfdom = require('./pdfdom');
import graphics = require('./parsers/graphics');
import cmap = require('./parsers/cmap');
import decoders = require('./filters/decoders');
import drawing = require('./drawing');
import shapes = require('./shapes');
import FontMetrics = require('./font/FontMetrics');
import encoding_Mapping = require('./encoding/Mapping');

/**
glyphlist is a mapping from PDF glyph names to unicode strings
*/
var glyphlist: {[index: string]: string} = require('./encoding/glyphlist');

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
      if (name in Font_dictionary) {
        var Font_model = new Font(this._pdf, Font_dictionary[name]);
        // See Table 110 – Font types:
        //   Type0 | Type1 | MMType1 | Type3 | TrueType | CIDFontType0 | CIDFontType2
        if (Font_model.object['Type'] === 'Font') {
          if (Font_model.object['Subtype'] === 'Type0') {
            Font_model = new Type0Font(this._pdf, Font_model.object);
          }
          else if (Font_model.object['Subtype'] === 'Type1') {
            Font_model = new Type1Font(this._pdf, Font_model.object);
          }
          else if (Font_model.object['Subtype'] === 'TrueType') {
            // apparently TrueType and Type 1 fonts are pretty much the same.
            Font_model = new Type1Font(this._pdf, Font_model.object);
          }
          else if (Font_model.object['Subtype'] === 'Type3') {
            // And Type 3 isn't too far off, either
            Font_model = new Type1Font(this._pdf, Font_model.object);
          }
          // TODO: add the other types of fonts
        }
        Font_model.Name = name;
        cached_font = this._cached_fonts[name] = Font_model;
      }
      else {
        cached_font = this._cached_fonts[name] = null;
      }
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
Font is a general, sometimes abstract (see Font#measureString), representation
of a PDF Font of any Subtype.

Some uses, which vary in their implementation based on the Type of the font,
require creating a specific Font subclass, e.g., Type1Font().

Beyond the `object` property, common to all Model instances, Font also has a
`Name` field, which is populated when the Font is instantiated from within
Resources#getFont(), for easier debugging. It should not be used for any
material purposes (and is not necessary for any).

# Cached objects

* `_encodingMapping: encoding_Mapping` is a cached mapping from in-PDF character codes to native
  Javascript (unicode) strings.
*/
export class Font extends Model {
  private _encodingMapping: encoding_Mapping;
  public Name: string;

  get Subtype(): string {
    return this.object['Subtype'];
  }

  get BaseFont(): string {
    return this.object['BaseFont'];
  }

  /**
  Cached as `_encodingMapping`.

  We need the Font's Encoding (not always specified) to read its Differences,
  which we use to map character codes into the glyph name (which can then easily
  be mapped to the unicode string representation of that glyph).
  */
  get encodingMapping(): encoding_Mapping {
    // initialize if needed
    if (this._encodingMapping === undefined) {
      // try the ToUnicode object first
      if (this.object['ToUnicode']) {
        var ToUnicode = new ContentStream(this._pdf, this.object['ToUnicode']);
        var string_iterable = lexing.StringIterator.fromBuffer(ToUnicode.buffer, 'ascii');
        var cMap = cmap.CMap.parseStringIterable(string_iterable);
        this._encodingMapping = encoding_Mapping.fromCMap(cMap);
      }
      // No luck? Try the Encoding dictionary
      else if (this.object['Encoding']) {
        var Encoding = new Model(this._pdf, this.object['Encoding']);
        // var BaseEncoding = Encoding.object['BaseEncoding']; // TODO: use this value
        this._encodingMapping = encoding_Mapping.fromLatinCharset('std');
        var Differences = Encoding.object['Differences'];
        if (Differences && Differences.length > 0) {
          this._encodingMapping.applyDifferences(Differences);
        }
      }
      else {
        // Neither Encoding nor ToUnicode are specified; that's bad!
        logger.warn(`[Font=${this.Name}] Could not find any character code mapping; using default mapping`);
        // TODO: use BaseFont if possible, instead of assuming a default "std" mapping
        this._encodingMapping = encoding_Mapping.fromLatinCharset('std');
      }
    }
    return this._encodingMapping;
  }

  /**
  Returns a native (unicode) Javascript string representing the given character
  codes. These character codes may have nothing to do with Latin-1, directly,
  but can be mapped to unicode via the Font dictionary's Encoding or ToUnicode
  fields, and can be assigned widths via the Font dictionary's Widths or
  BaseFont fields.

  Uses a cached mapping via the charCodeMapping getter.

  Uses ES6-like `\u{...}`-style escape sequences if the character code cannot
  be resolved to a string (unless the `skipMissing` argument is set to `true`,
  in which case, it simply skips those characters.
  */
  decodeString(bytes: number[], skipMissing = false): string {
    return this.encodingMapping.decodeCharCodes(bytes).map(charCode => {
      var string = this.encodingMapping.decodeCharacter(charCode);
      if (string === undefined) {
        logger.error(`[Font=${this.Name}] Could not decode character code: ${charCode}`)
        if (skipMissing) {
          return '';
        }
        return '\\u{' + charCode.toString(16) + '}';
      }
      return string;
    }).join('');
  }

  /**
  This should be overridden by subclasses to return a total width, in text units
  (usually somewhere in the range of 250-750 for each character/glyph).
  */
  measureString(bytes: number[]): number {
    throw new Error(`Cannot measureString() in base Font class (Subtype: ${this.Subtype}, Name: ${this.Name})`);
  }

  toJSON() {
    return {
      Type: 'Font',
      Subtype: this.Subtype,
      BaseFont: this.BaseFont,
    };
  }

  static isFont(object): boolean {
    if (object === undefined || object === null) return false;
    return object['Type'] === 'Font';
  }
}

/**
Type 1 Font (See PDF32000_2008.pdf:9.6.2, Table 111)

## The basics

* `Type: string = 'Font'`
* `Subtype: string = 'Type1'`
* `BaseFont: string`
  This is required, but does not always name a Core14 font. From the spec:
  > The PostScript name of the font. For Type 1 fonts, this is always the value
  > of the FontName entry in the font program. The PostScript name of the font
  > may be used to find the font program in the conforming reader or its
  > environment
* `Name?: string`
  Obsolete. This is a relic of PDF 1.0, when it matched the key of this font in
  the current Resources' `Font` dictionary.

## Metrics for non-Core14 fonts

* `FirstChar?: integer`
* `LastChar?: integer`
* `Widths?: array`
  The PDF spec actually recommends that `Widths` be an indirect reference.
* `FontDescriptor?`

These four fields are optional for the Core14 ("standard 14") fonts, but are
not precluded for the Core14 fonts. In fact, PDF 1.5 suggests that even the
Core14 fonts specify these fields. They come in a package -- they "shall" all
be present, or all be absent.

## Resolving character codes

* `Encoding?: string | dictionary`
  Optional. From the spec:
  > A specification of the font's character encoding if different from its built-in encoding. The value of Encoding shall be either the name of a predefined encoding (MacRomanEncoding, MacExpertEncoding, or WinAnsiEncoding) or an encoding dictionary that shall specify differences from the font's built-in encoding or from a specified predefined encoding.
* `ToUnicode?: ContentStream`
  Optional. From the spec:
  > A stream containing a CMap file that maps character codes to Unicode values.

# Cached objects

* `_widthMapping: {[index: string]: number}`
  A cached mapping from unicode strings to character widths (numbers). In the
  case that `Widths`, etc., are defined, it'd be easier to map directly from
  character codes, but since we might also have to load the widths from a Core14
  font metrics file, unicode is the common denominator.
* `_defaultWidth: number`
  A cached number representing the default character width, when the character
  code cannot be found in `_widthMapping`.

*/
export class Type1Font extends Font {
  private _widthMapping: {[index: string]: number};
  private _defaultWidth: number;

  measureString(bytes: number[]): number {
    if (this._widthMapping === undefined || this._defaultWidth === undefined) {
      this._initializeWidthMapping();
    }
    return this.encodingMapping.decodeCharCodes(bytes).reduce((sum, charCode) => {
      var string = this.encodingMapping.decodeCharacter(charCode);
      var width = (string in this._widthMapping) ? this._widthMapping[string] : this._defaultWidth;
      return sum + width;
    }, 0);
  }

  /**
  This may be able to determine character code widths directly from the Font
  resource, but may have to load a FontMetrics instance for Core14 fonts.

  If `Widths`, `FirstChar`, `LastChar`, and `FontDescriptor` are missing, and
  the BaseFont value is not one of the Core14 fonts, this will throw an Error.
  */
  private _initializeWidthMapping() {
    // logger.debug(`Type1Font[${this.Name}]#_initializeWidthMapping() called`);
    // Try using the local Widths, etc., configuration first.
    var Widths = <number[]>new Model(this._pdf, this.object['Widths']).object;
    if (Widths) {
      var FirstChar = <number>this.object['FirstChar'];
      // TODO: verify LastChar?
      this._widthMapping = {};
      Widths.forEach((width, width_index) => {
        var charCode = FirstChar + width_index;
        var string = this.encodingMapping.decodeCharacter(charCode);
        this._widthMapping[string] = width;
      });
      // TODO: throw an Error if this.FontDescriptor['MissingWidth'] is NaN?
      var FontDescriptor = new Model(this._pdf, this.object['FontDescriptor']).object;
      if (FontDescriptor && FontDescriptor['MissingWidth']) {
        this._defaultWidth = FontDescriptor['MissingWidth'];
      }
      else {
        logger.silly(`Font[${this.Name}] has no FontDescriptor with "MissingWidth" field`);
        this._defaultWidth = null;
      }
    }
    // if Widths cannot be found, try to load BaseFont as a Core14 font.
    else if (FontMetrics.isCore14(this.BaseFont)) {
      var fontMetrics = FontMetrics.loadCore14(this.BaseFont);
      this._widthMapping = {};
      fontMetrics.characters.forEach(charMetrics => {
        // charMetrics only specifies the glyphname and the default character
        // code; we need to express the mapping in terms of the font's
        var string = glyphlist[charMetrics.name];
        this._widthMapping[string] = charMetrics.width;
      });
      // As far as I can tell, in the case of the Core14 fonts, the default
      // width should never be referenced, but I'll set it here just in case.
      this._defaultWidth = 1000;
    }
    else if (afm.names.indexOf(this.BaseFont) > -1) {
      this._widthMapping = {};
      afm.loadFontMetricsSync(this.BaseFont).forEach(charMetrics => {
        var string = glyphlist[charMetrics.name];
        this._widthMapping[string] = charMetrics.width;
      });
      this._defaultWidth = 1000;
    }
    else {
      throw new Error(`Font[${this.Name}] Cannot initialize width mapping for non-Core14 Type 1 Font without "Widths" field`);
    }
  }

  static isType1Font(object): boolean {
    if (object === undefined || object === null) return false;
    return object['Type'] === 'Font' && object['Subtype'] === 'Type1';
  }
}

/**
Composite font (PDF32000_2008.pdf:9.7)

* `Type: string = 'Font'`
* `Subtype: string = 'Type0'`
* `DescendantFonts: Array`

# Cached objects

* `_widthMapping: number[]`
  A cached mapping from charCodes to character widths.
* `_defaultWidth: number`
  A cached number representing the default character width, when the character
  code cannot be found in `_widthMapping`.
*/
export class Type0Font extends Font {
  private _widthMapping: number[];
  private _defaultWidth: number;

  /**
  > DescendantFonts: array (Required): A one-element array specifying the
  > CIDFont dictionary that is the descendant of this Type 0 font.
  */
  get DescendantFont(): CIDFont {
    var array = new Model(this._pdf, this.object['DescendantFonts']).object;
    return new CIDFont(this._pdf, array[0]);
  }

  private _initializeWidthMapping() {
    // logger.debug(`Type0Font[${this.Name}]#_initializeWidthMapping() called`);
    this._widthMapping = this.DescendantFont.getWidthMapping();
    this._defaultWidth = this.DescendantFont.getDefaultWidth();
  }

  measureString(bytes: number[]): number {
    if (this._widthMapping === undefined || this._defaultWidth === undefined) {
      this._initializeWidthMapping();
    }
    return this.encodingMapping.decodeCharCodes(bytes).reduce((sum, charCode) => {
      var width = (charCode in this._widthMapping) ? this._widthMapping[charCode] : this._defaultWidth;
      return sum + width;
    }, 0);
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
    The array's elements have a variable format that can specify individual
    widths for consecutive CIDs or one width for a range of CIDs. Default
    value: none (the DW value shall be used for all glyphs).

*/
class CIDFont extends Font {
  get CIDSystemInfo(): string {
    return this.object['CIDSystemInfo'];
  }

  get W(): Array<number | number[]> {
    var model = new Model(this._pdf, this.object['W']);
    return <Array<number | number[]>>model.object;
  }

  getDefaultWidth(): number {
    return this.object['DW'];
  }

  /**
  The W array allows the definition of widths for individual CIDs. The elements
  of the array shall be organized in groups of two or three, where each group
  shall be in one of these two formats:
  1. `c [w1 w2 ... wn]`: `c` shall be an integer specifying a starting CID
    value; it shall be followed by an array of `n` numbers that shall specify
    the widths for n consecutive CIDs, starting with `c`.
  2. `c_first c_last w`: define the same width, `w`, for all CIDs in the range
    `c_first` to `c_last` (inclusive).
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
    var cid_widths = (this.W || []);
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
