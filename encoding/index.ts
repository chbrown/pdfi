/// <reference path="../type_declarations/index.d.ts" />
import * as lexing from 'lexing';
import logger = require('loge');
import unorm = require('unorm');

import Arrays = require('../Arrays');
import {ContentStream} from '../models';
import cmap = require('../parsers/cmap');

/**
glyphlist is a mapping from PDF glyph names to unicode strings
*/
export var glyphlist: {[index: string]: string} = require('./glyphlist');

interface CharacterSpecification {
  char: string;
  glyphname: string;
  StandardEncoding: number;
  MacRomanEncoding: number;
  WinAnsiEncoding: number;
  PDFDocEncoding: number;
}
var latin_charset: CharacterSpecification[] = require('./latin_charset');

/**
`bytes` should be Big-endian, e.g., [0xFF, 0x0F] is bigger than [0x0F, 0xFF]
`bytes` should be all in the range: [0, 256)

decodeNumber([0xFE]) => 254 == 0xFE
decodeNumber([0xFF, 0x0F]) => 65295 == 0xFF0F
decodeNumber([0xAD, 0x95, 0xCC]) => 11376076 == 0xAD95CC
*/
function decodeNumber(bytes: number[]): number {
  var sum = 0;
  for (var i = 0, length = bytes.length; i < length; i++) {
    sum += (bytes[i] << ((length - (i + 1)) * 8));
  }
  return sum;
}

/**
encoding.Mapping primarily resolves arrays of bytes (often, character codes)
to native Javascript (unicode) strings.
*/
export class Encoding {
  constructor(public mapping: string[] = [],
              public characterByteLength = 1) { }

  static latinCharsetNames = [
    'StandardEncoding',
    'MacRomanEncoding',
    'WinAnsiEncoding',
    'PDFDocEncoding',
    'MacExpertEncoding',
  ];

  /**
  This loads the character codes listed in ./latin_charset.json into
  a (sparse-ish) Array of strings mapping indices (character codes) to unicode
  strings (not glyphnames).

  `name` should be one of the following:
  * 'StandardEncoding'
  * 'MacRomanEncoding'
  * 'WinAnsiEncoding'
  * 'PDFDocEncoding'
  * 'MacExpertEncoding'
  */
  mergeLatinCharset(name: string): void {
    if (name == 'MacExpertEncoding') {
      logger.warn(`Coercing "MacExpertEncoding" to "MacRomanEncoding" when merging Latin character set `);
      // TODO: handle MacExpertEncoding properly
      name = 'MacRomanEncoding';
    }
    // proceed, assuming that name is one of the base Latin character set names
    latin_charset.forEach(charspec => {
      var charCode: number = charspec[name];
      if (charCode !== null) {
        this.mapping[charCode] = glyphlist[charspec.glyphname];
      }
    });
  }

  /**
  This is called with a ToUnicode content stream for font types that specify one.
  */
  mergeCMapContentStream(contentStream: ContentStream): void {
    var string_iterable = lexing.StringIterator.fromBuffer(contentStream.buffer, 'ascii');
    var cMap = cmap.CMap.parseStringIterable(string_iterable);
    this.characterByteLength = cMap.byteLength;
    cMap.mapping.forEach((str, charCode) => {
      if (str !== null && str !== undefined) {
        this.mapping[charCode] = str;
      }
    });
  }

  /**
  Returns the character codes represented by the given bytes.

  `bytes` should all be in the range: 0 ≤ byte < 256
  */
  decodeCharCodes(bytes: number[]): number[] {
    return Arrays.groups(bytes, this.characterByteLength).map(decodeNumber);
  }

  /**
  Returns a native (unicode) Javascript string representing the given character
  codes. These character codes may have nothing to do with Latin-1, directly,
  but can be mapped to unicode via the Font dictionary's Encoding or ToUnicode
  fields, and can be assigned widths via the Font dictionary's Widths or
  BaseFont fields.
  */
  decodeCharacter(charCode: number): string {
    return this.mapping[charCode];
  }
}

