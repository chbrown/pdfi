/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var util = require('../util');
var Rule = lexing.MachineRule;
var Token = lexing.Token;
var default_rules = [
    [/^$/, function (match) { return Token('EOF'); }],
    [/^\s+/, function (match) { return null; }],
    // sections delimiters:
    [/^beginbfrange/, function (match) { return Token('START', 'BFRANGE'); }],
    [/^endbfrange/, function (match) { return Token('END', 'BFRANGE'); }],
    [/^begincodespacerange/, function (match) { return Token('START', 'CODESPACERANGE'); }],
    [/^endcodespacerange/, function (match) { return Token('END', 'CODESPACERANGE'); }],
    [/^beginbfchar/, function (match) { return Token('START', 'BFCHAR'); }],
    [/^endbfchar/, function (match) { return Token('END', 'BFCHAR'); }],
    // other complex types
    [/^<</, function (match) { return Token('START', 'DICTIONARY'); }],
    [/^>>/, function (match) { return Token('END', 'DICTIONARY'); }],
    [/^\(/, function (match) { return Token('START', 'STRING'); }],
    [/^\)/, function (match) { return Token('END', 'STRING'); }],
    [/^\[/, function (match) { return Token('START', 'ARRAY'); }],
    [/^\]/, function (match) { return Token('END', 'ARRAY'); }],
    // atomic types
    [/^<([A-Fa-f0-9 ]+)>/, function (match) {
            return Token('HEXSTRING', match[1].replace(/ /g, ''));
        }],
    // the rest of this we pretty much ignore
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
    // the typical BFRANGE looks like "<0000> <005E> <0020>"
    //   which means map 0000 -> 0020, 0001 -> 0021, 0002 -> 0022, and so on, up to 005E -> 007E
    // the other kind of BFRANGE looks like "<005F> <0061> [<00660066> <00660069> <00660066006C>]"
    ['BFRANGE', function (tokens) {
            // tokens: [HEX, HEX, HEX | ARRAY<HEX>]+
            var values = tokens.map(function (token) { return token.value; });
            var bfranges = [];
            for (var i = 0; i < values.length; i += 3) {
                bfranges.push(values.slice(i, i + 3));
            }
            return Token('BFRANGES', bfranges);
        }],
    // not sure how to parse a bfchar like this one:
    //    <0411><5168 fffd (fffd is repeated 32 times in total)>
    // String.fromCharCode(parseInt('D840', 16), parseInt('DC3E', 16))
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

I'm not really sure how byteLength is determined.

Critical pair: P13-1145.pdf (byteLength: 2) vs. P13-4012.pdf (byteLength: 1)
*/
var CMap = (function () {
    function CMap(codeSpaces, mapping) {
        if (codeSpaces === void 0) { codeSpaces = []; }
        if (mapping === void 0) { mapping = []; }
        this.codeSpaces = codeSpaces;
        this.mapping = mapping;
        this.byteLength = 1;
    }
    // /**
    // 0xFF -> 1
    // 0xFFFF -> 2
    // 0xFFFFFF -> 3
    // 0xFFFFFFFF -> 4
    // */
    // get byteLength(): number {
    //   var maxCharCode = Arrays.max(this.codeSpaces.map(codeSpace => codeSpace[1]))
    //   // var maxCharCode = this.mapping.length;
    //   // return Math.ceil(Math.log2(maxCharCode) / 8);
    //   return Math.ceil((Math.log(maxCharCode) / Math.log(2)) / 8);
    // }
    CMap.prototype.addCodeSpace = function (start, end) {
        this.codeSpaces.push([start, end]);
    };
    CMap.prototype.addRangeOffset = function (start, end, charCodes) {
        /* if I'm interpreting PDF32000_2008.pdf:9.10.3 correctly, we can be lazy
        in incrementing the offset. It reads:
        > When defining ranges of this type, the value of the last byte in the
        > string shall be less than or equal to 255 - (end - start). This ensures
        > that the last byte of the string shall not be incremented past 255;
        > otherwise, the result of mapping is undefined.
        */
        var headCharCodes = charCodes.slice(0, -1);
        var lastCharCode = charCodes[charCodes.length - 1];
        for (var i = 0; (start + i) <= end; i++) {
            var offset = headCharCodes.concat(lastCharCode + i);
            this.mapping[start + i] = util.makeString(offset);
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
                    var start = parseInt(tuple[0], 16);
                    var end = parseInt(tuple[1], 16);
                    cmap.byteLength = tuple[1].length / 2;
                    cmap.addCodeSpace(start, end);
                });
            }
            else if (token.name === 'BFRANGES') {
                token.value.forEach(function (triple) {
                    var start = parseInt(triple[0], 16);
                    var end = parseInt(triple[1], 16);
                    var arg = triple[2];
                    if (Array.isArray(arg)) {
                        // arg is an array of bytes
                        var array = arg.map(function (item) { return util.makeString(util.parseHexCodes(item, 4)); });
                        cmap.addRangeArray(start, end, array);
                    }
                    else {
                        // TODO: can we just assume 4?
                        var offset = util.parseHexCodes(arg, 4);
                        cmap.addRangeOffset(start, end, offset);
                    }
                });
            }
            else if (token.name === 'BFCHARS') {
                token.value.forEach(function (tuple) {
                    cmap.byteLength = tuple[0].length / 2;
                    var from = parseInt(tuple[0], 16);
                    var to = util.makeString(util.parseHexCodes(tuple[1], 4));
                    cmap.addChar(from, to);
                });
            }
        }
        return cmap;
    };
    return CMapParser;
})();
