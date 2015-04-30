/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');

import cmap = require('../parsers/cmap');
import Arrays = require('../Arrays');

/**
glyphlist is a mapping from PDF glyph names to unicode strings
*/
export var glyphlist: {[index: string]: string} = require('./glyphlist');

interface CharacterSpecification {
  char: string;
  glyphname: string;
  std: number;
  mac: number;
  win: number;
  pdf: number;
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
export class Mapping {
  constructor(private _mapping: string[] = [], private _characterByteLength = 1) { }

  /**
  This loads the character codes listed in ./latin_charset.json into
  a (sparse?) Array of strings mapping indices (character codes) to unicode
  strings (not glyphnames).

  `base` should be one of 'std', 'mac', 'win', or 'pdf'
  */
  static fromLatinCharset(base: string): Mapping {
    var mapping: string[] = [];
    latin_charset.forEach(charspec => {
      var charCode: number = charspec[base];
      if (charCode !== null) {
        mapping[charspec[base]] = glyphlist[charspec.glyphname];
      }
    });
    return new Mapping(mapping);
  }

  static fromCMap(cMap: cmap.CMap): Mapping {
    return new Mapping(cMap.mapping, cMap.byteLength);
  }

  applyDifferences(differences: Array<number | string>): void {
    var current_character_code = 0;
    differences.forEach(difference => {
      if (typeof difference === 'number') {
        current_character_code = difference;
      }
      else {
        // difference is a glyph name, but we want a mapping from character
        // codes to native unicode strings, so we resolve the glyphname via the
        // PDF standard glyphlist
        // TODO: handle missing glyphnames
        this._mapping[current_character_code++] = glyphlist[difference];
      }
    });
  }

  /**
  Returns the character codes represented by the given bytes.

  `bytes` should all be in the range: 0 ≤ byte < 256
  */
  decodeCharCodes(bytes: number[]): number[] {
    return Arrays.groups(bytes, this._characterByteLength).map(decodeNumber);
  }

  /**
  Returns a native (unicode) Javascript string representing the given character
  codes. These character codes may have nothing to do with Latin-1, directly,
  but can be mapped to unicode via the Font dictionary's Encoding or ToUnicode
  fields, and can be assigned widths via the Font dictionary's Widths or
  BaseFont fields.
  */
  decodeCharacter(charCode: number): string {
    return this._mapping[charCode];
  }
}
