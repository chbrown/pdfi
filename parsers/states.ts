/// <reference path="../type_declarations/index.d.ts" />
import * as logger from 'loge';
import {MachineRule as Rule, MachineState} from 'lexing';

import util = require('../util');
import * as Arrays from '../Arrays';
import {CrossReference, IndirectObject, IndirectReference, PDFObject, DictionaryObject} from '../pdfdom';

const escapeCharCodes = {
  '\\n': 10,
  '\\r': 13,
  '\\\\': 92,
}

export class HEXSTRING extends MachineState<Buffer, Buffer> {
  protected value = new Buffer(0);
  rules = [
    Rule(/^>/, this.pop),
    Rule(/^([A-Fa-f0-9]{2})+/, this.pushBytes),
    Rule(/^[A-Fa-f0-9]$/, this.pushHalfByte),
  ]
  pushBytes(matchValue: RegExpMatchArray) {
    var match_buffer = new Buffer(matchValue[0], 'hex');
    this.value = Buffer.concat([this.value, match_buffer]);
    return undefined;
  }
  /**
  handle implied final 0 (PDF32000_2008.pdf:16)
  by adding 0 character to end of odd-length strings
  */
  pushHalfByte(matchValue: RegExpMatchArray) {
    var match_buffer = new Buffer(matchValue[0] + '0', 'hex');
    this.value = Buffer.concat([this.value, match_buffer]);
    return undefined;
  }
}

/**
STRING is parens-delimited

Normally they'll use the ASCII or maybe Latin character set, but:
> With a composite font (PDF 1.2), multiple-byte codes may be used to select glyphs. In this instance, one or more consecutive bytes of the string shall be treated as a single character code. The code lengths and the mappings from codes to glyphs are defined in a data structure called a CMap, described in 9.7, "Composite Fonts".

(A.K.A. "INPARENS")
*/
export class STRING extends MachineState<Buffer, Buffer> {
  // initialize with empty Buffer
  protected value = new Buffer(0);
  rules = [
    Rule(/^\)/, this.pop),
    // nested STRING
    Rule(/^\(/, this.captureNestedString),
    // escaped start and end parens (yes, this happens, see PDF32000_2008.pdf:9.4.3)
    // and escaped start and end braces (I guess to avoid array ambiguity?)
    Rule(/^\\(\(|\)|\[|\])/, this.captureGroup),
    // escaped control characters; these are kind of weird, not sure if they're legitimate
    Rule(/^\\(n|r)/, this.captureEscape),
      // TODO: escaped newline: skip over it.
      // This is from a real-world example; I'm not sure it's in the spec.
      // [/^\\(\r\n|\n|\r)/, match => null ],
      // literal newline: is this in the spec? Or is there a real-world example?
      // [/^(\r\n|\n|\r)/, match => ['CHAR', match[0]] ],
    // escaped backslash
    Rule(/^\\\\/, this.captureEscape),
    // 3-digit octal character code
    Rule(/^\\([0-8]{3})/, this.captureOct),
    Rule(/^(.|\n|\r)/, this.captureGroup),
  ]
  captureNestedString(matchValue: RegExpMatchArray) {
    var nested_buffer = this.attachState(STRING).read();
    this.value = Buffer.concat([this.value, new Buffer('('), nested_buffer, new Buffer(')')]);
    return undefined;
  }
  captureGroup(matchValue: RegExpMatchArray) {
    var str = matchValue[1];
    this.value = Buffer.concat([this.value, new Buffer(str)]);
    return undefined;
  }
  captureEscape(matchValue: RegExpMatchArray) {
    var byte = escapeCharCodes[matchValue[0]];
    this.value = Buffer.concat([this.value, new Buffer([byte])]);
    return undefined;
  }
  captureOct(matchValue: RegExpMatchArray) {
    var byte = parseInt(matchValue[1], 8);
    this.value = Buffer.concat([this.value, new Buffer([byte])]);
    return undefined;
  }
}

