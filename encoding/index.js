/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var Arrays = require('../Arrays');
var cmap = require('../parsers/cmap');
/**
glyphlist is a mapping from PDF glyph names to unicode strings
*/
exports.glyphlist = require('./glyphlist');
var latin_charset = require('./latin_charset');
/**
`bytes` should be Big-endian, e.g., [0xFF, 0x0F] is bigger than [0x0F, 0xFF]
`bytes` should be all in the range: [0, 256)

decodeNumber([0xFE]) => 254 == 0xFE
decodeNumber([0xFF, 0x0F]) => 65295 == 0xFF0F
decodeNumber([0xAD, 0x95, 0xCC]) => 11376076 == 0xAD95CC
*/
function decodeNumber(bytes) {
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
var Encoding = (function () {
    function Encoding(mapping, characterByteLength) {
        if (mapping === void 0) { mapping = []; }
        if (characterByteLength === void 0) { characterByteLength = 1; }
        this.mapping = mapping;
        this.characterByteLength = characterByteLength;
    }
    /**
    This loads the character codes listed in ./latin_charset.json into
    a (sparse?) Array of strings mapping indices (character codes) to unicode
    strings (not glyphnames).
  
    `base` should be one of 'std', 'mac', 'win', or 'pdf'
    */
    Encoding.prototype.mergeLatinCharset = function (base) {
        var _this = this;
        latin_charset.forEach(function (charspec) {
            var charCode = charspec[base];
            if (charCode !== null) {
                _this.mapping[charCode] = exports.glyphlist[charspec.glyphname];
            }
        });
    };
    /**
    This is called with a ToUnicode content stream for font types that specify one.
    */
    Encoding.prototype.mergeCMapContentStream = function (contentStream) {
        var _this = this;
        var string_iterable = lexing.StringIterator.fromBuffer(contentStream.buffer, 'ascii');
        var cMap = cmap.CMap.parseStringIterable(string_iterable);
        this.characterByteLength = cMap.byteLength;
        cMap.mapping.forEach(function (str, charCode) {
            if (str !== null && str !== undefined) {
                _this.mapping[charCode] = str;
            }
        });
    };
    /**
    Returns the character codes represented by the given bytes.
  
    `bytes` should all be in the range: 0 ≤ byte < 256
    */
    Encoding.prototype.decodeCharCodes = function (bytes) {
        return Arrays.groups(bytes, this.characterByteLength).map(decodeNumber);
    };
    /**
    Returns a native (unicode) Javascript string representing the given character
    codes. These character codes may have nothing to do with Latin-1, directly,
    but can be mapped to unicode via the Font dictionary's Encoding or ToUnicode
    fields, and can be assigned widths via the Font dictionary's Widths or
    BaseFont fields.
    */
    Encoding.prototype.decodeCharacter = function (charCode) {
        return this.mapping[charCode];
    };
    return Encoding;
})();
exports.Encoding = Encoding;
