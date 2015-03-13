/// <reference path="../type_declarations/index.d.ts" />
import _ = require('lodash');
import logger = require('loge');
import chalk = require('chalk');
import adts = require('adts');
import lexing = require('lexing');
var Token = lexing.Token;

import pdfdom = require('../pdfdom');
import PDF = require('../PDF');

// Rendering mode: see PDF32000_2008.pdf:9.3.6, Table 106
enum RenderingMode {
  Fill = 0,
  Stroke = 1,
  FillThenStroke = 2,
  None = 3,
  FillClipping = 4,
  StrokeClipping = 5,
  FillThenStrokeClipping = 6,
  NoneClipping = 7,
};

/**
Table 51: "Operator categories" (PDF32000_2008.pdf:8.2)

General graphics state: w, J, j, M, d, ri, i, gs
Special graphics state: q, Q, cm
Path construction: m, l, c, v, y, h, re
Path painting: S, s, f, F, f*, B, B*, b, b*, n
Clipping paths: W, W*
Text objects: BT, ET
Text state: Tc, Tw, Tz, TL, Tf, Tr, Ts
Text positioning: Td, TD, Tm, T*
Text showing: Tj, TJ, ', "
Type 3 fonts: d0, d1
Color: CS, cs, SC, SCN, sc, scn, G, g, RG, rg, K, k
Shading patterns: sh
Inline images: BI, ID, EI
XObjects: Do
Marked content: MP, DP, BMC, BDC, EMC
Compatibility: BX, EX

The "Text state", "Text positioning", and "Text showing" operators only apply between BT and ET markers.
*/
var operations = {
  // ---------------------------------------------------------------------------
  //            Text state operators (Tc, Tw, Tz, TL, Tf, Tr, Ts)
  //                     see PDF32000_2008.pdf:9.3.1
  Tc: function setCharacterSpacing(charSpace: number) {
    logger.debug(`[noop] setCharacterSpacing: ${charSpace}`);
  },
  Tw: function setWordSpacing(wordSpace: number) {
    logger.debug(`[noop] setWordSpacing: ${wordSpace}`);
  },
  Tz: function setHorizontalScape(scale: number) { // a percentage
    logger.debug(`[noop] setHorizontalScape: ${scale}`);
  },
  TL: function setLeading(leading: number) {
    logger.debug(`[noop] setLeading: ${leading}`);
  },
  Tf: function setFont(font: string, size: number) {
    logger.debug(`[noop] setFont: ${font} ${size}`);
  },
  Tr: function setRenderingMode(render: RenderingMode) { // render is a number
    logger.debug(`[noop] setRenderingMode: ${render}`);
  },
  Ts: function setRise(rise: number) {
    logger.debug(`[noop] setRise: ${rise}`);
  },
  // Text positioning operators (Td, TD, Tm, T*)
  Td: function adjustCurrentPosition(x: number, y: number) {
    // Move to the start of the next line, offset from the start of the current line by (tx, ty). tx and ty shall denote numbers expressed in unscaled text space units.
    // logger.debug(`[noop] adjustCurrentPosition: ${x} ${y}`);
    this.newline();
  },
  TD: function adjustCurrentPositionWithLeading(x: number, y: number) {
    logger.debug(`[noop] adjustCurrentPositionWithLeading: ${x} ${y}`);
  },
  Tm: function setMatrix(a: number, b: number, c: number, d: number, e: number, f: number) {
    logger.debug(`[noop] setMatrix: ${a} ${b} ${c} ${d} ${e} ${f}`);
  },
  'T*': function moveToStartOfNextLine() {
    // Move to the start of the next line. This operator has the same effect as the code
    // `0 -Tl Td`
    // where Tl denotes the current leading parameter in the text state. The
    // negative of Tl is used here because Tl is the text leading expressed as a
    // positive number. Going to the next line entails decreasing the y coordinate.
    var current_Tl = 0; // TODO: ???
    operations['Td'].call(this, 0, -current_Tl);
  },
  // Text showing operators (Tj, TJ, ', ")
  Tj: function showString(text: string) {
    // Show a text string.
    this.pushText(text);
  },
  TJ: function showStrings(array: Array<string | number>) {
    /**
    > Show one or more text strings, allowing individual glyph positioning. Each element of array shall be either a string or a number. If the element is a string, this operator shall show the string. If it is a number, the operator shall adjust the text position by that amount; that is, it shall translate the text matrix, Tm. The number shall be expressed in thousandths of a unit of text space (see 9.4.4, "Text Space Details"). This amount shall be subtracted from the current horizontal or vertical coordinate, depending on the writing mode. In the default coordinate system, a positive adjustment has the effect of moving the next glyph painted either to the left or down by the given amount. Figure 46 shows an example of the effect of passing offsets to TJ.

    In other words:
    - large negative numbers equate to spaces
    - small positive amounts equate to kerning hacks

    */
    var text = array.map(item => {
      var item_type = typeof item;
      if (item_type === 'string') {
        return item;
      }
      else if (item_type === 'number') {
        return (item < -100) ? ' ' : '';
      }
      else {
        throw new Error(`Unknown TJ argument type: ${item_type} (${item})`);
      }
    }).join('');
    this.pushText(text);
  },
  "'": function(text: string) {
    // Move to the next line and show a text string. This operator shall have the same effect as the code `T* string Tj`
    operations['T*'].call(this);
    operations['Tj'].call(this, text);
  },
  '"': function(wordSpace: number, charSpace: number, text: string) {
    // Move to the next line and show a text string, using aw as the word spacing and ac as the character spacing (setting the corresponding parameters in the text state). aw and ac shall be numbers expressed in unscaled text space units. This operator shall have the same effect as this code: `aw Tw ac Tc string '`
    operations['Tw'].call(this, wordSpace);
    operations['Tc'].call(this, charSpace);
    operations["'"].call(this, text);
  },
  // ---------------------------------------------------------------------------
  //                           Color operators
  RG: function setStrokeColor(r: number, g: number, b: number) {
    logger.debug(`[noop] setStrokeColor: ${r} ${g} ${b}`);
  },
  rg: function setFillColor(r: number, g: number, b: number) {
    logger.debug(`[noop] setFillColor: ${r} ${g} ${b}`);
  },
  G: function setStrokeGray(gray: number) {
    logger.debug(`[noop] setStrokeGray: ${gray}`);
  },
  g: function setFillGray(gray: number) {
    logger.debug(`[noop] setFillGray: ${gray}`);
  },
  // others ...
  Do: function drawObject(name: string) {
    this.pushName(name);
  },
};

