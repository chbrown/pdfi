/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var Token = lexing.Token;
/**
range(10, 4) => [0, 4, 8]
range(12, 4) => [0, 4, 8]
range( 0, 4) => []
*/
function range(max, step) {
    if (step === void 0) { step = 1; }
    var length = Math.ceil(max / step);
    var indices = new Array(length);
    for (var i = 0; i < length; i++) {
        indices[i] = i * step;
    }
    return indices;
}
// reusable rules:
var skip_whitespace_rule = [/^\s+/, function (match) { return null; }]; // skip over whitespace
var name_rule = [/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, function (match) { return Token('NAME', match[1]); }]; // "/Im3" -> "Im3"
var float_rule = [/^-?\d*\.\d+/, function (match) { return Token('NUMBER', parseFloat(match[0])); }];
var int_rule = [/^-?\d+/, function (match) { return Token('NUMBER', parseInt(match[0], 10)); }];
var hexstring_rule = [/^<([A-Fa-f0-9 \r\n]*)>/, function (match) {
    var hexstring = match[1].replace(/\s+/g, '');
    var charCodes = range(hexstring.length, 4).map(function (i) { return parseInt(hexstring.slice(i, i + 4), 16); });
    return Token('OPERAND', charCodes);
}];
// less generic, still reusable:
var start_string_rule = [/^\(/, function (match) {
    this.states.push('STRING');
    return Token('START', 'STRING');
}];
var start_array_rule = [/^\[/, function (match) {
    this.states.push('ARRAY');
    return Token('START', 'ARRAY');
}];
var start_dictionary_rule = [/^<</, function (match) {
    this.states.push('DICTIONARY');
    return Token('START', 'DICTIONARY');
}];
var start_imagedata_rule = [/^ID/, function (match) {
    this.states.push('IMAGEDATA');
    return Token('OPERATOR', match[0]);
}];
var default_rules = [
    [/^$/, function (match) { return Token('EOF'); }],
    skip_whitespace_rule,
    hexstring_rule,
    start_string_rule,
    start_array_rule,
    start_dictionary_rule,
    start_imagedata_rule,
    name_rule,
    float_rule,
    int_rule,
    [/^%%EOF/, function (match) { return Token('EOF'); }],
    [/^[A-Za-z'"]+\*?/, function (match) { return Token('OPERATOR', match[0]); }],
];
var state_rules = {};
state_rules['STRING'] = [
    [/^\)/, function (match) {
        this.states.pop();
        return Token('END', 'STRING');
    }],
    [/^\\(\(|\)|\[|\])/, function (match) { return Token('CHAR', match[1].charCodeAt(0)); }],
    [/^\\n/, function (match) { return Token('CHAR', 10); }],
    [/^\\r/, function (match) { return Token('CHAR', 13); }],
    [/^\\\\/, function (match) { return Token('CHAR', 92); }],
    [/^\\([0-8]{3})/, function (match) { return Token('CODE', parseInt(match[1], 8)); }],
    [/^(.|\n|\r)/, function (match) { return Token('CHAR', match[0].charCodeAt(0)); }],
];
state_rules['ARRAY'] = [
    [/^\]/, function (match) {
        this.states.pop();
        return Token('END', 'ARRAY');
    }],
    hexstring_rule,
    start_string_rule,
    skip_whitespace_rule,
    float_rule,
    int_rule,
    [/^(.|\n|\r)/, function (match) { return Token('CHAR', match[0]); }],
];
state_rules['DICTIONARY'] = [
    [/^>>/, function (match) {
        this.states.pop();
        return Token('END', 'DICTIONARY');
    }],
    hexstring_rule,
    start_dictionary_rule,
    start_array_rule,
    start_string_rule,
    skip_whitespace_rule,
    name_rule,
    float_rule,
    int_rule,
];
state_rules['IMAGEDATA'] = [
    [/^EI/, function (match) {
        this.states.pop();
        return Token('OPERATOR', 'EI');
    }],
    [/^(\S+)/, function (match) { return Token('CHUNK', match[0]); }],
    [/^(.|\n|\r)/, function (match) { return Token('CHUNK', match[0]); }],
];
/**
TODO: I could probably refactor the stack tracking operations into a basic
token combiner with some clever zero-width Token('START', 'STACK') markers,
and Token('END', 'STACK') following all operator matches.
*/
var StackOperationParser = (function () {
    function StackOperationParser() {
        this.tokenizer = new lexing.Tokenizer(default_rules, state_rules);
        this.combiner = new lexing.Combiner([
            ['STRING', function (tokens) { return Token('OPERAND', tokens.map(function (token) { return token.value; })); }],
            ['ARRAY', function (tokens) { return Token('OPERAND', tokens.map(function (token) { return token.value; })); }],
            ['DICTIONARY', function (tokens) { return Token('OPERAND', tokens.map(function (token) { return token.value; })); }],
        ]);
    }
    StackOperationParser.prototype.map = function (iterable) {
        var token_iterator = this.tokenizer.map(iterable);
        var combined_iterator = this.combiner.map(token_iterator);
        return new StackOperationIterator(combined_iterator);
    };
    return StackOperationParser;
})();
/**
The tokens emitted by this iterator are named by the operator, and the value is
an Array (potentially empty) of the arguments leading up to that operator.
*/
var StackOperationIterator = (function () {
    function StackOperationIterator(iterable) {
        this.iterable = iterable;
    }
    StackOperationIterator.prototype.next = function () {
        var stack = [];
        while (1) {
            var token = this.iterable.next();
            if (token.name === 'OPERATOR') {
                return Token(token.value, stack);
            }
            else if (token.name === 'EOF') {
                return token;
            }
            else {
                stack.push(token.value);
            }
        }
    };
    return StackOperationIterator;
})();
module.exports = StackOperationParser;
