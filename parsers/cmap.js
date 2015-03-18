/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var Token = lexing.Token;
function parseHex(hexadecimal) {
    return parseInt(hexadecimal, 16);
}
var default_rules = [
    [/^$/, function (match) { return Token('EOF'); }],
    [/^\s+/, function (match) { return null; }],
    [/^beginbfrange/, function (match) {
        this.states.push('BFRANGE');
        // return Token('START', 'BFRANGE');
        return null;
    }],
    [/^begincodespacerange/, function (match) {
        this.states.push('CODESPACERANGE');
        // return Token('START', 'CODESPACERANGE');
        return null;
    }],
    [/^beginbfchar/, function (match) {
        this.states.push('BFCHAR');
        // return Token('START', 'BFCHAR');
        return null;
    }],
    [/^\/(\w+)/, function (match) { return Token('NAME', match[1]); }],
    [/^\w+/, function (match) { return Token('STRING', match[0]); }],
    [/^-?\d+/, function (match) { return Token('NUMBER', parseInt(match[0], 10)); }],
];
var state_rules = {};
state_rules['CODESPACERANGE'] = [
    [/^endcodespacerange/, function (match) {
        this.states.pop();
        // return Token('END', 'CODESPACERANGE');
        return null;
    }],
    [/^\s+/, function (match) { return null; }],
    [/^<(\w+)>\s*<(\w+)>/, function (match) {
        return Token('CODESPACERANGE', {
            start: parseHex(match[1]),
            end: parseHex(match[2]),
        });
    }],
];
state_rules['BFRANGE'] = [
    [/^endbfrange/, function (match) {
        this.states.pop();
        // return Token('END', 'BFRANGE');
        return null;
    }],
    [/^\s+/, function (match) { return null; }],
    [/^<(\w+)>\s*<(\w+)>\s*<(\w+)>/, function (match) {
        return Token('BFRANGE', {
            start: parseHex(match[1]),
            end: parseHex(match[2]),
            offset: parseHex(match[3]),
        });
    }],
];
state_rules['BFCHAR'] = [
    [/^endbfchar/, function (match) {
        this.states.pop();
        // return Token('END', 'CODESPACERANGE');
        return null;
    }],
    [/^\s+/, function (match) { return null; }],
    [/^<(\w+)>\s*<(\w+)>/, function (match) {
        // String.fromCharCode(parseInt('D840', 16), parseInt('DC3E', 16))
        return Token('BFCHAR', {
            from: parseInt(match[1], 16),
            to: match[2],
        });
    }],
];
var CMapParser = (function () {
    function CMapParser() {
        this.tokenizer = new lexing.Tokenizer(default_rules, state_rules);
    }
    /**
    Returns a mapping from in-PDF character codes to native Javascript Unicode strings
    */
    CMapParser.prototype.parse = function (iterable) {
        var token_iterator = this.tokenizer.map(iterable);
        var mapping = [];
        while (1) {
            var token = token_iterator.next();
            if (token.name === 'EOF') {
                break;
            }
            else if (token.name === 'BFRANGE') {
                for (var i = 0; (token.value.start + i) <= token.value.end; i++) {
                    mapping[token.value.start + i] = String.fromCharCode(token.value.offset + i);
                }
            }
            else if (token.name === 'BFCHAR') {
                var charCodes = token.value.to.match(/.{4}/g).map(parseHex);
                mapping[token.value.from] = String.fromCharCode.apply(null, charCodes);
            }
        }
        return mapping;
    };
    return CMapParser;
})();
exports.CMapParser = CMapParser;
