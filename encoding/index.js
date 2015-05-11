/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var logger = require('loge');
var unorm = require('unorm');
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
    a (sparse-ish) Array of strings mapping indices (character codes) to unicode
    strings (not glyphnames).
  
    `name` should be one of the following:
    * 'StandardEncoding'
    * 'MacRomanEncoding'
    * 'WinAnsiEncoding'
    * 'PDFDocEncoding'
    * 'MacExpertEncoding'
    */
    Encoding.prototype.mergeLatinCharset = function (name) {
        var _this = this;
        if (name == 'MacExpertEncoding') {
            logger.warn("Coercing \"MacExpertEncoding\" to \"MacRomanEncoding\" when merging Latin character set ");
            // TODO: handle MacExpertEncoding properly
            name = 'MacRomanEncoding';
        }
        // proceed, assuming that name is one of the base Latin character set names
        latin_charset.forEach(function (charspec) {
            var charCode = charspec[name];
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
    Encoding.latinCharsetNames = [
        'StandardEncoding',
        'MacRomanEncoding',
        'WinAnsiEncoding',
        'PDFDocEncoding',
        'MacExpertEncoding',
    ];
    return Encoding;
})();
exports.Encoding = Encoding;
/**
Modifiers modify the character after them. This is the PDF way.
Combiners modify the character before them. This is the Unicode way.

The Unicode modifier block is (0x02B0-0x02FF) = (688-767)
*/
var modifier_to_combiner = {
    '\u005E': '\u0302',
    '\u0060': '\u0300',
    '\u00A8': '\u0308',
    '\u00AF': '\u0304',
    '\u00B4': '\u0301',
    '\u00B8': '\u0327',
    '\u02C6': '\u0302',
    '\u02C7': '\u030C',
    '\u02CA': '\u0301',
    '\u02CB': '\u0300',
    '\u02D8': '\u0306',
    '\u02D9': '\u0307',
    '\u02DA': '\u030A',
    '\u02DB': '\u0328',
    '\u02DC': '\u0303',
    '\u02DD': '\u030B',
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
function normalize(raw) {
    // ensure that the only whitespace is SPACE
    // TODO: is this too draconian?
    var flattened = raw.replace(/\s+/g, ' ');
    // remove any other character codes 0 through 31 (space is 32 == 0x20)
    var visible = flattened.replace(/[\x00-\x1F]/g, '');
    // replace modifier characters that are currently combining with a space
    // (sort of) with the lone combiner, so that they'll combine with the
    // following character instead, as intended.
    var modifiers_recombined = visible.replace(/([\u005E\u0060\u00A8\u00AF\u00B4\u00B8\u02B0-\u02FF])(.)/g, function (_, modifier, modified) {
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
exports.normalize = normalize;
/**
A FontDescriptor stream will sometimes map character codes to unicode character
codes, embedded as hexadecimal in a string prefixed by 'uni'. As far as I can
tell, these are always 4 characters (so: in the BMP).
*/
var glyphUniRegExp = /^uni([0-9A-F]+)$/;
/**
Use the glyphlist to convert an ASCII glyphname to the appropriate unicode
string, or via the special "uni<hexadecimal code>" specification format.

Returns undefined when the glyphname is '.notdef' or cannot be found in the
glyphlist.
*/
function decodeGlyphname(glyphname) {
    if (glyphname == '.notdef') {
        return undefined;
    }
    var str = exports.glyphlist[glyphname];
    if (str !== undefined) {
        return str;
    }
    var uniMatch = glyphname.match(glyphUniRegExp);
    if (uniMatch !== null) {
        var charCode = parseInt(uniMatch[1], 16);
        return String.fromCharCode(charCode);
    }
}
exports.decodeGlyphname = decodeGlyphname;
