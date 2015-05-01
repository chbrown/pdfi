/// <reference path="../type_declarations/index.d.ts" />
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
  captureFloat(matchValue: RegExpMatchArray) {
    this.push(parseFloat(matchValue[0]));
    return undefined;
  }
  captureInt(matchValue: RegExpMatchArray) {
    this.push(parseInt(matchValue[0], 10));
    return undefined;
  }
}

export class Operation {
  constructor(public operator: string, public operands: any[]) { }
}

export class CONTENT_STREAM extends Collection<Operation[], Operation[]> {
  protected value = [];
  private stack = [];
  rules = [
    Rule(/^$/, this.pop),
    Rule(/^\s+/, this.ignore),
    Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
    Rule(/^<</, this.captureDictionary), // dictionaries for Marked-content operators
    Rule(/^\[/, this.captureArray),
    Rule(/^\(/, this.captureString),
    Rule(/^ID/, this.captureImageData), // Image data for inline images:
    Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
    Rule(/^-?\d*\.\d+/, this.captureFloat),
    Rule(/^-?\d+/, this.captureInt),
    Rule(/^%%EOF/, this.pop), // WTF?
    Rule(/^[A-Za-z'"]+\*?/, this.captureOperator),
  ]
  captureOperator(matchValue: RegExpMatchArray) {
    var operator = matchValue[0];
    this.value.push(new Operation(operator, this.stack));
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
    this.push(image_data);
    return undefined;
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
