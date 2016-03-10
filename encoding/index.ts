import * as lexing from 'lexing';
import {nfkc} from 'unorm';

import {logger} from '../logger';
import {ContentStream} from '../models';
import {parseCMap} from '../parsers/index';

/**
glyphlist is a mapping from PDF glyph names to unicode strings
*/
import glyphlist from './glyphlist';

import latin_charset from './latin_charset';

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
  This loads the character codes listed in ./latin_charset into
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
      logger.warning(`Coercing "MacExpertEncoding" to "MacRomanEncoding" when merging Latin character set`);
      // TODO: handle MacExpertEncoding properly
      name = 'MacRomanEncoding';
    }
    // proceed, assuming that name is one of the base Latin character set names
    latin_charset.forEach(charspec => {
      const charCode: number = charspec[name];
      if (charCode !== null) {
        this.mapping[charCode] = glyphlist[charspec.glyphname];
      }
    });
  }

  /**
  This is called with a ToUnicode content stream for font types that specify one.
  */
  mergeCMapContentStream(contentStream: ContentStream): void {
    const string_iterable = lexing.StringIterator.fromBuffer(contentStream.buffer, 'ascii');
    const cMap = parseCMap(string_iterable);
    this.characterByteLength = cMap.byteLength;
    cMap.mappings.forEach(mapping => {
      this.mapping[mapping.src] = mapping.dst;
    });
  }

  /**
  Returns the character codes represented by the given bytes.

  `bytes` should all be in the range: 0 ≤ byte < 256
  */
  decodeCharCodes(buffer: Buffer): number[] {
    const charCodes: number[] = [];
    for (let offset = 0, length = buffer.length; offset < length; offset += this.characterByteLength) {
      const charCode = buffer.readUIntBE(offset, this.characterByteLength);
      charCodes.push(charCode);
    }
    return charCodes;
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

const PDFDoc = new Encoding();
PDFDoc.mergeLatinCharset('PDFDocEncoding');

/**
Modifiers modify the character after them. This is the PDF way.
Combiners modify the character before them. This is the Unicode way.

The Unicode modifier block is (0x02B0-0x02FF) = (688-767)
*/
const modifier_to_combiner = {
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
  const flattened = raw.replace(/\s+/g, ' ');
  // remove any other character codes 0 through 31 (space is 32 == 0x20)
  const visible = flattened.replace(/[\x00-\x1F]/g, '');
  // replace modifier characters that are currently combining with a space
  // (sort of) with the lone combiner, so that they'll combine with the
  // following character instead, as intended.
  const modifiers_recombined = visible.replace(/([\u005E\u0060\u00A8\u00AF\u00B4\u00B8\u02B0-\u02FF])(.)/g, (_, modifier, modified) => {
    const combiner = modifier_to_combiner[modifier];
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
  return nfkc(modifiers_recombined);
}

/**
A FontDescriptor stream will sometimes map character codes to unicode character
codes, embedded as hexadecimal in a string prefixed by 'uni'. As far as I can
tell, these are always 4 characters (so: in the BMP), and always capitalized.
*/
const glyphUniRegExp = /^uni([0-9A-F]+)$/;

/**
Similar to the 'uni' prefix, some fonts use 'char' prefixes. These always supply
the character code with two lowercase hexadecimal digits. They are handled in
exactly the same way as the 'uni'-prefixed glyph names.
*/
const glyphCharRegExp = /^char([0-9a-f]{2})$/;

/**
Use the glyphlist to convert an ASCII glyphname to the appropriate unicode
string, or via the special "uni<hexadecimal code>" specification format.

Returns undefined when the glyphname is '.notdef' or cannot be found in the
glyphlist.
*/
export function decodeGlyphname(glyphname: string): string {
  if (glyphname == '.notdef') {
    return undefined;
  }

  const str = glyphlist[glyphname];
  if (str !== undefined) {
    return str;
  }

  const uniMatch = glyphname.match(glyphUniRegExp);
  if (uniMatch !== null) {
    const charCode = parseInt(uniMatch[1], 16);
    return String.fromCharCode(charCode);
  }

  const charMatch = glyphname.match(glyphCharRegExp);
  if (charMatch !== null) {
    const charCode = parseInt(charMatch[1], 16);
    return String.fromCharCode(charCode);
  }
}

/**
Simpler special purpose version of something like https://github.com/substack/endian-toggle
*/
export function swapEndian(buffer: Buffer): Buffer {
  let byte: number;
  for (var i = 0, l = buffer.length - 1; i < l; i += 2) {
    byte = buffer[i];
    buffer[i] = buffer[i+1];
    buffer[i+1] = byte;
  }
  return buffer;
}

/**
Bytes that represent characters that shall be encoded using either
PDFDocEncoding or UTF-16BE with a leading byte-order marker. (PDF32000_2008.pdf:7.9.1)

You can also do some funny stuff with U+001B, which acts as an escape, for
signaling language codes. (PDF32000_2008.pdf:7.9.2.2)
*/
export function decodeBuffer(buffer: Buffer) {
  if (buffer[0] == 254 && buffer[1] == 255) {
    // UTF-16 (BE)
    return swapEndian(buffer).toString('utf16le');
  }
  else if (buffer[0] == 255 && buffer[1] == 254) {
    // UTF-16 (LE)
    // the docs say this is not valid in a PDF?
    // apparently Node.js will swallow the BOM even if I don't slice it off
    return buffer.slice(2).toString('utf16le');
  }
  return PDFDoc.decodeCharCodes(buffer).map(charCode => PDFDoc.decodeCharacter(charCode)).join('');
}
