/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var Token = lexing.Token;
// reusable rules:
var skip_whitespace_rule = [/^\s+/, function (match) { return null; }]; // skip over whitespace
var name_rule = [/^\/(\w+)/, function (match) { return Token('OPERAND', match[1]); }]; // "/Im3" -> "Im3"
var float_rule = [/^-?\d*\.\d+/, function (match) { return Token('NUMBER', parseFloat(match[0])); }];
var int_rule = [/^-?\d+/, function (match) { return Token('NUMBER', parseInt(match[0], 10)); }];
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
var default_rules = [
    [/^$/, function (match) { return Token('EOF'); }],
    skip_whitespace_rule,
    [/^<([A-Fa-f0-9]+)>/, function (match) {
        // handle implied final 0 (PDF32000_2008.pdf:16)
        // by adding 0 character to end of odd-length strings
        var hexstring = match[1];
        // var padded = (hexstring.length % 2 === 0) ? hexstring : hexstring + '0';
        // TODO: I think that the byte-width of each character depends on the font?
        // assuming it's four is a hack.
        // var bytes = new Buffer('0078', 'hex'); b.readInt16BE(0) ... ;
        var bytes = hexstring.match(/.{4}/g).map(function (pair) { return parseInt(pair, 16); });
        return Token('OPERAND', bytes);
    }],
    start_string_rule,
    start_array_rule,
    start_dictionary_rule,
    name_rule,
    float_rule,
    int_rule,
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
    start_dictionary_rule,
    start_string_rule,
    skip_whitespace_rule,
    name_rule,
    float_rule,
    int_rule,
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