var operators_escaped = 'w J j M d ri i gs q Q cm m l c v y h re S s f F f* B B* b b* n W W* BT ET Tc Tw Tz TL Tf Tr Ts Td TD Tm T* Tj TJ \' " d0 d1 CS cs SC SCN sc scn G g RG rg K k sh BI ID EI Do MP DP BMC BDC EMC BX EX'.split(' ').map(operator => operator.replace('*', '\\*'));
var operator_regex = new RegExp(`^(${operators_escaped.join('|')})`);

var default_rules: lexing.RegexRule<any>[] = [
  [/^$/, match => Token('EOF') ],
  // skip over whitespace
  [/^\s+/, match => null ],
  [/^\(/, function(match) {
    this.states.push('STRING');
    return Token('START', 'STRING');
  }],
  [/^\[/, function(match) {
    this.states.push('ARRAY');
    return Token('START', 'ARRAY');
  }],
  [/^(BT|ET)/, match => null ], // skip over BT and ET markers
  // all operators
  [operator_regex, match => Token('OPERATOR', match[0]) ],
  [/^\/(\w+)/, match => Token('OPERAND', match[1]) ],
  [/^-?[0-9]+\.[0-9]+/, match => Token('OPERAND', parseFloat(match[0])) ],
  [/^-?[0-9]+/, match => Token('OPERAND', parseInt(match[0], 10)) ],
  [/^\S+/, match => Token('OPERAND', match[0]) ],
];

var state_rules: {[index: string]: lexing.RegexRule<any>[]} = {};
state_rules['STRING'] = [
  [/^\)/, function(match) {
    this.states.pop();
    return Token('END', 'STRING');
  }],
  [/^\\(.)/, match => Token('CHAR', match[1]) ], // escaped character
  [/^(.|\n|\r)/, match => Token('CHAR', match[0]) ],
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
  [/^-?\d+\.\d+/, match => Token('NUMBER', parseFloat(match[0])) ],
  [/^-?\d+/, match => Token('NUMBER', parseInt(match[0], 10)) ],
  [/^(.|\n|\r)/, match => Token('CHAR', match[0]) ],
];

export interface Point {
  x: number;
  y: number;
}
export interface TextSpan {
  text: string;
  position?: Point;
}
export interface Reference {
  name: string;
}
export type DocumentElement = TextSpan | Reference;

/**
The text operators above will be called with an instance of DocumentBuilder
bound as `this`.
*/
export class DocumentBuilder {
  elements: Array<DocumentElement> = [];

  /**
  Add a new element, but return the element instead of the new length.

  The `pushElement<T extends DocumentElement>` version doesn't work.
  */
  // pushElement<T extends DocumentElement>(element: T): T {
  //   this.elements.push(element);
  //   return element;
  // }
  pushSpan(span: TextSpan): TextSpan {
    this.elements.push(span);
    return span;
  }
  pushName(name: string): void {
    this.elements.push({name: name});
  }

  get spans(): TextSpan[] {
    return <TextSpan[]>this.elements.filter(span => span['text']);
  }

  get current_span(): TextSpan {
    if (this.elements.length === 0) {
      return this.pushSpan({text: ''});
    }

    var last_element = this.elements[this.elements.length - 1];
    if (last_element['text'] !== undefined) {
      return <TextSpan>last_element;
    }

    return this.pushSpan({text: ''});
  }
  newline(): void {
    this.elements.push({text: ''});
  }
  pushText(text: string): void {
    this.current_span.text += text;
  }
  toString(): string {
    return this.spans.map(span => span.text).join('\n');
  }
}

export class TextParser {
  tokenizer = new lexing.Tokenizer(default_rules, state_rules);
  // lexing.CombinerRule<any, any>[]
  combiner = new lexing.Combiner<any>([
    ['STRING', tokens => Token('OPERAND', tokens.map(token => token.value).join('')) ],
    ['ARRAY', tokens => Token('OPERAND', tokens.map(token => token.value)) ],
  ]);

  parse(iterable: lexing.BufferIterable): DocumentBuilder {
    var token_iterator = this.tokenizer.map(iterable);
    var combined_iterator = this.combiner.map(token_iterator);

    var stack = [];
    var builder = new DocumentBuilder();

    while (1) {
      var token = combined_iterator.next();
      // console.log('%s: %j', chalk.green(token.name), token.value);

      if (token.name == 'OPERATOR') {
        var operation = operations[token.value];
        if (operation) {
          var expected_arguments = operation.length;
          var stack_arguments = stack.length;
          if (expected_arguments != stack_arguments) {
            logger.error(`Operator "${token.value}" expects ${expected_arguments} arguments, but received ${stack_arguments}: [${stack.join(', ')}]`);
          }
          operation.apply(builder, stack);
        }
        else {
          logger.error(`Unsupported operator: ${token.name}:${token.value}`);
          // throw new Error(`Unsupported operator: ${token.value}`);
        }
        // we've consumed everything on the stack; truncate it
        stack.length = 0;
      }
      else if (token.name == 'OPERAND') {
        stack.push(token.value);
      }
      else if (token.name == 'EOF') {
        break;
      }
      else {
        logger.warn(`Unrecognized token: ${token.name}:${token.value}`);
      }
    }

    return builder;
  }

  parseString(str: string): DocumentBuilder {
    return this.parse(lexing.BufferIterator.fromString(str));
  }
}
