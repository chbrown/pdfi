import {fonts as afmFonts} from 'afm';

import {FontDescriptor} from './descriptor';
import {Encoding, expandDifferences, decodeGlyphname} from '../encoding/index';
import glyphlist from '../encoding/glyphlist';
import * as glyphmaps from '../encoding/glyphmaps';
import {logger} from '../logger';
import {PDF, Model, ContentStream, Resources} from '../models';
import {parseCMap} from '../parsers/index';
import {PDFObject} from '../pdfdom';
import {memoize, mergeArray, readCharCodes} from '../util';

const StandardUnicode = glyphmaps.StandardEncoding.map(glyphname => glyphlist[glyphname]);

function mergeFontDescriptor(glyphmap: string[],
                             fontDescriptor: FontDescriptor,
                             FirstChar: number,
                             LastChar: number): string[] {
  const CharSet = fontDescriptor.CharSet;
  // check for the easy-out: 1-character fonts
  if (FirstChar && LastChar && FirstChar === LastChar && CharSet.length === 1) {
    glyphmap[FirstChar] = CharSet[0];
  }
  else {
    // otherwise, try reading the FontFile
    const fontDescriptorGlyphmap = fontDescriptor.getGlyphmap();
    mergeArray(glyphmap, fontDescriptorGlyphmap);
  }
  return glyphmap;
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
*/
export class Font extends Model {
  public Name: string;

  /**
  This returns the object's `Encoding.BaseEncoding`, if it exists, or
  the plain `Encoding` value, if it's a string.
  */
  get BaseEncoding(): string {
    const Encoding = this.get('Encoding');
    // logger.info(`Font[${this.Name}] Encoding=${Encoding}`);
    if (Encoding && Encoding['BaseEncoding']) {
      return Encoding['BaseEncoding'];
    }
    if (typeof Encoding == 'string') {
      return <string>Encoding;
    }
  }

  get Differences(): Array<number | string> {
    const Encoding = this.get('Encoding');
    return Encoding ? Encoding['Differences'] : null;
  }

  /**
  BaseFont is supposed to be a name (i.e., a string).
  Maybe not always?
  */
  get BaseFont(): string {
    return <string>this.get('BaseFont');
  }

  /**
  If the Font specifies no FontDescriptor value, this will return `undefined`
  rather than an empty Model.
  */
  get FontDescriptor(): FontDescriptor {
    const object = this.object['FontDescriptor'];
    return object ? new FontDescriptor(this._pdf, object) : undefined;
  }

  get FirstChar(): number {
    return this.get('FirstChar');
  }

  get LastChar(): number {
    return this.get('LastChar');
  }

  /**
  1. The BaseFont name may contain the string "Bold"
  2. The FontDescriptor.FontName may contain the string "Bold"
  3. The FontDescriptor.FontWeight may be 700 or higher
  */
  @memoize
  get bold(): boolean {
    const BaseFont = this.BaseFont;
    if (BaseFont && BaseFont.match(/bold/i)) {
      return true;
    }
    const FontDescriptor = this.FontDescriptor;
    if (FontDescriptor) {
      const FontName = FontDescriptor.get('FontName');
      if (FontName && FontName.match(/bold/i)) {
        return true;
      }

      const FontWeight: number = FontDescriptor.get('FontWeight');
      if (FontWeight && FontWeight >= 700) {
        return true;
      }

      const Weight = FontDescriptor.getWeight();
      if (Weight && Weight == 'Bold') {
        return true;
      }
    }
    return false;
  }

  @memoize
  get italic(): boolean {
    const BaseFont = this.BaseFont;
    if (BaseFont && BaseFont.match(/italic/i)) {
      return true;
    }
    const FontDescriptor = this.FontDescriptor;
    if (FontDescriptor) {
      const FontName = FontDescriptor.get('FontName');
      if (FontName && FontName.match(/italic/i)) {
        return true;
      }
      // should I have a threshold on italics? Are there small italic angles,
      // e.g., with script-type fonts, but which don't really designate italics?
      const ItalicAngle: number = FontDescriptor.get('ItalicAngle');
      if (ItalicAngle && ItalicAngle !== 0) {
        return true;
      }
    }
    return false;
  }

  /**
  We need the Font's Encoding to map character codes into the glyph name (which
  can then easily be mapped to the unicode string representation of that glyph).

  The `encoding` getter memoizes the result.

  Encoding and ToUnicode are not always specified.
  */
  @memoize
  get encoding(): Encoding {
    const glyphmap: string[] = [];
    let characterByteLength = 1;

    // First off, use the font's Encoding or Encoding.BaseEncoding value, if available.
    // logger.info(`Font[${this.Name}] BaseEncoding=${BaseEncoding}`);
    const baseEncoding = this.BaseEncoding;
    if (baseEncoding in glyphmaps) {
      mergeArray(glyphmap, glyphmaps[baseEncoding] || []);
    }
    else if (baseEncoding == 'Identity-H') {
      logger.debug(`Font[${this.Name}] Encoding/BaseEncoding = "Identity-H" (but not setting characterByteLength to 2)`);
      // encoding.characterByteLength = 2;
    }
    else if (baseEncoding !== undefined) {
      logger.info(`Font[${this.Name}] Unrecognized Encoding/BaseEncoding: ${JSON.stringify(baseEncoding)}`);
    }

    // No luck? try the FontDescriptor
    const fontDescriptor = this.FontDescriptor;
    if (fontDescriptor) {
      // logger.debug(`Font[${this.Name}] Loading encoding from FontDescriptor`);
      mergeFontDescriptor(glyphmap, fontDescriptor, this.FirstChar, this.LastChar);
    }

    // convert charCode->glyphname mapping to charCode->string mapping
    const stringmap = glyphmap.map(decodeGlyphname);
    // TODO: handle missing glyphnames
    // if (str === undefined && glyphname !== '.notdef') {
    //   logger.warning(`Font[${this.Name}] Encoding.Difference ${current_character_code} -> ${difference}, but that is not an existing glyphname`);
    // }

    // ToUnicode is a better encoding indicator, but it is not always present,
    // and even when it is, it may be only complementary to the Encoding/BaseEncoding value
    const toUnicode = new ContentStream(this._pdf, this.object['ToUnicode']);
    if (toUnicode.object) {
      logger.debug(`Font[${this.Name}] Merging CMapContentStream`);
      const cMap = parseCMap(toUnicode.buffer);
      characterByteLength = cMap.byteLength;
      cMap.mappings.forEach(mapping => {
        // nb. mapping.dst is a native string
        stringmap[mapping.src] = mapping.dst;
      });
    }

    // TODO: use BaseFont if possible, instead of assuming a default "std" mapping
    if (stringmap.length === 0) {
      mergeArray(stringmap, StandardUnicode);
      // logger.debug(`Font[${this.Name}] Could not find any character code mapping; using "StandardEncoding" Latin charset, but confidence is low`);
    }

    // Finally, apply differences, if there are any.
    // even if ToUnicode is specified, there might still be Differences to incorporate.
    const differences = this.Differences || [];
    const differencesGlyphmap = expandDifferences(differences);
    // difference is a glyph name, but we want a mapping from character
    // codes to native unicode strings, so we resolve the glyphname via the
    // PDF standard glyphlist
    const differencesStringmap = differencesGlyphmap.map(decodeGlyphname);

    mergeArray(stringmap, differencesStringmap);
    return {mapping: stringmap, characterByteLength};
  }

  /**
  Returns a native (unicode) Javascript string representing the given character
  codes. These character codes may have nothing to do with Latin-1, directly,
  but can be mapped to unicode via the Font dictionary's Encoding or ToUnicode
  fields, and can be assigned widths via the Font dictionary's Widths or
  BaseFont fields.

  Uses ES6-like `\u{...}`-style escape sequences if the character code cannot
  be resolved to a string (unless the `skipMissing` argument is set to `true`,
  in which case, it simply skips those characters).
  */
  // @checkArguments([{type: 'Buffer'}, {type: 'Boolean'}])
  decodeString(buffer: Buffer, skipMissing = false): string {
    const encoding = this.encoding;
    if (buffer.length % encoding.characterByteLength !== 0) {
      logger.debug(`Font[${this.Name}] cannot decodeString with bad length (${buffer.length} !/ ${encoding.characterByteLength})`);
    }
    return readCharCodes(buffer, encoding.characterByteLength).map(charCode => {
      const str = encoding.mapping[charCode];
      if (str === undefined) {
        if (skipMissing) {
          logger.debug(`Font[${this.Name}] Skipping missing character code: ${charCode}`)
          return '';
        }
        const placeholder = '\\u{' + charCode.toString(16) + '}';
        logger.debug(`Font[${this.Name}] Could not decode character code: ${charCode} = ${placeholder}`)
        return placeholder;
      }
      return str;
    }).join('');
  }

  /**
  This should be overridden by subclasses to return a total width, in text units
  (usually somewhere in the range of 250-750 for each character/glyph).
  */
  measureString(buffer: Buffer): number {
    throw new Error(`Font[${this.Name}] Cannot measureString() in base Font class (Subtype: ${this.get('Subtype')})`);
  }

  toJSON() {
    return {
      Type: 'Font',
      Subtype: this.get('Subtype'),
      BaseFont: this.BaseFont,
    };
  }

  static isFont(object): boolean {
    if (object === undefined || object === null) return false;
    return object['Type'] === 'Font';
  }

  /**
  See Table 110 – Font types:
    Type0 | Type1 | MMType1 | Type3 | TrueType | CIDFontType0 | CIDFontType2

  <T extends Font>
  */
  static getConstructor(Subtype: string): { new(pdf: PDF, object: PDFObject): Font } {
    if (Subtype === 'Type0') {
      return Type0Font;
    }
    else if (Subtype === 'Type1') {
      return Type1Font;
    }
    else if (Subtype === 'TrueType') {
      // apparently TrueType and Type 1 fonts are pretty much the same.
      return Type1Font;
    }
    else if (Subtype === 'Type3') {
      // And Type 3 isn't too far off, either
      return Type1Font;
    }
    // TODO: add the other types of fonts
    return Font;
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

  measureString(buffer: Buffer): number {
    if (this._widthMapping === undefined || this._defaultWidth === undefined) {
      this._initializeWidthMapping();
    }
    const charCodes = readCharCodes(buffer, this.encoding.characterByteLength);
    const totalWidth = charCodes.reduce((sum, charCode) => {
      const str = this.encoding.mapping[charCode];
      const width = (str in this._widthMapping) ? this._widthMapping[str] : this._defaultWidth;
      return sum + width;
    }, 0);
    return totalWidth;
  }

  /**
  This may be able to determine character code widths directly from the Font
  resource, but may have to load a FontMetrics instance for Core14 fonts.

  If `Widths`, `FirstChar`, `LastChar`, and `FontDescriptor` are missing, and
  the BaseFont value is not one of the Core14 fonts, this will throw an Error.
  */
  private _initializeWidthMapping() {
    // Try using the local Widths, etc., configuration first.
    // TODO: avoid this BaseFont_name hack and resolve TrueType fonts properly
    const BaseFont_name = this.BaseFont ? this.BaseFont.split(',')[0] : null;
    const Widths = <number[]>new Model(this._pdf, this.get('Widths')).object;
    // FontMatrix and multiple should only technically be used for Type3 fonts
    const FontMatrix = <number[]>this.get('FontMatrix');
    const multiplier = FontMatrix ? (FontMatrix[0] / 0.001) : 1;
    // logger.debug(`Font[${this.Name}] Using width multiplier ${multiplier}`);
    if (Widths) {
      const FirstChar = <number>this.get('FirstChar');
      // TODO: verify LastChar?
      this._widthMapping = {};
      Widths.forEach((width, width_index) => {
        const charCode = FirstChar + width_index;
        const str = this.encoding.mapping[charCode];
        this._widthMapping[str] = width * multiplier;
      });
      // TODO: throw an Error if this.FontDescriptor['MissingWidth'] is NaN?
      const FontDescriptor = this.FontDescriptor;
      const MissingWidth = FontDescriptor && FontDescriptor.get('MissingWidth');
      // logger.debug(`Font[${this.Name}] has no FontDescriptor with "MissingWidth" field`);
      this._defaultWidth = MissingWidth || 0;
    }
    // if Widths cannot be found, try to load BaseFont as a vendor font from the afm repo
    else if (BaseFont_name in afmFonts) {
      this._widthMapping = {};
      afmFonts[BaseFont_name].forEach(charMetrics => {
        const string = glyphlist[charMetrics.name];
        this._widthMapping[string] = charMetrics.width;
      });
      this._defaultWidth = 1000;
    }
    else {
      throw new Error(`Font[${this.Name}] Cannot initialize width mapping for Type 1 Font without "Widths" field`);
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
    const array = new Model(this._pdf, this.get('DescendantFonts')).object;
    return new CIDFont(this._pdf, array[0]);
  }

  private _initializeWidthMapping() {
    this._widthMapping = this.DescendantFont.getWidthMapping();
    this._defaultWidth = this.DescendantFont.getDefaultWidth();
  }

  measureString(buffer: Buffer): number {
    if (this._widthMapping === undefined || this._defaultWidth === undefined) {
      this._initializeWidthMapping();
    }
    return readCharCodes(buffer, this.encoding.characterByteLength).reduce((sum, charCode) => {
      const width = (charCode in this._widthMapping) ? this._widthMapping[charCode] : this._defaultWidth;
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
export class CIDFont extends Font {
  get CIDSystemInfo(): string {
    return this.get('CIDSystemInfo');
  }

  get W(): Array<number | number[]> {
    const model = new Model(this._pdf, this.object['W']);
    return <Array<number | number[]>>model.object;
  }

  getDefaultWidth(): number {
    return this.get('DW');
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
    const mapping: number[] = [];
    const addConsecutive = (starting_cid_value: number, widths: number[]) => {
      widths.forEach((width, width_offset) => {
        mapping[starting_cid_value + width_offset] = width;
      });
    };
    const addRange = (c_first: number, c_last: number, width: number) => {
      for (let cid = c_first; cid <= c_last; cid++) {
        mapping[cid] = width;
      }
    };
    const cid_widths = (this.W || []);
    let index = 0;
    const length = cid_widths.length;
    while (index < length) {
      if (Array.isArray(cid_widths[index + 1])) {
        const starting_cid_value = <number>cid_widths[index];
        const widths = <number[]>cid_widths[index + 1];
        addConsecutive(starting_cid_value, widths);
        index += 2;
      }
      else {
        const c_first = <number>cid_widths[index];
        const c_last = <number>cid_widths[index + 1];
        const width = <number>cid_widths[index + 2];
        addRange(c_first, c_last, width);
        index += 3;
      }
    }
    return mapping;
  }
}
