/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var Token = lexing.Token;
var Arrays = require('../Arrays');
function parseHex(hexadecimal) {
    return parseInt(hexadecimal, 16);
}
function parseHexstring(hexstring, byteLength) {
    var charCodes = [];
    for (var i = 0; i < hexstring.length; i += byteLength) {
        var charHexadecimal = hexstring.slice(i, i + byteLength);
        charCodes.push(parseHex(charHexadecimal));
    }
    return Arrays.mkString(charCodes);
}
var default_rules = [
    [/^$/, function (match) { return Token('EOF'); }],
    [/^\s+/, function (match) { return null; }],
    [/^beginbfrange/, function (match) { return Token('START', 'BFRANGE'); }],
    [/^endbfrange/, function (match) { return Token('END', 'BFRANGE'); }],
    [/^begincodespacerange/, function (match) { return Token('START', 'CODESPACERANGE'); }],
    [/^endcodespacerange/, function (match) { return Token('END', 'CODESPACERANGE'); }],
    [/^beginbfchar/, function (match) { return Token('START', 'BFCHAR'); }],
    [/^endbfchar/, function (match) { return Token('END', 'BFCHAR'); }],
    [/^<</, function (match) { return Token('START', 'DICTIONARY'); }],
    [/^>>/, function (match) { return Token('END', 'DICTIONARY'); }],
    [/^\(/, function (match) { return Token('START', 'STRING'); }],
    [/^\)/, function (match) { return Token('END', 'STRING'); }],
    [/^\[/, function (match) { return Token('START', 'ARRAY'); }],
    [/^\]/, function (match) { return Token('END', 'ARRAY'); }],
    [/^<([A-Fa-f0-9 ]+)>/, function (match) {
        return Token('HEXSTRING', match[1].replace(/ /g, ''));
    }],
    [/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, function (match) { return Token('NAME', match[1]); }],
    [/^\w+/, function (match) { return Token('COMMAND', match[0]); }],
    [/^-?\d+/, function (match) { return Token('NUMBER', parseInt(match[0], 10)); }],
    [/^(.|\n|\r)/, function (match) { return Token('CHAR', match[0]); }],
];
var combiner_rules = [
    ['ARRAY', function (tokens) {
        return Token('ARRAY', tokens.map(function (token) { return token.value; }));
    }],
    ['STRING', function (tokens) {
        return Token('STRING', tokens.map(function (token) { return token.value; }).join(''));
    }],
    ['DICTIONARY', function (tokens) {
        return Token('DICTIONARY', tokens.map(function (token) { return token.value; }).join(''));
    }],
    ['CODESPACERANGE', function (tokens) {
        // tokens: [HEX, HEX]+
        var values = tokens.map(function (token) { return token.value; });
        var codespaceranges = [];
        for (var i = 0; i < values.length; i += 2) {
            codespaceranges.push(values.slice(i, i + 2));
        }
        return Token('CODESPACERANGES', codespaceranges);
    }],
    ['BFRANGE', function (tokens) {
        // tokens: [HEX, HEX, HEX | ARRAY<HEX>]+
        var values = tokens.map(function (token) { return token.value; });
        var bfranges = [];
        for (var i = 0; i < values.length; i += 3) {
            bfranges.push(values.slice(i, i + 3));
        }
        return Token('BFRANGES', bfranges);
    }],
    ['BFCHAR', function (tokens) {
        // tokens: [HEX, HEX]+
        var values = tokens.map(function (token) { return token.value; });
        var bfchars = [];
        for (var i = 0; i < values.length; i += 2) {
            bfchars.push(values.slice(i, i + 2));
        }
        return Token('BFCHARS', bfchars);
    }],
];
/**
Holds a mapping from in-PDF character codes to native Javascript Unicode strings.
*/
var CMap = (function () {
    function CMap(codeSpaces, mapping) {
        if (codeSpaces === void 0) { codeSpaces = []; }
        if (mapping === void 0) { mapping = []; }
        this.codeSpaces = codeSpaces;
        this.mapping = mapping;
    }
    Object.defineProperty(CMap.prototype, "byteLength", {
        /**
        0xFF -> 1
        0xFFFF -> 2
        0xFFFFFF -> 3
        0xFFFFFFFF -> 4
        */
        get: function () {
            var maxCharCode = Arrays.max(this.codeSpaces.map(function (codeSpace) { return codeSpace[1]; }));
            // return Math.ceil(Math.log2(maxCharCode) / 8);
            return Math.ceil((Math.log(maxCharCode) / Math.log(2)) / 8);
        },
        enumerable: true,
        configurable: true
    });
    CMap.prototype.addCodeSpace = function (start, end) {
        this.codeSpaces.push([start, end]);
    };
    CMap.prototype.addRangeOffset = function (start, end, offset) {
        for (var i = 0; (start + i) <= end; i++) {
            this.mapping[start + i] = Arrays.mkString([offset + i]);
        }
    };
    CMap.prototype.addRangeArray = function (start, end, array) {
        for (var i = 0; (start + i) <= end; i++) {
            this.mapping[start + i] = array[i];
        }
    };
    CMap.prototype.addChar = function (from, to) {
        this.mapping[from] = to;
    };
    CMap.parseStringIterable = function (string_iterable) {
        var parser = new CMapParser();
        return parser.parse(string_iterable);
    };
    return CMap;
})();
exports.CMap = CMap;
var CMapParser = (function () {
    function CMapParser() {
        this.tokenizer = new lexing.Tokenizer(default_rules);
        this.combiner = new lexing.Combiner(combiner_rules);
    }
    CMapParser.prototype.parse = function (iterable) {
        var token_iterator = this.tokenizer.map(iterable);
        var combined_iterator = this.combiner.map(token_iterator);
        var cmap = new CMap();
        while (1) {
            var token = combined_iterator.next();
            if (token.name === 'EOF') {
                break;
            }
            else if (token.name === 'CODESPACERANGES') {
                token.value.forEach(function (tuple) {
                    var start = parseHex(tuple[0]);
                    var end = parseHex(tuple[1]);
                    cmap.addCodeSpace(start, end);
                });
            }
            else if (token.name === 'BFRANGES') {
                token.value.forEach(function (triple) {
                    var start = parseHex(triple[0]);
                    var end = parseHex(triple[1]);
                    var arg = triple[2];
                    if (Array.isArray(arg)) {
                        // arg is an array of bytes
                        var array = arg.map(function (item) { return parseHexstring(item, 4); });
                        cmap.addRangeArray(start, end, array);
                    }
                    else {
                        var offset = parseHex(arg);
                        cmap.addRangeOffset(start, end, offset);
                    }
                });
            }
            else if (token.name === 'BFCHARS') {
                token.value.forEach(function (tuple) {
                    var from = parseHex(tuple[0]);
                    var to = parseHexstring(tuple[1], 4);
                    cmap.addChar(from, to);
                });
            }
        }
        return cmap;
    };
    return CMapParser;
})();
