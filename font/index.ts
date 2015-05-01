/// <reference path="../type_declarations/index.d.ts" />
import * as lexing from 'lexing';
import * as logger from 'loge';
import * as afm from 'afm';

import {FontDescriptor} from './descriptor';
import {Model, ContentStream} from '../models';
import {glyphlist, Mapping} from '../encoding/index';
import cmap = require('../parsers/cmap');

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

* `_encodingMapping: Mapping` is a cached mapping from in-PDF character codes to native
  Javascript (unicode) strings.
*/
export class Font extends Model {
  private _encodingMapping: Mapping;
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
  get encodingMapping(): Mapping {
    // initialize if needed
    if (this._encodingMapping === undefined) {
      // try the ToUnicode object first
      if (this.object['ToUnicode']) {
        var ToUnicode = new ContentStream(this._pdf, this.object['ToUnicode']);
        var string_iterable = lexing.StringIterator.fromBuffer(ToUnicode.buffer, 'ascii');
        var cMap = cmap.CMap.parseStringIterable(string_iterable);
        this._encodingMapping = Mapping.fromCMap(cMap);
      }
      // No luck? Try the Encoding dictionary
      else if (this.object['Encoding']) {
        var Encoding = new Model(this._pdf, this.object['Encoding']);
        // TODO: use Encoding.object['BaseEncoding']
        // TODO: handle MacExpertEncoding properly
        if (Encoding.object == 'MacRomanEncoding' || Encoding.object == 'MacExpertEncoding') {
          this._encodingMapping = Mapping.fromLatinCharset('mac');
        }
        else if (Encoding.object == 'WinAnsiEncoding') {
          this._encodingMapping = Mapping.fromLatinCharset('win');
        }
        else {
          this._encodingMapping = Mapping.fromLatinCharset('std');
        }
        // apply differences, if there are any
        var Differences = Encoding.object['Differences'];
        if (Differences && Differences.length > 0) {
          this._encodingMapping.applyDifferences(Differences);
        }
      }
      else if (this.object['FontDescriptor']) {
        logger.debug(`[Font=${this.Name}] Loading FontDescriptor`);
        var font_descriptor = new FontDescriptor(this._pdf, this.object['FontDescriptor']);
        // check for the easy-out: 1-character fonts
        var FirstChar = <number>this.object['FirstChar'];
        var LastChar = <number>this.object['LastChar'];
        var CharSet = font_descriptor.CharSet;
        if (FirstChar && LastChar && FirstChar === LastChar && CharSet.length == 1) {
          var mapping: string[] = [];
          mapping[FirstChar] = glyphlist[CharSet[0]];
          this._encodingMapping = new Mapping(mapping);
        }
        else if (font_descriptor.object['FontFile']) {
          this._encodingMapping = font_descriptor.getMapping();
        }
        else {
          logger.warn(`[Font=${this.Name}] Could not resolve FontDescriptor (no FontFile property)`);
          this._encodingMapping = Mapping.fromLatinCharset('std');
        }
      }
      // else if (this.object['FontName']) {
      //   var [prefix, name] = this.object['FontName'].split('+');
      //   if (name) {
      //     // try to lookup an AFM file to resolve characters to glyphnames
      //   }
      // }
      else {
        logger.warn(`[Font=${this.Name}] Could not find any character code mapping; using default mapping`);
        // TODO: use BaseFont if possible, instead of assuming a default "std" mapping
        this._encodingMapping = Mapping.fromLatinCharset('std');
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
        var placeholder = '\\u{' + charCode.toString(16) + '}';
        logger.error(`[Font=${this.Name}] Could not decode character code: ${charCode} = ${placeholder}`)
        if (skipMissing) {
          return '';
        }
        return placeholder;
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

  static fromModel(model: Model): Font {
    // var Font_model = new font.Font(this._pdf, Font_dictionary[name]);
    // See Table 110 – Font types:
    //   Type0 | Type1 | MMType1 | Type3 | TrueType | CIDFontType0 | CIDFontType2
    if (model.object['Subtype'] === 'Type0') {
      return model.asType(Type0Font);
    }
    else if (model.object['Subtype'] === 'Type1') {
      return model.asType(Type1Font);
    }
    else if (model.object['Subtype'] === 'TrueType') {
      // apparently TrueType and Type 1 fonts are pretty much the same.
      return model.asType(Type1Font);
    }
    else if (model.object['Subtype'] === 'Type3') {
      // And Type 3 isn't too far off, either
      return model.asType(Type1Font);
    }
    return null;
    // TODO: add the other types of fonts
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
    // Try using the local Widths, etc., configuration first.
    // TODO: avoid this BaseFont_name hack and resolve TrueType fonts properly
    var BaseFont_name = this.BaseFont ? this.BaseFont.split(',')[0] : null;
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
    // if Widths cannot be found, try to load BaseFont as a vendor font from the afm repo
    else if (afm.vendor_font_names.indexOf(BaseFont_name) > -1) {
      this._widthMapping = {};
      afm.readVendorFontMetricsSync(BaseFont_name).forEach(charMetrics => {
        var string = glyphlist[charMetrics.name];
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
    var array = new Model(this._pdf, this.object['DescendantFonts']).object;
    return new CIDFont(this._pdf, array[0]);
  }

  private _initializeWidthMapping() {
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
