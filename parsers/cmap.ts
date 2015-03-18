/// <reference path="../type_declarations/index.d.ts" />
import lexing = require('lexing');
import logger = require('loge');
var Token = lexing.Token;

function parseHex(hexadecimal: string): number {
  return parseInt(hexadecimal, 16);
}

var default_rules: lexing.RegexRule<any>[] = [
  [/^$/, match => Token('EOF') ],
  [/^\s+/, match => null ], // skip over whitespace
  [/^beginbfrange/, function(match) {
    this.states.push('BFRANGE');
    // return Token('START', 'BFRANGE');
    return null;
  }],
  [/^begincodespacerange/, function(match) {
    this.states.push('CODESPACERANGE');
    // return Token('START', 'CODESPACERANGE');
    return null;
  }],
  [/^beginbfchar/, function(match) {
    this.states.push('BFCHAR');
    // return Token('START', 'BFCHAR');
    return null;
  }],
  [/^\/(\w+)/, match => Token('NAME', match[1]) ],
  [/^\w+/, match => Token('STRING', match[0]) ],
  [/^-?\d+/, match => Token('NUMBER', parseInt(match[0], 10)) ],
];

var state_rules: {[index: string]: lexing.RegexRule<any>[]} = {};
state_rules['CODESPACERANGE'] = [
  [/^endcodespacerange/, function(match) {
    this.states.pop();
    // return Token('END', 'CODESPACERANGE');
    return null;
  }],
  [/^\s+/, match => null ], // skip over whitespace
  [/^<(\w+)>\s*<(\w+)>/, match => {
    return Token('CODESPACERANGE', {
      start: parseHex(match[1]),
      end: parseHex(match[2]),
    });
  }],
];
state_rules['BFRANGE'] = [
  [/^endbfrange/, function(match) {
    this.states.pop();
    // return Token('END', 'BFRANGE');
    return null;
  }],
  [/^\s+/, match => null ], // skip over whitespace
  [/^<(\w+)>\s*<(\w+)>\s*<(\w+)>/, match => {
    return Token('BFRANGE', {
      start: parseHex(match[1]),
      end: parseHex(match[2]),
      offset: parseHex(match[3]),
    });
  }],
];
state_rules['BFCHAR'] = [
  [/^endbfchar/, function(match) {
    this.states.pop();
    // return Token('END', 'CODESPACERANGE');
    return null;
  }],
  [/^\s+/, match => null ], // skip over whitespace
  [/^<(\w+)>\s*<(\w+)>/, match => {
    // String.fromCharCode(parseInt('D840', 16), parseInt('DC3E', 16))
    return Token('BFCHAR', {
      from: parseInt(match[1], 16),
      to: match[2],
    });
  }],
];

export class CMapParser {
  tokenizer = new lexing.Tokenizer(default_rules, state_rules);

  /**
  Returns a mapping from in-PDF character codes to native Javascript Unicode strings
  */
  parse(iterable: lexing.StringIterable): string[] {
    var token_iterator = this.tokenizer.map(iterable);

    var mapping: string[] = [];

    while (1) {
      var token = token_iterator.next();
      if (token.name === 'EOF') {
        break;
      }
      // else if (token.name === 'CODESPACERANGE') {
      //   for (var charCode = token.value.start; charCode <= token.value.end; charCode++) {
      //     mapping[charCode] = String.fromCharCode(charCode);
      //   }
      // }
      else if (token.name === 'BFRANGE') {
        for (var i = 0; (token.value.start + i) <= token.value.end; i++) {
          mapping[token.value.start + i] = String.fromCharCode(token.value.offset + i);
        }
      }
      else if (token.name === 'BFCHAR') {
        var charCodes = token.value.to.match(/.{4}/g).map(parseHex);
        mapping[token.value.from] = String.fromCharCode.apply(null, charCodes);
      }
      // logger.info('%s => %j', token.name, token.value);
    }

    return mapping;
  }
}
