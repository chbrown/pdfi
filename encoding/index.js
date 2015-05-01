var Arrays = require('../Arrays');
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
var Mapping = (function () {
    function Mapping(mapping, characterByteLength) {
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
    Mapping.fromLatinCharset = function (base) {
        var mapping = [];
        latin_charset.forEach(function (charspec) {
            var charCode = charspec[base];
            if (charCode !== null) {
                mapping[charspec[base]] = exports.glyphlist[charspec.glyphname];
            }
        });
        return new Mapping(mapping);
    };
    Mapping.fromCMap = function (cMap) {
        return new Mapping(cMap.mapping, cMap.byteLength);
    };
    Mapping.prototype.applyDifferences = function (differences) {
        var _this = this;
        var current_character_code = 0;
        differences.forEach(function (difference) {
            if (typeof difference === 'number') {
                current_character_code = difference;
            }
            else {
                // difference is a glyph name, but we want a mapping from character
                // codes to native unicode strings, so we resolve the glyphname via the
                // PDF standard glyphlist
                // TODO: handle missing glyphnames
                _this.mapping[current_character_code++] = exports.glyphlist[difference];
            }
        });
    };
    /**
    Returns the character codes represented by the given bytes.
  
    `bytes` should all be in the range: 0 ≤ byte < 256
    */
    Mapping.prototype.decodeCharCodes = function (bytes) {
        return Arrays.groups(bytes, this.characterByteLength).map(decodeNumber);
    };
    /**
    Returns a native (unicode) Javascript string representing the given character
    codes. These character codes may have nothing to do with Latin-1, directly,
    but can be mapped to unicode via the Font dictionary's Encoding or ToUnicode
    fields, and can be assigned widths via the Font dictionary's Widths or
    BaseFont fields.
    */
    Mapping.prototype.decodeCharacter = function (charCode) {
        return this.mapping[charCode];
    };
    return Mapping;
})();
exports.Mapping = Mapping;