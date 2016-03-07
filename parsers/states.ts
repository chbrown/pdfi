import {MachineRule as Rule, MachineState, MachineCallback} from 'lexing';
import {groups, flatMap, range, assign} from 'tarry';

import {logger} from '../logger';
import {CrossReference, IndirectObject, IndirectReference, PDFObject, DictionaryObject} from '../pdfdom';
import {makeString} from '../util';
import {decodeBuffer} from '../filters/decoders';

const escapeCharCodes = {
  '\\n': 10,
  '\\r': 13,
  '\\\\': 92,
};

/**
Unescape all #-escaped sequences in a name.
*/
function unescapeName(name: string) {
  return name.replace(/#([A-Fa-f0-9]{2})/g, (m, m1) => String.fromCharCode(parseInt(m1, 16)));
}

export class HEXSTRING extends MachineState<Buffer, Buffer> {
  protected value = new Buffer(0);
  rules = [
    Rule(/^>/, this.pop),
    // From PDF32000_2008.pdf:7.3.4.3
    // > White-space characters (such as SPACE (20h), HORIZONTAL TAB (09h), CARRIAGE RETURN (0Dh), LINE FEED (0Ah), and FORM FEED (0Ch)) shall be ignored.
    Rule(/^\s+/, this.ignore),
    Rule(/^([A-Fa-f0-9]{2})+/, this.pushBytes),
    Rule(/^[A-Fa-f0-9]$/, this.pushHalfByte),
  ]
  pushBytes(matchValue: RegExpMatchArray): Buffer {
    const match_buffer = new Buffer(matchValue[0], 'hex');
    this.value = Buffer.concat([this.value, match_buffer]);
    return;
  }
  /**
  handle implied final 0 (PDF32000_2008.pdf:16)
  by adding 0 character to end of odd-length strings
  */
  pushHalfByte(matchValue: RegExpMatchArray): Buffer {
    const match_buffer = new Buffer(matchValue[0] + '0', 'hex');
    this.value = Buffer.concat([this.value, match_buffer]);
    return;
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
  captureNestedString(matchValue: RegExpMatchArray): Buffer {
    const nested_buffer = this.attachState(STRING).read();
    this.value = Buffer.concat([this.value, new Buffer('('), nested_buffer, new Buffer(')')]);
    return;
  }
  captureGroup(matchValue: RegExpMatchArray): Buffer {
    const str = matchValue[1];
    this.value = Buffer.concat([this.value, new Buffer(str)]);
    return;
  }
  captureEscape(matchValue: RegExpMatchArray): Buffer {
    const byte = escapeCharCodes[matchValue[0]];
    this.value = Buffer.concat([this.value, new Buffer([byte])]);
    return;
  }
  captureOct(matchValue: RegExpMatchArray): Buffer {
    const byte = parseInt(matchValue[1], 8);
    this.value = Buffer.concat([this.value, new Buffer([byte])]);
    return;
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
  captureGroup(matchValue: RegExpMatchArray): string {
    this.value.push(matchValue[1]);
    return;
  }
  pop(): string {
    return this.value.join('');
  }
}

const content_stream_operator_aliases = {
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
  captureOperator(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    this.value.push({
      operands: this.stack,
      operator: matchValue[0],
      alias: content_stream_operator_aliases[matchValue[0]],
    });
    if (content_stream_operator_aliases[matchValue[0]] === undefined) {
      logger.warning('Unaliased operator: %j', matchValue[0]);
    }
    this.stack = [];
    return;
  }
  captureImageData(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    // const image_data = new IMAGEDATA(this.iterable).read();
    // TODO: Figure out why TypeScript can't infer the type of image_data with
    // the following syntax:
    const image_data = this.attachState(IMAGEDATA).read();
    // EI is what triggers the IMAGEDATA state pop
    this.stack.push(image_data);
    this.value.push({
      operands: this.stack,
      operator: 'EI',
      alias: content_stream_operator_aliases['EI'],
    });
    this.stack = [];
    return;
  }
  captureHex(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    const hexstring = matchValue[1].replace(/\s+/g, '');
    // range(hexstring.length, 2).map(i => parseInt(hexstring.slice(i, i + 2), 16));
    const buffer = new Buffer(hexstring, 'hex');
    this.stack.push(buffer);
    return;
  }
  captureDictionary(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    const dictionary = this.attachState(DICTIONARY).read();
    this.stack.push(dictionary);
    return;
  }
  captureArray(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    const array = this.attachState(ARRAY).read();
    this.stack.push(array);
    return;
  }
  captureBytestring(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    const buffer = this.attachState(STRING).read();
    this.stack.push(buffer);
    return;
  }
  captureName(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    const name = unescapeName(matchValue[1])
    this.stack.push(name);
    return;
  }
  captureBoolean(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    this.stack.push(matchValue[0] === 'true');
    return;
  }
  captureFloat(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    this.stack.push(parseFloat(matchValue[0]));
    return;
  }
  captureInt(matchValue: RegExpMatchArray): ContentStreamOperation[] {
    this.stack.push(parseInt(matchValue[0], 10));
    return;
  }
}

export class ARRAY extends MachineState<PDFObject[], PDFObject[]> {
  protected value: PDFObject[] = [];
  rules = [
    Rule(/^\]/, this.pop),
    Rule(/^\s+/, this.ignore),
    Rule(/^/, this.captureObject),
  ]
  captureObject(matchValue: RegExpMatchArray): PDFObject[] {
    const object = this.attachState(OBJECT).read();
    this.value.push(object);
    return;
  }
}

export class DICTIONARY extends MachineState<DictionaryObject, DictionaryObject> {
  protected value: DictionaryObject = {};
  rules = [
    /**
    > The keyword stream that follows the stream dictionary shall be followed by an end-of-line marker consisting of either a CARRIAGE RETURN and a LINE FEED or just a LINE FEED, and not by a CARRIAGE RETURN alone.
    */
    Rule(/^>>\s*stream(\r\n|\n)/, this.popStream),
    Rule(/^>>/, this.pop),
    Rule(/^\s+/, this.ignore),
    Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
  ]
  captureName(matchValue: RegExpMatchArray): DictionaryObject {
    const name = unescapeName(matchValue[1])
    this.value[name] = this.attachState(OBJECT).read();
    return;
  }
  /**
  We cannot read the actual stream until we know how long it is, and Length
  might be an object reference. But we can't just stop reading, since an
  indirect object parser wouldn't ever reach the 'endobj' marker. So we hack in
  the PDF, so that we can call pdf._resolveObject on the object reference.
  */
  popStream(matchValue: RegExpMatchArray): DictionaryObject {
    let stream_length = this.value['Length'];
    if (typeof stream_length !== 'number') {
      const pdf = this.iterable['pdf'];
      if (pdf === undefined) {
        throw new Error('Cannot read stream unless a PDF instance is attached to the underlying iterable');
      }
      stream_length = pdf._resolveObject(stream_length);
    }

    const stream_state = new STREAM(this.iterable, this.peek_length);
    // STREAM gets special handling
    stream_state.consumeBytes(stream_length);
    const buffer = stream_state.read();
    return {dictionary: this.value, buffer};
  }
}

export class INDIRECT_OBJECT_VALUE extends MachineState<PDFObject, PDFObject> {
  rules = [
    Rule(/^\s+/, this.ignore),
    Rule(/^endobj/, this.pop),
    Rule(/^/, this.captureValue),
  ]
  captureValue(matchValue: RegExpMatchArray): PDFObject {
    this.value = this.attachState(OBJECT).read();
    return;
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
    return this.attachState(STRING).read();
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
    return unescapeName(matchValue[1])
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

export interface XrefWithTrailer {
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
    Rule(/^([0-9]+)\s+([0-9]+)\s+obj/, this.captureIndirectObject),
  ]
  // the functions that return `undefined` must return `undefined` of type T,
  // (as in MachineState<T, I>), or else the rules array gets abstracted to
  // Rule<any>[], which breaks type inference on the whole class
  captureXref(matchValue: RegExpMatchArray): XrefWithTrailer {
    this.value.cross_references = this.attachState(XREF).read();
    return;
  }
  captureTrailer(matchValue: RegExpMatchArray): XrefWithTrailer {
    // in particular, a DICTIONARY object
    this.value.trailer = this.attachState(OBJECT).read();
    return;
  }
  captureStartXref(matchValue: RegExpMatchArray): XrefWithTrailer {
    this.value.startxref = parseInt(matchValue[1], 10);
    return this.value;
  }
  captureIndirectObject(matchValue: RegExpMatchArray): XrefWithTrailer {
    // object_number: parseInt(matchValue[1], 10),
    // generation_number: parseInt(matchValue[2], 10),
    const value = this.attachState(INDIRECT_OBJECT_VALUE).read();
    // value will be a StreamObject, i.e., {dictionary: {...}, buffer: Buffer}
    const filters = [].concat(value['dictionary'].Filter || []);
    const decodeParmss = [].concat(value['dictionary'].DecodeParms || []);
    const buffer = decodeBuffer(value['buffer'], filters, decodeParmss);

    const Size = value['dictionary'].Size;
    // object_number_pairs: Array<[number, number]>
    const object_number_pairs: number[][] = groups<number>(value['dictionary'].Index || [0, Size], 2);

    // PDF32000_2008.pdf:7.5.8.2-3 describes how we resolve these windows
    // to cross_references
    const [field_type_size, field_2_size, field_3_size] = value['dictionary'].W;
    const columns = field_type_size + field_2_size + field_3_size;

    // first, parse out the PartialCrossReferences
    const partial_xrefs: PartialCrossReference[] = [];
    for (let offset = 0; offset < buffer.length; offset += columns) {
      // TODO: handle field sizes that are 0
      const field_type = buffer.readUIntBE(offset, field_type_size);
      const field_2 = buffer.readUIntBE(offset + field_type_size, field_2_size);
      const field_3 = buffer.readUIntBE(offset + field_type_size + field_2_size, field_3_size);
      if (field_type === 0) {
        logger.warning('CrossReferenceStream with field Type=0 is not fully implemented');
        partial_xrefs.push({
          in_use: false,
          generation_number: 0,
        });
      }
      else if (field_type === 1) {
        partial_xrefs.push({
          in_use: true,
          offset: field_2,
          generation_number: field_3,
        });
      }
      else {
        partial_xrefs.push({
          in_use: true,
          generation_number: 0,
          object_stream_object_number: field_2,
          object_stream_index: field_3,
        });
      }
    }

    // now use the dictionary.Index values to zip
    this.value.cross_references = flatMap<number[], CrossReference>(object_number_pairs, ([object_number_start, size]) => {
      return range(size).map(i => {
        const partial_xref = partial_xrefs.shift();
        return assign({object_number: object_number_start + i}, partial_xref);
      });
    });

    this.value.trailer = value['dictionary'];
    this.value.startxref = value['dictionary'].Prev;

    return this.value;
  }
}

export class STARTXREF extends MachineState<number, number> {
  rules = [
    Rule(/^startxref\s+(\d+)\s+%%EOF/, this.captureStartXref),
  ]
  captureStartXref(matchValue: RegExpMatchArray): number {
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
  captureSection(matchValue: RegExpMatchArray): CrossReference[] {
    const object_number_start = parseInt(matchValue[1], 10);
    const object_count = parseInt(matchValue[2], 10);
    for (let i = 0; i < object_count; i++) {
      const partial_cross_reference = this.attachState<PartialCrossReference, PartialCrossReference>(XREF_REFERENCE).read();
      this.value.push({
        object_number: object_number_start + i,
        offset: partial_cross_reference.offset,
        generation_number: partial_cross_reference.generation_number,
        in_use: partial_cross_reference.in_use,
      });
    }
    return;
  }
}

export interface PartialCrossReference {
  generation_number: number;
  in_use: boolean;
  offset?: number;
  object_stream_object_number?: number;
  object_stream_index?: number;
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

export class STREAM extends MachineState<Buffer, Buffer> {
  rules = [
    /**
    From PDF32000_2008.pdf:7.3.8
    > There should be an end-of-line marker after the data and before endstream; this marker shall not be included in the stream length. There shall not be any extra bytes, other than white space, between endstream and endobj.

    That "should be" is a recommendation. Sometimes there isn't anything, not even
    a newline, before the "endstream" marker.
    */
    Rule(/^\s*endstream/, this.pop),
  ]
  /**
  From PDF32000_2008.pdf:7.3.8
  > The sequence of bytes that make up a stream lie between the end-of-line marker following the stream keyword and the endstream keyword; the stream dictionary specifies the exact number of bytes.
  */
  consumeBytes(stream_length: number) {
    if (this.iterable['nextBytes']) {
      // this is what will usually be called, when this.iterable is a
      // FileStringIterator.
      this.value = this.iterable['nextBytes'](stream_length);
    }
    else {
      // hack to accommodate the string-based tests, where the iterable is not a
      // FileStringIterator, but a stubbed StringIterator.
      this.value = new Buffer(this.iterable.next(stream_length), 'ascii');
    }
  }
}

/**
A CMap's maps from character codes (or character code sequences) to
UTF-16BE-encoded Unicode character strings.
*/
export interface CharRange {
  low: number;
  high: number;
}

/**
Buffer#readUIntBE supports up to 48 bits of accuracy, so `buffer` should be at
most 6 bytes long.

Equivalent to parseInt(buffer.toString('hex'), 16);
*/
function decodeNumber(buffer: Buffer): number {
  return buffer.readUIntBE(0, buffer.length);
}

export class CODESPACERANGE extends MachineState<CharRange[], CharRange[]> {
  protected value: CharRange[] = [];
  private stack: Buffer[] = [];
  rules = [
    Rule(/^(\r\n|\r|\n)/, this.popStack),
    Rule(/^\s+/, this.ignore),
    Rule(/^</, this.captureHexstring),
    Rule(/^endcodespacerange/, this.pop),
  ]
  captureHexstring(matchValue: RegExpMatchArray): CharRange[] {
    const buffer = this.attachState(HEXSTRING).read();
    this.stack.push(buffer)
    return;
  }
  popStack(matchValue: RegExpMatchArray): CharRange[] {
    // stack: [HEX, HEX]
    if (this.stack.length !== 2) {
      throw new Error(`Parsing CODESPACERANGE failed; argument stack must be 2-long: ${this.stack}`);
    }
    const [low, high] = this.stack.map(decodeNumber);
    this.value.push({low, high});
    this.stack = [];
    return;
  }
}

/**
`buffer` should be an even number of characters
*/
function decodeUTF16BE(buffer: Buffer): string {
  const charCodes: number[] = [];
  for (let i = 0; i < buffer.length; i += 2) {
    charCodes.push(buffer.readUInt16BE(i));
  }
  return makeString(charCodes);
}

/**
Returns a single-rune string of length 1 or 2.
*/
function ucsChar(code: number): string {
  if (code > 0xFFFFFFFF) {
    throw new Error(`Cannot decode numbers larger than 32 bits (${code})`);
  }
  else if (code > 0xFFFF) {
    const big = code >>> 16;
    const little = code % 0x10000;
    return String.fromCharCode(big, little);
  }
  else {
    // otherwise, it's less than 0xFFFF, so it's just a plain 1-charCode character
    return String.fromCharCode(code);
  }
}

export interface CharMapping {
  src: number;
  dst: string;
  byteLength: number;
}

/**
not sure how to parse a bfchar like this one:
   <0411><5168 fffd (fffd is repeated 32 times in total)>
String.fromCharCode(parseInt('D840', 16), parseInt('DC3E', 16))
*/
export class BFCHAR extends MachineState<CharMapping[], CharMapping[]> {
  protected value: CharMapping[] = [];
  private stack: Buffer[] = [];
  rules = [
    Rule(/^(\r\n|\r|\n)/, this.popStack),
    Rule(/^\s+/, this.ignore),
    Rule(/^</, this.captureHexstring),
    Rule(/^endbfchar/, this.pop),
  ]
  captureHexstring(matchValue: RegExpMatchArray): CharMapping[] {
    const buffer = this.attachState(HEXSTRING).read();
    this.stack.push(buffer)
    return;
  }
  popStack(matchValue: RegExpMatchArray): CharMapping[] {
    // stack: [HEX, HEX]
    if (this.stack.length !== 2) {
      throw new Error(`Parsing BFCHAR failed; argument stack must be 2-long: ${this.stack}`);
    }
    // the CIDFont_Spec uses src/dst naming
    const [src_buffer, dst_buffer] = this.stack;
    this.value.push({
      src: decodeNumber(src_buffer),
      dst: decodeUTF16BE(dst_buffer),
      byteLength: src_buffer.length,
    });
    this.stack = [];
    return;
  }
}

/**
the typical BFRANGE looks like "<0000> <005E> <0020>"
  which means map 0000 -> 0020, 0001 -> 0021, 0002 -> 0022, and so on, up to 005E -> 007E
the other kind of BFRANGE looks like "<005F> <0061> [<00660066> <00660069> <00660066006C>]"
  which means map 005F -> 00660066, 0060 -> 00660069, and 0061 -> 00660066006C
*/
export class BFRANGE extends MachineState<CharMapping[], CharMapping[]> {
  protected value: CharMapping[] = [];
  private stack: Array<Buffer | Buffer[]> = [];
  rules = [
    Rule(/^(\r\n|\r|\n)/, this.popStack),
    Rule(/^\s+/, this.ignore),
    Rule(/^</, this.captureHexstring),
    Rule(/^\[/, this.captureArray),
    Rule(/^endbfrange/, this.pop),
  ]
  captureHexstring(matchValue: RegExpMatchArray): CharMapping[] {
    const buffer = this.attachState(HEXSTRING).read();
    this.stack.push(buffer)
    return;
  }
  captureArray(matchValue: RegExpMatchArray): CharMapping[] {
    // the ARRAY substate should find an array of hexstrings
    const array = <Buffer[]>this.attachState(ARRAY).read();
    this.stack.push(array);
    return;
  }
  popStack(matchValue: RegExpMatchArray): CharMapping[] {
    // stack: [HEX, HEX, HEX | ARRAY<HEX>]
    if (this.stack.length !== 3) {
      throw new Error(`Parsing BFRANGE failed; argument stack must be 3-long: ${this.stack}`);
    }
    const [src_code_lo_buffer, src_code_hi_buffer, dst] = <[Buffer, Buffer, Buffer | Buffer[]]>this.stack;
    const byteLength = src_code_lo_buffer.length;
    if (src_code_hi_buffer.length !== byteLength) {
      throw new Error(`Parsing BFRANGE failed; high offset has byteLength=${src_code_hi_buffer.length} but low offset has byteLength=${byteLength}`);
    }
    // the CIFFont_Spec documentation uses srcCodeLo and srcCodeHi naming
    const src_code_lo = src_code_lo_buffer.readUIntBE(0, byteLength);
    const src_code_hi = src_code_hi_buffer.readUIntBE(0, byteLength);
    const src_code_offset = src_code_hi - src_code_lo;

    if (Array.isArray(dst)) {
      // dst is an array of Buffers
      const dst_array = <Buffer[]>dst;
      if ((src_code_offset + 1) !== dst_array.length) {
        throw new Error(`Parsing BFRANGE failed; destination offset array has length=${dst.length} but high (${src_code_hi}) - low (${src_code_lo}) = ${src_code_offset} (${dst_array.map(buffer => buffer.toString('hex'))})`);
      }
      for (let i = 0; i <= src_code_offset; i++) {
        const dst_buffer = dst_array[i];
        this.value.push({
          src: src_code_lo + i,
          dst: decodeUTF16BE(dst_buffer),
          byteLength: byteLength,
        });
      }
    }
    else {
      // dst is a single Buffer. each of the characters from lo to hi get transformed by the offset
      const dst_buffer = <Buffer>dst;
      if (dst_buffer.length > 4) {
        throw new Error(`bfchar dst is a buffer larger than 32 bytes: ${dst_buffer.toString('hex')}; only numbers smaller than 32 bytes can be converted to characters.`);
      }
      const dst_code_lo = decodeNumber(dst_buffer);
      for (let i = 0; i <= src_code_offset; i++) {
        let dst_code = dst_code_lo + i;
        this.value.push({
          src: src_code_lo + i,
          dst: ucsChar(dst_code),
          byteLength: byteLength,
        });
      }
    }
    this.stack = [];
    return;
  }
}

/**
Holds a mapping from in-PDF character codes to native Javascript Unicode strings.

Critical pair: P13-1145.pdf (byteLength: 2) vs. P13-4012.pdf (byteLength: 1)
*/
export interface CMap {
  codeSpaceRanges: CharRange[];
  mappings: CharMapping[];
  byteLength: number;
}

export class CMAP extends MachineState<CMap, any> {
  private codeSpaceRanges: CharRange[] = [];
  private mappings: CharMapping[] = [];
  rules = [
    Rule(/^\s+/, this.ignore),
    Rule(/^begincodespacerange\s+/, this.captureCodeSpaceRange),
    Rule(/^beginbfchar\s+/, this.captureBFChar),
    Rule(/^beginbfrange\s+/, this.captureBFRange),
    Rule(/^$/, this.pop),
    Rule(/^\S+/, this.ignore), // TODO: optimize this
  ]
  captureCodeSpaceRange(matchValue: RegExpMatchArray): CMap {
    const ranges = this.attachState(CODESPACERANGE).read();
    this.codeSpaceRanges.push(...ranges);
    return;
  }
  captureBFChar(matchValue: RegExpMatchArray): CMap {
    const mappings = this.attachState(BFCHAR).read();
    this.mappings.push(...mappings);
    return;
  }
  captureBFRange(matchValue: RegExpMatchArray): CMap {
    const mappings = this.attachState(BFRANGE).read();
    this.mappings.push(...mappings);
    return;
  }
  pop(): CMap {
    const byteLengths = this.mappings.map(mapping => mapping.byteLength);
    if (!byteLengths.every(byteLength => byteLength === byteLengths[0])) {
      logger.warning(`Mismatched byte lengths in mappings in CMAP: ${byteLengths.join(', ')}; using only the first.`);
    }
    return {
      codeSpaceRanges: this.codeSpaceRanges,
      mappings: this.mappings,
      // default to byteLength=1 if there are no mappings
      byteLength: byteLengths[0] || 1,
    };
  }
}