/**
Modifiers modify the character after them. This is the PDF way.
Combiners modify the character before them. This is the Unicode way.

The Unicode modifier block is (0x02B0-0x02FF) = (688-767)
*/
var modifier_to_combiner = {
  '\u005E': '\u0302', // CIRCUMFLEX ACCENT
  '\u0060': '\u0300', // GRAVE ACCENT
  '\u00A8': '\u0308', // DIAERESIS
  '\u00AF': '\u0304', // MACRON
  '\u00B4': '\u0301', // ACUTE ACCENT
  '\u00B8': '\u0327', // CEDILLA
  '\u02C6': '\u0302', // MODIFIER LETTER CIRCUMFLEX ACCENT -> COMBINING CIRCUMFLEX ACCENT
  '\u02C7': '\u030C', // CARON -> COMBINING CARON
  '\u02CA': '\u0301', // MODIFIER LETTER ACUTE ACCENT -> COMBINING ACUTE ACCENT
  '\u02CB': '\u0300', // MODIFIER LETTER GRAVE ACCENT -> COMBINING GRAVE ACCENT
  '\u02D8': '\u0306', // BREVE -> COMBINING BREVE
  '\u02D9': '\u0307', // DOT ABOVE
  '\u02DA': '\u030A', // RING ABOVE
  '\u02DB': '\u0328', // OGONEK
  '\u02DC': '\u0303', // SMALL TILDE
  '\u02DD': '\u030B', // DOUBLE ACUTE ACCENT -> COMBINING DOUBLE ACUTE ACCENT
};
/**
Normalization:
1. Combining diacritics combine with the character that precedes them.
   A high-order character with diacritic (like "LATIN SMALL LETTER C WITH CARON")
   is decomposed into a pair [lowercase c, combining caron]. This is what we deal
   with below, by decomposing lone diacritics into [space, combining diacritic]
   pairs, removing the space, and recomposing, so that the diacritic combines
   with the previous character, as the PDF writer intended.
   E.g., Preot¸iuc (from P14-6001.pdf), where the U+00B8 "CEDILLA" combines with
   the character preceding it.
   Actually, apparently that's an oddity. There's a huge (positive) TJ spacing
   argument in between the two arguments: (eot) 333 (¸iuc)

2. We also need to deal with modifier diacritics, which precede the character
   they modify. For example, Hajiˇc (from P14-5021.pdf), where the intended č
   is designated by a (U+02C7 "CARON", U+0063 "LATIN SMALL LETTER C") pair.
   ("CARON" is a Modifier_Letter)

Actually, I'm not sure how to tell these apart. "¸", which joins with the
preceding character, has a decomposition specified, as (SPACE, COMBINING CEDILLA),
but is otherwise a modifier character as usual.

So, it's ambiguous?
*/
export function normalize(raw: string): string {
  // ensure that the only whitespace is SPACE
  // TODO: is this too draconian?
  var flattened = raw.replace(/\s+/g, ' ');
  // remove any other character codes 0 through 31 (space is 32 == 0x20)
  var visible = flattened.replace(/[\x00-\x1F]/g, '');
  // replace modifier characters that are currently combining with a space
  // (sort of) with the lone combiner, so that they'll combine with the
  // following character instead, as intended.
  var modifiers_recombined = visible.replace(/([\u005E\u0060\u00A8\u00AF\u00B4\u00B8\u02B0-\u02FF])(.)/g, (_, modifier, modified) => {
    var combiner = modifier_to_combiner[modifier];
    if (combiner) {
      // if the next span was far enough away to be merit a space, this was
      // probably a horizontal-shift diacritic hack, and so it should combine
      // with the letter before it, not the space
      // TODO: I'm not sure about this: sometimes, the hack is just the
      // beginning of an entire span that's been shifted backward
      return (modified == ' ') ? combiner : (modified + combiner);
    }
    // if we can't find a matching combiner, return the original pair
    return modifier + modified;
  });
  // finally, canonicalize via unorm
  // NFKC: Compatibility Decomposition, followed by Canonical Composition
  return unorm.nfkc(modifiers_recombined);
}

/**
A FontDescriptor stream will sometimes map character codes to unicode character
codes, embedded as hexadecimal in a string prefixed by 'uni'. As far as I can
tell, these are always 4 characters (so: in the BMP).
*/
const glyphUniRegExp = /^uni([0-9A-F]+)$/;

/**
Use the glyphlist to convert an ASCII glyphname to the appropriate unicode
string, or via the special "uni<hexadecimal code>" specification format.
*/
export function decodeGlyphname(glyphname: string): string {
  var str = glyphlist[glyphname];
  if (str !== undefined) {
    return str;
  }

  var uniMatch = glyphname.match(glyphUniRegExp);
  if (uniMatch !== null) {
    var charCode = parseInt(uniMatch[1], 16);
    return String.fromCharCode(charCode);
  }
}
