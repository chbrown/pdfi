/// <reference path="../type_declarations/index.d.ts" />
import * as logger from 'loge';
import * as lexing from 'lexing';
import * as Arrays from '../Arrays';
var Rule = lexing.MachineRule;
// var State = lexing.MachineState; // MachineState<ResultType, InternalType>

function parseHex(raw: string): number[] {
  let hexstring = raw.replace(/\s+/g, '');
  return Arrays.range(hexstring.length, 2).map(i => parseInt(hexstring.slice(i, i + 2), 16));
}

let escapeCharCodes = {
  '\\n': 10,
  '\\r': 13,
  '\\\\': 92,
}

/**
BYTESTRING is parens-delimited
*/
export class BYTESTRING extends lexing.MachineState<number[], number[]> {
  protected value = [];
  rules = [
    Rule(/^\)/, this.pop),
    // escaped start and end parens (yes, this happens, see PDF32000_2008.pdf:9.4.3)
    // and escaped start and end braces (I guess to avoid array ambiguity?)
    Rule(/^\\(\(|\)|\[|\])/, this.captureGroup),
    // escaped control characters; these are kind of weird, not sure if they're legitimate
    Rule(/^\\(n|r)/, this.captureEscape),
    // escaped backslash
    Rule(/^\\\\/, this.captureEscape),
    // 3-digit octal character code
    Rule(/^\\([0-8]{3})/, this.captureOct),
    Rule(/^(.|\n|\r)/, this.captureGroup),
  ]
  captureGroup(matchValue: RegExpMatchArray) {
    this.value.push(matchValue[1].charCodeAt(0));
    return undefined;
  }
  captureEscape(matchValue: RegExpMatchArray) {
    this.value.push(escapeCharCodes[matchValue[0]]);
    return undefined;
  }
  captureOct(matchValue: RegExpMatchArray) {
    this.value.push(parseInt(matchValue[1], 8));
    return undefined;
  }
}

export class IMAGEDATA extends lexing.MachineState<string, string[]> {
  protected value = [];
  rules = [
    // TODO: deal with non-operator "EI" strings that crop up in the ID value better.
    // Right now, I'm just assuming that they won't have whitespace before them.
    Rule(/^EI/, this.pop),
    Rule(/^(\S+)/, this.captureGroup),
    Rule(/^(.|\n|\r)/, this.captureGroup),
  ]
  captureGroup(matchValue: RegExpMatchArray) {
    this.value.push(matchValue[1]);
    return undefined;
  }
  pop(): string {
    return this.value.join('');
  }
}

class Collection<T, I> extends lexing.MachineState<T, I> {
  push(value: any) {
    throw new Error('Abstract method');
  }
  captureHex(matchValue: RegExpMatchArray) {
    this.push(parseHex(matchValue[1]));
    return undefined;
  }
  captureDictionary(matchValue: RegExpMatchArray) {
    var dictionary = this.attachState(DICTIONARY).read();
    this.push(dictionary);
    return undefined;
  }
  captureArray(matchValue: RegExpMatchArray) {
    var array = this.attachState(ARRAY).read();
    this.push(array);
    return undefined;
  }
  captureString(matchValue: RegExpMatchArray) {
    var string = this.attachState(BYTESTRING).read();
    this.push(string);
    return undefined;
  }
  captureName(matchValue: RegExpMatchArray) {
    this.push(matchValue[1]);
    return undefined;
  }
  captureBoolean(matchValue: RegExpMatchArray) {
    this.push(matchValue[0] === 'true');
    return undefined;
  }
  captureFloat(matchValue: RegExpMatchArray) {
    this.push(parseFloat(matchValue[0]));
    return undefined;
  }
  captureInt(matchValue: RegExpMatchArray) {
    this.push(parseInt(matchValue[0], 10));
    return undefined;
  }
}

