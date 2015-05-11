/// <reference path="../type_declarations/index.d.ts" />
import lexing = require('lexing');
import logger = require('loge');

import Arrays = require('../Arrays');

var Rule = lexing.MachineRule;
var Token = lexing.Token;

function parseHex(hexadecimal: string): number {
  return parseInt(hexadecimal, 16);
}

function parseHexstring(hexstring: string, byteLength: number): string {
  var charCodes: number[] = [];
  for (var i = 0; i < hexstring.length; i += byteLength) {
    var charHexadecimal = hexstring.slice(i, i + byteLength);
    charCodes.push(parseHex(charHexadecimal));
  }
  return Arrays.mkString(charCodes);
}

var default_rules: lexing.RegexRule<any>[] = [
  [/^$/, match => Token('EOF') ],
  [/^\s+/, match => null ], // skip over whitespace
  // sections delimiters:
  [/^beginbfrange/, match => Token('START', 'BFRANGE') ],
  [/^endbfrange/, match => Token('END', 'BFRANGE') ],
  [/^begincodespacerange/, match => Token('START', 'CODESPACERANGE') ],
  [/^endcodespacerange/, match => Token('END', 'CODESPACERANGE') ],
  [/^beginbfchar/, match => Token('START', 'BFCHAR') ],
  [/^endbfchar/, match => Token('END', 'BFCHAR') ],
  // other complex types
  [/^<</, match => Token('START', 'DICTIONARY') ],
  [/^>>/, match => Token('END', 'DICTIONARY') ],
  [/^\(/, match => Token('START', 'STRING') ],
  [/^\)/, match => Token('END', 'STRING') ],
  [/^\[/, match => Token('START', 'ARRAY') ],
  [/^\]/, match => Token('END', 'ARRAY') ],
  // atomic types
  [/^<([A-Fa-f0-9 ]+)>/, match => {
    return Token('HEXSTRING', match[1].replace(/ /g, ''));
  }],
  // the rest of this we pretty much ignore
  [/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, match => Token('NAME', match[1]) ],
  [/^\w+/, match => Token('COMMAND', match[0]) ],
  [/^-?\d+/, match => Token('NUMBER', parseInt(match[0], 10)) ],
  [/^(.|\n|\r)/, match => Token('CHAR', match[0]) ],
];

var combiner_rules: lexing.CombinerRule<any, any>[] = [
  ['ARRAY', tokens => {
    return Token('ARRAY', tokens.map(token => token.value));
  }],
  ['STRING', tokens => {
    return Token('STRING', tokens.map(token => token.value).join(''));
  }],
  ['DICTIONARY', tokens => {
    return Token('DICTIONARY', tokens.map(token => token.value).join(''));
  }],
  ['CODESPACERANGE', tokens => {
    // tokens: [HEX, HEX]+
    var values = tokens.map(token => token.value);
    var codespaceranges = [];
    for (var i = 0; i < values.length; i += 2) {
      codespaceranges.push(values.slice(i, i + 2));
    }
    return Token('CODESPACERANGES', codespaceranges);
  }],
  // the typical BFRANGE looks like "<0000> <005E> <0020>"
  // the other kind of BFRANGE looks like "<005F> <0061> [<00660066> <00660069> <00660066006C>]"
  ['BFRANGE', tokens => {
    // tokens: [HEX, HEX, HEX | ARRAY<HEX>]+
    var values = tokens.map(token => token.value);
    var bfranges = [];
    for (var i = 0; i < values.length; i += 3) {
      bfranges.push(values.slice(i, i + 3));
    }
    return Token('BFRANGES', bfranges);
  }],
  // not sure how to parse a bfchar like this one:
  //    <0411><5168 fffd (fffd is repeated 32 times in total)>
  // String.fromCharCode(parseInt('D840', 16), parseInt('DC3E', 16))
  ['BFCHAR', tokens => {
    // tokens: [HEX, HEX]+
    var values = tokens.map(token => token.value);
    var bfchars = [];
    for (var i = 0; i < values.length; i += 2) {
      bfchars.push(values.slice(i, i + 2));
    }
    return Token('BFCHARS', bfchars);
  }],
];

type Range = [number, number];

/**
Holds a mapping from in-PDF character codes to native Javascript Unicode strings.

I'm not really sure how byteLength is determined.

Critical pair: P13-1145.pdf (byteLength: 2) vs. P13-4012.pdf (byteLength: 1)
*/
export class CMap {
  byteLength: number = 1;
  constructor(public codeSpaces: Range[] = [], public mapping: string[] = []) { }

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

  addCodeSpace(start: number, end: number): void {
    this.codeSpaces.push([start, end]);
  }
  addRangeOffset(start: number, end: number, offset: number): void {
    for (var i = 0; (start + i) <= end; i++) {
      this.mapping[start + i] = Arrays.mkString([offset + i]);
    }
  }
  addRangeArray(start: number, end: number, array: string[]): void {
    for (var i = 0; (start + i) <= end; i++) {
      this.mapping[start + i] = array[i];
    }
  }
  addChar(from: number, to: string): void {
    this.mapping[from] = to;
  }

  static parseStringIterable(string_iterable: lexing.StringIterable): CMap {
    var parser = new CMapParser();
    return parser.parse(string_iterable);
  }
}

class CMapParser {
  tokenizer = new lexing.Tokenizer(default_rules);
  combiner = new lexing.Combiner(combiner_rules);

  parse(iterable: lexing.StringIterable): CMap {
    var token_iterator = this.tokenizer.map(iterable);
    var combined_iterator = this.combiner.map(token_iterator);

    var cmap = new CMap();

    while (1) {
      var token = combined_iterator.next();

      if (token.name === 'EOF') {
        break;
      }
      else if (token.name === 'CODESPACERANGES') {
        token.value.forEach(tuple => {
          var start = parseHex(tuple[0]);
          var end = parseHex(tuple[1]);
          cmap.byteLength = tuple[1].length / 2;
          cmap.addCodeSpace(start, end);
        });
      }
      else if (token.name === 'BFRANGES') {
        token.value.forEach(triple => {
          var start = parseHex(triple[0]);
          var end = parseHex(triple[1]);
          var arg = triple[2];
          if (Array.isArray(arg)) {
            // arg is an array of bytes
            var array = arg.map(item => parseHexstring(item, 4));
            cmap.addRangeArray(start, end, array);
          }
          else {
            var offset = parseHex(arg);
            cmap.addRangeOffset(start, end, offset);
          }
        });
      }
      else if (token.name === 'BFCHARS') {
        token.value.forEach(tuple => {
          cmap.byteLength = tuple[0].length / 2;
          var from = parseHex(tuple[0]);
          var to = parseHexstring(tuple[1], 4);
          cmap.addChar(from, to);
        });
      }
    }

    return cmap;
  }
}
