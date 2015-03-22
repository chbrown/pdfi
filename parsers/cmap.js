/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var Token = lexing.Token;
function parseHex(hexadecimal) {
    return parseInt(hexadecimal, 16);
}
function mkString(charCodes) {
    return String.fromCharCode.apply(null, charCodes);
}
function parseHexstring(hexstring, charWidth) {
    var charCodes = [];
    for (var i = 0; i < hexstring.length; i += charWidth) {
        var charHexadecimal = hexstring.slice(i, i + charWidth);
        charCodes.push(parseHex(charHexadecimal));
    }
    return mkString(charCodes);
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
var CMapParser = (function () {
    function CMapParser() {
        this.tokenizer = new lexing.Tokenizer(default_rules);
        this.combiner = new lexing.Combiner(combiner_rules);
    }
    /**
    Returns a mapping from in-PDF character codes to native Javascript Unicode strings
    */
    CMapParser.prototype.parse = function (iterable) {
        var token_iterator = this.tokenizer.map(iterable);
        var combined_iterator = this.combiner.map(token_iterator);
        var mapping = [];
        var applyBFRangeOffset = function (start, end, offset) {
            for (var i = 0; (start + i) <= end; i++) {
                mapping[start + i] = mkString([offset + i]);
            }
        };
        var applyBFRangeArray = function (start, end, array) {
            for (var i = 0; (start + i) <= end; i++) {
                mapping[start + i] = array[i];
            }
        };
        var applyBFChar = function (from, to) {
            mapping[from] = to;
        };
        while (1) {
            var token = combined_iterator.next();
            if (token.name === 'EOF') {
                break;
            }
            else if (token.name === 'CODESPACERANGES') {
                token.value.forEach(function (tuple) {
                    var start = parseHex(tuple[0]);
                    var end = parseHex(tuple[1]);
                });
            }
            else if (token.name === 'BFRANGES') {
                token.value.forEach(function (triple) {
                    var start = parseHex(triple[0]);
                    var end = parseHex(triple[1]);
                    var arg = triple[2];
                    if (Array.isArray(arg)) {
                        var array = arg.map(function (item) { return parseHexstring(item, 4); });
                        applyBFRangeArray(start, end, array);
                    }
                    else {
                        var offset = parseHex(arg);
                        applyBFRangeOffset(start, end, offset);
                    }
                });
            }
            else if (token.name === 'BFCHARS') {
                token.value.forEach(function (tuple) {
                    var from = parseHex(tuple[0]);
                    var to = parseHexstring(tuple[1], 4);
                    applyBFChar(from, to);
                });
            }
        }
        return mapping;
    };
    return CMapParser;
})();
exports.CMapParser = CMapParser;