var content_stream_operator_aliases = {
  // General graphics state
  'w': 'setLineWidth',
  'J': 'setLineCap',
  'j': 'setLineJoin',
  'M': 'setMiterLimit',
  'd': 'setDashPattern',
  'ri': 'setRenderingIntent',
  'i': 'setFlatnessTolerance',
  'gs': 'setGraphicsStateParameters',
  // Special graphics state
  'q': 'pushGraphicsState',
  'Q': 'popGraphicsState',
  'cm': 'setCTM',
  // Path construction
  'm': 'moveTo',
  'l': 'appendLine',
  'c': 'appendCurve123',
  'v': 'appendCurve23',
  'y': 'appendCurve13',
  'h': 'closePath',
  're': 'appendRectangle',
  // Path painting
  'S': 'stroke',
  's': 'closeAndStroke',
  'f': 'fill',
  'F': 'fillCompat',
  'f*': 'fillEvenOdd',
  'B': 'fillThenStroke',
  'B*': 'fillThenStrokeEvenOdd',
  'b': 'closeAndFillThenStroke',
  'b*': 'closeAndFillThenStrokeEvenOdd',
  'n': 'closePathNoop',
  // Clipping paths
  'W': 'clip',
  'W*': 'clipEvenOdd',
  // Text objects
  'BT': 'startTextBlock',
  'ET': 'endTextBlock',
  // Text state
  'Tc': 'setCharSpacing',
  'Tw': 'setWordSpacing',
  'Tz': 'setHorizontalScale',
  'TL': 'setLeading',
  'Tf': 'setFont',
  'Tr': 'setRenderingMode',
  'Ts': 'setRise',
  // Text positioning
  'Td': 'adjustCurrentPosition',
  'TD': 'adjustCurrentPositionWithLeading',
  'Tm': 'setTextMatrix',
  'T*': 'newLine',
  // Text showing
  'Tj': 'showString',
  'TJ': 'showStrings',
  "'": 'newLineAndShowString',
  '"': 'newLineAndShowStringWithSpacing',
  // Type 3 fonts (incomplete implementation)
  'd0': 'setType3FontCharWidthShapeColor',
  'd1': 'setType3FontCharWidthShape',
  // Color
  'CS': 'setStrokeColorSpace',
  'cs': 'setFillColorSpace',
  'SC': 'setStrokeColorSpace2',
  'SCN': 'setStrokeColorSpace3',
  'sc': 'setFillColorSpace2',
  'scn': 'setFillColorSpace3',
  'G': 'setStrokeGray',
  'g': 'setFillGray',
  'RG': 'setStrokeColor',
  'rg': 'setFillColor',
  'K': 'setStrokeCMYK',
  'k': 'setFillCMYK',
  // Shading patterns
  'sh': 'shadingPattern',
  // Inline images (incomplete implementation)
  'BI': 'beginInlineImage',
  // ID is specially handled
  'EI': 'endInlineImage',
  // XObjects
  'Do': 'drawObject',
  // Marked content (incomplete implementation)
  'MP': 'designatedMarkedContentPoint',
  'DP': 'designatedMarkedContentPointProperties',
  'BMC': 'beginMarkedContent',
  'BDC': 'beginMarkedContentWithDictionary',
  'EMC': 'endMarkedContent',
  // Compatibility (incomplete implementation)
  'BX': 'beginCompatibility',
  'EX': 'endCompatibility',
};

export interface ContentStreamOperation {
  operands: any[];
  operator: string; // should be one of the keys of content_stream_operator_aliases
  alias?: string; // should be one of the values of content_stream_operator_aliases
}

export class CONTENT_STREAM extends Collection<ContentStreamOperation[], ContentStreamOperation[]> {
  protected value: ContentStreamOperation[] = [];
  private stack: any[] = [];
  rules = [
    Rule(/^$/, this.pop),
    Rule(/^\s+/, this.ignore),
    Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
    Rule(/^<</, this.captureDictionary), // dictionaries for Marked-content operators
    Rule(/^\[/, this.captureArray),
    Rule(/^\(/, this.captureString),
    Rule(/^ID/, this.captureImageData), // Image data for inline images:
    Rule(/^(true|false)/, this.captureBoolean),
    Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
    Rule(/^-?\d*\.\d+/, this.captureFloat),
    Rule(/^-?\d+/, this.captureInt),
    Rule(/^%%EOF/, this.ignore), // WTF?
    // maybe create a regex based on the valid operators?
    Rule(/^[A-Za-z'"]+\*?/, this.captureOperator),
  ]
  captureOperator(matchValue: RegExpMatchArray) {
    this.value.push({
      operands: this.stack,
      operator: matchValue[0],
      alias: content_stream_operator_aliases[matchValue[0]],
    });
    if (content_stream_operator_aliases[matchValue[0]] === undefined) {
      logger.warn('Unaliased operator: %j', matchValue[0]);
    }
    this.stack = [];
  }
  push(value: any) {
    this.stack.push(value);
  }
  captureImageData(matchValue: RegExpMatchArray) {
    // var image_data = new IMAGEDATA(this.iterable).read();
    // TODO: Figure out why TypeScript can't infer the type of image_data with
    // the following syntax:
    var image_data = this.attachState(IMAGEDATA).read();
    // EI is what triggers the IMAGEDATA state pop
    this.push(image_data);
    this.value.push({
      operands: this.stack,
      operator: 'EI',
      alias: content_stream_operator_aliases['EI'],
    });
    this.stack = [];
  }
}

export class ARRAY extends Collection<any[], any[]> {
  protected value = [];
  rules = [
    Rule(/^\]/, this.pop),
    Rule(/^\s+/, this.ignore),
    Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
    Rule(/^\(/, this.captureString),
    Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
    Rule(/^-?\d*\.\d+/, this.captureFloat),
    Rule(/^-?\d+/, this.captureInt),
  ]
  push(value: any) {
    this.value.push(value);
  }
}

export class DICTIONARY extends Collection<any[], any[]> {
  protected value = [];
  rules = [
    Rule(/^>>/, this.pop),
    Rule(/^\s+/, this.ignore),
    Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
    Rule(/^<</, this.captureDictionary),
    Rule(/^\[/, this.captureArray),
    Rule(/^\(/, this.captureString),
    Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
    Rule(/^-?\d*\.\d+/, this.captureFloat),
    Rule(/^-?\d+/, this.captureInt),
  ]
  push(value: any) {
    this.value.push(value);
  }
}
