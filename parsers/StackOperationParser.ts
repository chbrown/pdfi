/// <reference path="../type_declarations/index.d.ts" />
import lexing = require('lexing');
var Token = lexing.Token;

var default_rules: lexing.RegexRule<any>[] = [
  [/^$/, match => Token('EOF') ],
  [/^\s+/, match => null ], // skip over whitespace
  [/^\(/, function(match) {
    this.states.push('STRING');
    return Token('START', 'STRING');
  }],
  [/^\[/, function(match) {
    this.states.push('ARRAY');
    return Token('START', 'ARRAY');
  }],
  [/^\/(\w+)/, match => Token('OPERAND', match[1]) ], // "/Im3" -> "Im3"
  [/^-?\d*\.\d+/, match => Token('OPERAND', parseFloat(match[0])) ],
  [/^-?\d+/, match => Token('OPERAND', parseInt(match[0], 10)) ],
  [/^[A-Za-z'"]+\*?/, match => Token('OPERATOR', match[0]) ],
];

var state_rules: {[index: string]: lexing.RegexRule<any>[]} = {};
state_rules['STRING'] = [
  [/^\)/, function(match) {
    this.states.pop();
    return Token('END', 'STRING');
  }],
  // escaped start and end parens (yes, this happens)
  // and escaped start and end braces (I guess to avoid array ambiguity?)
  [/^\\(\(|\)|\[|\])/, match => Token('CHAR', match[1].charCodeAt(0)) ],
  // escaped control characters; these are kind of weird.
  [/^\\n/, match => Token('CHAR', 10) ],
  [/^\\r/, match => Token('CHAR', 13) ],
  // 3-digit octal character code
  [/^\\([0-8]{3})/, match => Token('CODE', parseInt(match[1], 8)) ],
  [/^(.|\n|\r)/, match => Token('CHAR', match[0].charCodeAt(0)) ],
];
state_rules['ARRAY'] = [
  [/^\]/, function(match) {
    this.states.pop();
    return Token('END', 'ARRAY');
  }],
  [/^\(/, function(match) {
    this.states.push('STRING');
    return Token('START', 'STRING');
  }],
  [/^\s+/, match => null ], // skip over whitespace
  [/^-?\d*\.\d+/, match => Token('NUMBER', parseFloat(match[0])) ],
  [/^-?\d+/, match => Token('NUMBER', parseInt(match[0], 10)) ],
  [/^(.|\n|\r)/, match => Token('CHAR', match[0]) ],
];

/**
TODO: I could probably refactor the stack tracking operations into a basic
token combiner with some clever zero-width Token('START', 'STACK') markers,
and Token('END', 'STACK') following all operator matches.
*/
class StackOperationParser {
  tokenizer = new lexing.Tokenizer(default_rules, state_rules);
  combiner = new lexing.Combiner<any>([
    // lexing.CombinerRule<any, any>[]
    ['STRING', tokens => Token('OPERAND', tokens.map(token => token.value)) ],
    ['ARRAY', tokens => Token('OPERAND', tokens.map(token => token.value)) ],
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
