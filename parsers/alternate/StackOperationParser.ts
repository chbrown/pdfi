/// <reference path="../type_declarations/index.d.ts" />
import lexing = require('lexing');
var Token = lexing.Token;

import Arrays = require('../Arrays');

type StackRule = lexing.RegexRule<any>;

// reusable rules:
var skip_whitespace_rule: StackRule = [/^\s+/, match => null ]; // skip over whitespace
var name_rule: StackRule = [/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, match => Token('NAME', match[1]) ]; // "/Im3" -> "Im3"
var float_rule: StackRule = [/^-?\d*\.\d+/, match => Token('NUMBER', parseFloat(match[0])) ];
var int_rule: StackRule = [/^-?\d+/, match => Token('NUMBER', parseInt(match[0], 10)) ];
var hexstring_rule: StackRule =  [/^<([A-Fa-f0-9 \r\n]*)>/, match => {
  var hexstring = match[1].replace(/\s+/g, '');
  var bytes = Arrays.range(hexstring.length, 2).map(i => parseInt(hexstring.slice(i, i + 2), 16));
  return Token('BYTES', bytes);
}];

// less generic, still reusable:
var start_string_rule: StackRule = [/^\(/, function(match) {
  this.states.push('STRING');
  return Token('START', 'STRING');
}];
var start_array_rule: StackRule = [/^\[/, function(match) {
  this.states.push('ARRAY');
  return Token('START', 'ARRAY');
}];
var start_dictionary_rule: StackRule = [/^<</, function(match) {
  this.states.push('DICTIONARY');
  return Token('START', 'DICTIONARY');
}];
var start_imagedata_rule: StackRule = [/^ID/, function(match) {
  this.states.push('IMAGEDATA');
  return Token('OPERATOR', match[0]);
}];

var default_rules: StackRule[] = [
  [/^$/, match => Token('EOF') ],
  skip_whitespace_rule,
  hexstring_rule,
  start_string_rule,
  start_array_rule,
  start_dictionary_rule, // dictionaries for Marked-content operators
  start_imagedata_rule, // Image data for inline images:
  name_rule,
  float_rule,
  int_rule,
  [/^%%EOF/, match => Token('EOF') ], // WTF?
  [/^[A-Za-z'"]+\*?/, match => Token('OPERATOR', match[0]) ],
];

var state_rules: {[index: string]: StackRule[]} = {};
state_rules['STRING'] = [
  [/^\)/, function(match) {
    this.states.pop();
    return Token('END', 'STRING');
  }],
  // escaped start and end parens (yes, this happens, see PDF32000_2008.pdf:9.4.3)
  // and escaped start and end braces (I guess to avoid array ambiguity?)
  [/^\\(\(|\)|\[|\])/, match => Token('CHAR', match[1].charCodeAt(0)) ],
  // escaped control characters; these are kind of weird, not sure if they're legitimate
  [/^\\n/, match => Token('CHAR', 10) ],
  [/^\\r/, match => Token('CHAR', 13) ],
  // escaped backslash
  [/^\\\\/, match => Token('CHAR', 92) ],
  // 3-digit octal character code
  [/^\\([0-8]{3})/, match => Token('CODE', parseInt(match[1], 8)) ],
  [/^(.|\n|\r)/, match => Token('CHAR', match[0].charCodeAt(0)) ],
];
state_rules['ARRAY'] = [
  [/^\]/, function(match) {
    this.states.pop();
    return Token('END', 'ARRAY');
  }],
  hexstring_rule,
  start_string_rule,
  skip_whitespace_rule,
  float_rule,
  int_rule,
  [/^(.|\n|\r)/, match => Token('CHAR', match[0]) ],
];
state_rules['DICTIONARY'] = [
  [/^>>/, function(match) {
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
  [/^EI/, function(match) {
    this.states.pop();
    return Token('OPERATOR', 'EI');
  }],
  // how to deal with non-operator "EI" strings that crop up in the ID value?
  [/^(\S+)/, match => Token('CHUNK', match[0]) ],
  [/^(.|\n|\r)/, match => Token('CHUNK', match[0]) ],
];

/**
TODO: I could probably refactor the stack tracking operations into a basic
token combiner with some clever zero-width Token('START', 'STACK') markers,
and Token('END', 'STACK') following all operator matches.
*/
class StackOperationParser {
  tokenizer = new lexing.Tokenizer(default_rules, state_rules, 1024);
  combiner = new lexing.Combiner<any>([
    // lexing.CombinerRule<any, any>[]
    ['STRING', tokens => Token('OPERAND', tokens.map(token => token.value)) ],
    ['ARRAY', tokens => Token('OPERAND', tokens.map(token => token.value)) ],
    ['DICTIONARY', tokens => Token('OPERAND', tokens.map(token => token.value)) ],
  ]);

  map(iterable: lexing.StringIterable): lexing.TokenIterable<any[]> {
    var token_iterator = this.tokenizer.map(iterable);
    var combined_iterator = this.combiner.map(token_iterator);
    return new StackOperationIterator(combined_iterator);
  }
}

/**
The tokens emitted by this iterator are named by the operator, and the value is
an Array (potentially empty) of the arguments leading up to that operator.
*/
class StackOperationIterator implements lexing.TokenIterable<any[]> {
  constructor(public iterable: lexing.TokenIterable<any>) { }
  next(): lexing.Token<any[]> {
    var stack = [];
    while (1) {
      var token = this.iterable.next();
      if (token.name === 'OPERATOR') {
        return Token(token.value, stack);
      }
      else if (token.name === 'EOF') {
        return token;
      }
      else { // if (token.name === 'OPERAND')
        stack.push(token.value);
      }
    }
  }
}

export = StackOperationParser;