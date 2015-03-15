/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var Token = lexing.Token;
var default_rules = [
    [/^$/, function (match) { return Token('EOF'); }],
    [/^\s+/, function (match) { return null; }],
    [/^\(/, function (match) {
        this.states.push('STRING');
        return Token('START', 'STRING');
    }],
    [/^\[/, function (match) {
        this.states.push('ARRAY');
        return Token('START', 'ARRAY');
    }],
    [/^\/(\w+)/, function (match) { return Token('OPERAND', match[1]); }],
    [/^-?\d+\.\d+/, function (match) { return Token('OPERAND', parseFloat(match[0])); }],
    [/^-?\d+/, function (match) { return Token('OPERAND', parseInt(match[0], 10)); }],
    [/^[A-Za-z'"]+\*?/, function (match) { return Token('OPERATOR', match[0]); }],
];
var state_rules = {};
state_rules['STRING'] = [
    [/^\)/, function (match) {
        this.states.pop();
        return Token('END', 'STRING');
    }],
    [/^\\(.)/, function (match) { return Token('CHAR', match[1]); }],
    [/^(.|\n|\r)/, function (match) { return Token('CHAR', match[0]); }],
];
state_rules['ARRAY'] = [
    [/^\]/, function (match) {
        this.states.pop();
        return Token('END', 'ARRAY');
    }],
    [/^\(/, function (match) {
        this.states.push('STRING');
        return Token('START', 'STRING');
    }],
    [/^-?\d+\.\d+/, function (match) { return Token('NUMBER', parseFloat(match[0])); }],
    [/^-?\d+/, function (match) { return Token('NUMBER', parseInt(match[0], 10)); }],
    [/^(.|\n|\r)/, function (match) { return Token('CHAR', match[0]); }],
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
            ['STRING', function (tokens) { return Token('OPERAND', tokens.map(function (token) { return token.value; }).join('')); }],
            ['ARRAY', function (tokens) { return Token('OPERAND', tokens.map(function (token) { return token.value; })); }],
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