export class IMAGEDATA extends MachineState<string, string[]> {
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

export class CONTENT_STREAM extends MachineState<ContentStreamOperation[], ContentStreamOperation[]> {
  protected value: ContentStreamOperation[] = [];
  private stack: any[] = [];
  rules = [
    Rule(/^$/, this.pop),
    Rule(/^\s+/, this.ignore),
    Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
    Rule(/^<</, this.captureDictionary), // dictionaries for Marked-content operators
    Rule(/^\[/, this.captureArray),
    Rule(/^\(/, this.captureBytestring),
    Rule(/^ID/, this.captureImageData), // Image data for inline images:
    Rule(/^(true|false)/, this.captureBoolean),
    Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
    Rule(/^-?[0-9]*\.[0-9]+/, this.captureFloat),
    Rule(/^-?[0-9]+/, this.captureInt),
    Rule(/^%%EOF/, this.ignore), // WTF?
    // maybe create a regex based on the valid operators?
    Rule(/^[A-Za-z'"]+[01*]?/, this.captureOperator),
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
  captureImageData(matchValue: RegExpMatchArray) {
    // var image_data = new IMAGEDATA(this.iterable).read();
    // TODO: Figure out why TypeScript can't infer the type of image_data with
    // the following syntax:
    var image_data = this.attachState(IMAGEDATA).read();
    // EI is what triggers the IMAGEDATA state pop
    this.stack.push(image_data);
    this.value.push({
      operands: this.stack,
      operator: 'EI',
      alias: content_stream_operator_aliases['EI'],
    });
    this.stack = [];
  }
  captureHex(matchValue: RegExpMatchArray) {
    var hexstring = matchValue[1].replace(/\s+/g, '');
    var bytes = Arrays.range(hexstring.length, 2).map(i => parseInt(hexstring.slice(i, i + 2), 16));
    this.stack.push(bytes);
    return undefined;
  }
  captureDictionary(matchValue: RegExpMatchArray) {
    var dictionary = this.attachState(DICTIONARY).read();
    this.stack.push(dictionary);
    return undefined;
  }
  captureArray(matchValue: RegExpMatchArray) {
    var array = this.attachState(ARRAY).read();
    this.stack.push(array);
    return undefined;
  }
  captureBytestring(matchValue: RegExpMatchArray) {
    var buffer = this.attachState(STRING).read();
    this.stack.push(buffer);
    return undefined;
  }
  captureName(matchValue: RegExpMatchArray) {
    this.stack.push(matchValue[1]);
    return undefined;
  }
  captureBoolean(matchValue: RegExpMatchArray) {
    this.stack.push(matchValue[0] === 'true');
    return undefined;
  }
  captureFloat(matchValue: RegExpMatchArray) {
    this.stack.push(parseFloat(matchValue[0]));
    return undefined;
  }
  captureInt(matchValue: RegExpMatchArray) {
    this.stack.push(parseInt(matchValue[0], 10));
    return undefined;
  }
}

export class ARRAY extends MachineState<PDFObject[], PDFObject[]> {
  protected value = [];
  rules = [
    Rule(/^\]/, this.pop),
    Rule(/^\s+/, this.ignore),
    Rule(/^/, this.captureObject),
  ]
  captureObject(matchValue: any) {
    var object = this.attachState(OBJECT).read();
    this.value.push(object);
    return undefined;
  }
}

interface StreamObject {
  dictionary: DictionaryObject;
  // dictionary: {
  //   Length: number;
  //   Filter?: string | string[];
  // };
  buffer: Buffer;
}

/**
> The keyword stream that follows the stream dictionary shall be followed by an end-of-line marker consisting of either a CARRIAGE RETURN and a LINE FEED or just a LINE FEED, and not by a CARRIAGE RETURN alone.
*/
export class DICTIONARY extends MachineState<DictionaryObject | StreamObject, DictionaryObject> {
  protected value: DictionaryObject = {};
  rules = [
    Rule(/^>>\s*stream(\r\n|\n)/, this.popStream),
    Rule(/^>>/, this.pop),
    Rule(/^\s+/, this.ignore),
    Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
  ]
  captureName(matchValue: RegExpMatchArray) {
    var name = matchValue[1];
    this.value[name] = this.attachState(OBJECT).read();
    return undefined;
  }
  popStream(matchValue: RegExpMatchArray): StreamObject {
    var stream_state = new STREAM(this.iterable, this.peek_length);
    stream_state.stream_length = this.value['Length'];
    var buffer = stream_state.read();
    return { dictionary: this.value, buffer: buffer };
  }
}

export class INDIRECT_OBJECT_VALUE extends MachineState<PDFObject, PDFObject> {
  rules = [
    Rule(/^\s+/, this.ignore),
    Rule(/^endobj/, this.pop),
    Rule(/^/, this.captureValue),
  ]
  captureValue(matchValue: RegExpMatchArray) {
    this.value = this.attachState(OBJECT).read();
    return undefined;
  }
}

export class OBJECT extends MachineState<PDFObject, PDFObject> {
  rules = [
    Rule(/^\s+/, this.ignore),
    Rule(/^<</, this.captureDictionary),
    Rule(/^</, this.captureHexstring),
    // Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
    Rule(/^\[/, this.captureArray),
    Rule(/^\(/, this.captureBytestring),
    Rule(/^([0-9]+)\s+([0-9]+)\s+R/, this.captureReference),
    Rule(/^([0-9]+)\s+([0-9]+)\s+obj/, this.captureIndirectObject),
    Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
    Rule(/^true/, this.captureTrue),
    Rule(/^false/, this.captureFalse),
    Rule(/^null/, this.captureNull),
    Rule(/^-?\d*\.\d+/, this.captureFloat),
    Rule(/^-?\d+/, this.captureInt),
    // Rule(/^$/, this.pop),
  ]
  captureHexstring(matchValue: RegExpMatchArray) {
    return this.attachState(HEXSTRING).read();
  }
  captureDictionary(matchValue: RegExpMatchArray) {
    // DICTIONARY might return a StreamObject
    return this.attachState(DICTIONARY).read();
  }
  captureArray(matchValue: RegExpMatchArray) {
    return this.attachState(ARRAY).read();
  }
  captureBytestring(matchValue: RegExpMatchArray) {
    var buffer = this.attachState(STRING).read();
    return buffer;
  }
  captureReference(matchValue: RegExpMatchArray) {
    return {
      object_number: parseInt(matchValue[1], 10),
      generation_number: parseInt(matchValue[2], 10),
    };
  }
  captureIndirectObject(matchValue: RegExpMatchArray) {
    return {
      object_number: parseInt(matchValue[1], 10),
      generation_number: parseInt(matchValue[2], 10),
      value: this.attachState(INDIRECT_OBJECT_VALUE).read(),
    };
  }
  captureName(matchValue: RegExpMatchArray) {
    // unescape any #-escaped sequences in the name
    return matchValue[1].replace(/#([A-Fa-f0-9]{2})/g, (m, m1) => String.fromCharCode(parseInt(m1, 16)));
  }
  captureTrue(matchValue: RegExpMatchArray) {
    return true;
  }
  captureFalse(matchValue: RegExpMatchArray) {
    return false;
  }
  captureNull(matchValue: RegExpMatchArray) {
    return null;
  }
  captureFloat(matchValue: RegExpMatchArray) {
    return parseFloat(matchValue[0]);
  }
  captureInt(matchValue: RegExpMatchArray) {
    return parseInt(matchValue[0], 10);
  }
}

// each action function has the BufferedLexer instance bound as `this`,
// allowing manipulating this.states, or this.reader (a BufferedReader)
// var default_rules: lexing.RegexRule<any>[] = [
// ];

// [/^trailer/, match => Token('TRAILER', match[0]) ],
// [/^startxref/, match => Token('STARTXREF', match[0]) ],
// // %%EOF isn't really EOF, but we never want to read past it in one go,
// // so we might as well treat it like one
// [/^%%EOF/, match => Token('EOF', match[0]) ],
// [/^xref\s*(\r\n|\n|\r)/, function(match) {
//   this.states.push('XREF');
//   return Token('XREF_START', match[0]);
// }],

// "STARTXREF_ONLY": [
//   [ "STARTXREF NUMBER EOF", "return $2" ]
// ],
// "XREF_ONLY": [
//   ["CROSS_REFERENCES TRAILER", "return $1"],
//   ["CROSS_REFERENCES EOF", "return $1"],
// ],
// "XREF_TRAILER_ONLY": [
//   [
//     "CROSS_REFERENCES TRAILER DICTIONARY STARTXREF NUMBER EOF",
//     "return {cross_references: $1, trailer: $3, startxref: $5};"
//   ]
// ],

interface XrefWithTrailer {
  cross_references?: CrossReference[];
  trailer?: DictionaryObject;
  startxref?: number;
}

/**
    xref
    0 215
    0000000001 65535 f
    0000286441 00000 n
    trailer
    <<
    /Size 215
    /Root 213 0 R
    /Info 214 0 R
    /ID [<01AAC31795631BB8E5C22F89D057CFE5> <01AAC31795631BB8E5C22F89D057CFE5>]
    >>
    startxref
    286801
    %%EOF
*/
export class XREF_WITH_TRAILER extends MachineState<XrefWithTrailer, XrefWithTrailer> {
  protected value: XrefWithTrailer = {};
  rules = [
    // the header line of an XREF consists of the starting object number of
    // the cross references in the following XREF section, followed by a space,
    // followed by the number of cross references in that section, following by
    // a universal newline
    Rule(/^\s+/, this.ignore),
    Rule(/^xref/, this.captureXref),
    Rule(/^trailer/, this.captureTrailer),
    Rule(/^startxref\s+(\d+)\s+%%EOF/, this.captureStartXref),
  ]
  captureXref(matchValue: RegExpMatchArray) {
    this.value.cross_references = this.attachState(XREF).read();
    return undefined;
  }
  captureTrailer(matchValue: RegExpMatchArray) {
    // in particular, a DICTIONARY object
    this.value.trailer = this.attachState(OBJECT).read();
    return undefined;
  }
  captureStartXref(matchValue: RegExpMatchArray) {
    this.value.startxref = parseInt(matchValue[1], 10);
    return this.value;
  }
}

export class STARTXREF extends MachineState<number, number> {
  rules = [
    Rule(/^startxref\s+(\d+)\s+%%EOF/, this.captureStartXref),
  ]
  captureStartXref(matchValue: RegExpMatchArray) {
    return parseInt(matchValue[1], 10);
  }
}

/**
the header line of an XREF consists of the starting object number of
the cross references in the following XREF section, followed by a space,
followed by the number of cross references in that section, following by
a universal newline
*/
export class XREF extends MachineState<CrossReference[], CrossReference[]> {
  protected value: CrossReference[] = [];
  rules = [
    Rule(/^xref/, this.ignore),
    Rule(/^\s+/, this.ignore),
    Rule(/^(\d+)\s+(\d+)\s*(\r\n|\n|\r)/, this.captureSection),
    Rule(/^/, this.pop), // anything else signals the end, but we can have multiple sections
    // TODO: should be it /^(trailer|$)/ ?
  ]
  captureSection(matchValue: RegExpMatchArray) {
    var object_number_start = parseInt(matchValue[1], 10);
    var object_count = parseInt(matchValue[2], 10);
    for (var i = 0; i < object_count; i++) {
      var partial = this.attachState(XREF_REFERENCE).read();
      this.value.push({
        object_number: object_number_start + i,
        offset: partial.offset,
        generation_number: partial.generation_number,
        in_use: partial.in_use,
      });
    }
    return undefined;
  }
}

interface PartialCrossReference {
  offset: number;
  generation_number: number;
  in_use: boolean;
}

export class XREF_REFERENCE extends MachineState<PartialCrossReference, PartialCrossReference> {
  rules = [
    Rule(/^(\d{10}) (\d{5}) (f|n)( \r| \n|\r\n)/, this.capture),
  ]
  capture(matchValue: RegExpMatchArray) {
    return {
      // object_number: object_number,
      offset: parseInt(matchValue[1], 10),
      generation_number: parseInt(matchValue[2], 10),
      in_use: matchValue[3] === 'n',
    };
  }
}

/**
  "STREAM_HEADER": [
    [
      "DICTIONARY START_STREAM",
      "// pretty ugly hack right here; yy is the Jison sharedState; yy.lexer is the JisonLexerWrapper instance; yy.lexer.lexer is the lexing.BufferedLexer instance\n" +
        "yy.stream_length = yy.pdf._resolveObject($1.Length);"
    ]
  ],
  "STREAM": [
    ["STREAM_HEADER STREAM_BUFFER END_STREAM", "$$ = { dictionary: $1, buffer: $2 }"]
  ],

  // From PDF32000_2008.pdf:7.3.8
  // > The keyword stream that follows the stream dictionary shall be followed by an end-of-line marker consisting of either a CARRIAGE RETURN and a LINE FEED or just a LINE FEED, and not by a CARRIAGE RETURN alone.

  [/^stream(\r\n|\n)/, function(match) {
    this.states.push('STREAM');
    return Token('START_STREAM', match[0]);
  }],

*/
export class STREAM extends MachineState<Buffer, Buffer> {
  public stream_length: number;
  protected value: Buffer;
  rules = [
    /**
    From PDF32000_2008.pdf:7.3.8
    > There should be an end-of-line marker after the data and before endstream; this marker shall not be included in the stream length. There shall not be any extra bytes, other than white space, between endstream and endobj.

    That "should be" is a recommendation. Sometimes there isn't anything, not even
    a newline, before the "endstream" marker.
    */
    Rule(/^\s*endstream/, this.pop),
    Rule(/^/, this.consumeBytes),
  ]
  /**
  From PDF32000_2008.pdf:7.3.8
  > The sequence of bytes that make up a stream lie between the end-of-line marker following the stream keyword and the endstream keyword; the stream dictionary specifies the exact number of bytes.
  */
  consumeBytes(matchValue: RegExpMatchArray) {
    // other side of the dirty lexer<->parser hack
    if (this.iterable['nextBytes']) {
      // this is what will usually be called, when this.iterable is a
      // FileStringIterator.
      this.value = this.iterable['nextBytes'](this.stream_length);
    }
    else {
      // hack to accommodate the string-based tests, where the iterable is not a
      // FileStringIterator, but a stubbed StringIterator.
      this.value = new Buffer(this.iterable.next(this.stream_length), 'ascii');
    }
    return undefined;
  }
}

function bufferFromUIntBE(value: number, byteLength: number) {
  var buffer = new Buffer(byteLength);
  buffer.writeUIntBE(value, 0, byteLength);
  return buffer;
}

// interface BufferPair extends Array<Buffer> {
//   0: Buffer;
//   1: Buffer;
// }
type BufferPair = [Buffer, Buffer];

export class CODESPACERANGE extends MachineState<BufferPair[], BufferPair[]> {
  protected value: BufferPair[] = [];
  private stack: Buffer[] = [];
  rules = [
    Rule(/^(\r\n|\r|\n)/, this.popStack),
    Rule(/^\s+/, this.ignore),
    Rule(/^</, this.captureHexstring),
    Rule(/^endcodespacerange/, this.pop),
  ]
  captureHexstring(matchValue: RegExpMatchArray) {
    var buffer = this.attachState(HEXSTRING).read();
    this.stack.push(buffer)
    return undefined;
  }
  popStack(matchValue: RegExpMatchArray) {
    // stack: [HEX, HEX]
    if (this.stack.length !== 2) {
      throw new Error(`Parsing CODESPACERANGE failed; argument stack must be 2-long: ${this.stack}`);
    }
    var [start_buffer, end_buffer] = this.stack;
    this.value.push([start_buffer, end_buffer]);
    this.stack = [];
    return undefined;
  }
}

/**
not sure how to parse a bfchar like this one:
   <0411><5168 fffd (fffd is repeated 32 times in total)>
String.fromCharCode(parseInt('D840', 16), parseInt('DC3E', 16))
*/
export class BFCHAR extends MachineState<BufferPair[], BufferPair[]> {
  protected value: BufferPair[] = [];
  private stack: Buffer[] = [];
  rules = [
    Rule(/^(\r\n|\r|\n)/, this.popStack),
    Rule(/^\s+/, this.ignore),
    Rule(/^</, this.captureHexstring),
    Rule(/^endbfchar/, this.pop),
  ]
  captureHexstring(matchValue: RegExpMatchArray) {
    var buffer = this.attachState(HEXSTRING).read();
    this.stack.push(buffer)
    return undefined;
  }
  popStack(matchValue: RegExpMatchArray) {
    // stack: [HEX, HEX]
    if (this.stack.length !== 2) {
      throw new Error(`Parsing BFCHAR failed; argument stack must be 2-long: ${this.stack}`);
    }
    var [start_buffer, end_buffer] = this.stack;
    this.value.push([start_buffer, end_buffer]);
    this.stack = [];
    return undefined;
  }
}

/**
the typical BFRANGE looks like "<0000> <005E> <0020>"
  which means map 0000 -> 0020, 0001 -> 0021, 0002 -> 0022, and so on, up to 005E -> 007E
the other kind of BFRANGE looks like "<005F> <0061> [<00660066> <00660069> <00660066006C>]"
  which means map 005F -> 00660066, 0060 -> 00660069, and 0061 -> 00660066006C
*/
export class BFRANGE extends MachineState<BufferPair[], BufferPair[]> {
  protected value: BufferPair[] = [];
  private stack: Array<Buffer | Buffer[]> = [];
  rules = [
    Rule(/^(\r\n|\r|\n)/, this.popStack),
    Rule(/^\s+/, this.ignore),
    Rule(/^</, this.captureHexstring),
    Rule(/^\[/, this.captureArray),
    Rule(/^endbfrange/, this.pop),
  ]
  captureHexstring(matchValue: RegExpMatchArray) {
    var buffer = this.attachState(HEXSTRING).read();
    this.stack.push(buffer)
    return undefined;
  }
  captureArray(matchValue: RegExpMatchArray) {
    var array = this.attachState(ARRAY).read();
    this.stack.push(array)
    return undefined;
  }
  popStack(matchValue: RegExpMatchArray) {
    // stack: [HEX, HEX, HEX | ARRAY<HEX>]
    if (this.stack.length !== 3) {
      throw new Error(`Parsing BFRANGE failed; argument stack must be 3-long: ${this.stack}`);
    }
    var [start_buffer, end_buffer, target] = <[Buffer, Buffer, Buffer | Buffer[]]>this.stack;
    var byteLength = start_buffer.length;
    if (end_buffer.length !== byteLength) {
      throw new Error(`Parsing BFRANGE failed; end offset has byteLength=${end_buffer.length} but start offset has byteLength=${byteLength}`);
    }
    var start_number = start_buffer.readUIntBE(0, byteLength);
    var end_number = end_buffer.readUIntBE(0, byteLength);
    var offset_count = end_number - start_number;

    if (Array.isArray(target)) {
      var target_array = <Buffer[]>target;
      if (offset_count !== target.length) {
        throw new Error(`Parsing BFRANGE failed; target offset array has length=${target.length} but end - start = ${offset_count}`);
      }
      // target is an array of Buffers
      for (let i = 0; i <= offset_count; i++) {
        let from_buffer = bufferFromUIntBE(start_number + i, byteLength);
        let target_buffer = target_array[i];
        this.value.push([from_buffer, target_buffer]);
      }
    }
    else {
      // target is a single Buffer. each of the characters get transformed by the offset
      var target_start_buffer = <Buffer>target;
      var offset = target_start_buffer.readUIntBE(0, target_start_buffer.length) - start_number;
      for (let i = 0; i <= offset_count; i++) {
        let from_buffer = bufferFromUIntBE(start_number + i, byteLength);
        let target_buffer = bufferFromUIntBE(start_number + i + offset, byteLength);
        this.value.push([from_buffer, target_buffer]);
      }
    }
    this.stack = [];
    return undefined;
  }
}


/**
Holds a mapping from in-PDF character codes to native Javascript Unicode strings.

I'm not really sure how byteLength is determined.

Critical pair: P13-1145.pdf (byteLength: 2) vs. P13-4012.pdf (byteLength: 1)
*/
export interface CMap {
  codeSpaceRanges: BufferPair[];
  mapping: BufferPair[];
  byteLength: number;
}

export class CMAP extends MachineState<CMap, any> {
  private codeSpaceRanges: BufferPair[] = [];
  private mapping: BufferPair[] = [];
  rules = [
    Rule(/^\s+/, this.ignore),
    Rule(/^begincodespacerange\s+/, this.captureCodeSpaceRange),
    Rule(/^beginbfchar\s+/, this.captureBFChar),
    Rule(/^beginbfrange\s+/, this.captureBFRange),
    Rule(/^$/, this.pop),
    Rule(/^\S+/, this.ignore), // TODO: optimize this
  ]
  captureCodeSpaceRange(matchValue: RegExpMatchArray) {
    var ranges = this.attachState(CODESPACERANGE).read();
    Arrays.pushAll(this.codeSpaceRanges, ranges);
    return undefined;
  }
  captureBFChar(matchValue: RegExpMatchArray) {
    var pairs = this.attachState(BFCHAR).read();
    Arrays.pushAll(this.mapping, pairs);
    return undefined;
  }
  captureBFRange(matchValue: RegExpMatchArray) {
    var pairs = this.attachState(BFRANGE).read();
    Arrays.pushAll(this.mapping, pairs);
    return undefined;
  }
  pop(): CMap {
    var byteLengths = this.codeSpaceRanges.map(codeSpaceRange => codeSpaceRange[0].length);
    if (!byteLengths.every(byteLength => byteLength === byteLengths[0])) {
      throw new Error(`Mismatched byte lengths in code space ranges in CMap: ${byteLengths.join(', ')}`);
    }
    return {
      codeSpaceRanges: this.codeSpaceRanges,
      mapping: this.mapping,
      byteLength: byteLengths[0],
    };
  }
}
