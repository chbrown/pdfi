var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/// <reference path="../type_declarations/index.d.ts" />
var logger = require('loge');
var lexing_1 = require('lexing');
var Arrays = require('../Arrays');
var escapeCharCodes = {
    '\\n': 10,
    '\\r': 13,
    '\\\\': 92,
};
var HEXSTRING = (function (_super) {
    __extends(HEXSTRING, _super);
    function HEXSTRING() {
        _super.apply(this, arguments);
        this.value = new Buffer(0);
        this.rules = [
            lexing_1.MachineRule(/^>/, this.pop),
            lexing_1.MachineRule(/^([A-Fa-f0-9]{2})+/, this.pushBytes),
            lexing_1.MachineRule(/^[A-Fa-f0-9]$/, this.pushHalfByte),
        ];
    }
    HEXSTRING.prototype.pushBytes = function (matchValue) {
        var match_buffer = new Buffer(matchValue[0], 'hex');
        this.value = Buffer.concat([this.value, match_buffer]);
        return undefined;
    };
    /**
    handle implied final 0 (PDF32000_2008.pdf:16)
    by adding 0 character to end of odd-length strings
    */
    HEXSTRING.prototype.pushHalfByte = function (matchValue) {
        var match_buffer = new Buffer(matchValue[0] + '0', 'hex');
        this.value = Buffer.concat([this.value, match_buffer]);
        return undefined;
    };
    return HEXSTRING;
})(lexing_1.MachineState);
exports.HEXSTRING = HEXSTRING;
/**
STRING is parens-delimited

Normally they'll use the ASCII or maybe Latin character set, but:
> With a composite font (PDF 1.2), multiple-byte codes may be used to select glyphs. In this instance, one or more consecutive bytes of the string shall be treated as a single character code. The code lengths and the mappings from codes to glyphs are defined in a data structure called a CMap, described in 9.7, "Composite Fonts".

(A.K.A. "INPARENS")
*/
var STRING = (function (_super) {
    __extends(STRING, _super);
    function STRING() {
        _super.apply(this, arguments);
        // initialize with empty Buffer
        this.value = new Buffer(0);
        this.rules = [
            lexing_1.MachineRule(/^\)/, this.pop),
            // nested STRING
            lexing_1.MachineRule(/^\(/, this.captureNestedString),
            // escaped start and end parens (yes, this happens, see PDF32000_2008.pdf:9.4.3)
            // and escaped start and end braces (I guess to avoid array ambiguity?)
            lexing_1.MachineRule(/^\\(\(|\)|\[|\])/, this.captureGroup),
            // escaped control characters; these are kind of weird, not sure if they're legitimate
            lexing_1.MachineRule(/^\\(n|r)/, this.captureEscape),
            // TODO: escaped newline: skip over it.
            // This is from a real-world example; I'm not sure it's in the spec.
            // [/^\\(\r\n|\n|\r)/, match => null ],
            // literal newline: is this in the spec? Or is there a real-world example?
            // [/^(\r\n|\n|\r)/, match => ['CHAR', match[0]] ],
            // escaped backslash
            lexing_1.MachineRule(/^\\\\/, this.captureEscape),
            // 3-digit octal character code
            lexing_1.MachineRule(/^\\([0-8]{3})/, this.captureOct),
            lexing_1.MachineRule(/^(.|\n|\r)/, this.captureGroup),
        ];
    }
    STRING.prototype.captureNestedString = function (matchValue) {
        var nested_buffer = this.attachState(STRING).read();
        this.value = Buffer.concat([this.value, new Buffer('('), nested_buffer, new Buffer(')')]);
        return undefined;
    };
    STRING.prototype.captureGroup = function (matchValue) {
        var str = matchValue[1];
        this.value = Buffer.concat([this.value, new Buffer(str)]);
        return undefined;
    };
    STRING.prototype.captureEscape = function (matchValue) {
        var byte = escapeCharCodes[matchValue[0]];
        this.value = Buffer.concat([this.value, new Buffer([byte])]);
        return undefined;
    };
    STRING.prototype.captureOct = function (matchValue) {
        var byte = parseInt(matchValue[1], 8);
        this.value = Buffer.concat([this.value, new Buffer([byte])]);
        return undefined;
    };
    return STRING;
})(lexing_1.MachineState);
exports.STRING = STRING;
var IMAGEDATA = (function (_super) {
    __extends(IMAGEDATA, _super);
    function IMAGEDATA() {
        _super.apply(this, arguments);
        this.value = [];
        this.rules = [
            // TODO: deal with non-operator "EI" strings that crop up in the ID value better.
            // Right now, I'm just assuming that they won't have whitespace before them.
            lexing_1.MachineRule(/^EI/, this.pop),
            lexing_1.MachineRule(/^(\S+)/, this.captureGroup),
            lexing_1.MachineRule(/^(.|\n|\r)/, this.captureGroup),
        ];
    }
    IMAGEDATA.prototype.captureGroup = function (matchValue) {
        this.value.push(matchValue[1]);
        return undefined;
    };
    IMAGEDATA.prototype.pop = function () {
        return this.value.join('');
    };
    return IMAGEDATA;
})(lexing_1.MachineState);
exports.IMAGEDATA = IMAGEDATA;
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
var CONTENT_STREAM = (function (_super) {
    __extends(CONTENT_STREAM, _super);
    function CONTENT_STREAM() {
        _super.apply(this, arguments);
        this.value = [];
        this.stack = [];
        this.rules = [
            lexing_1.MachineRule(/^$/, this.pop),
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
            lexing_1.MachineRule(/^<</, this.captureDictionary),
            lexing_1.MachineRule(/^\[/, this.captureArray),
            lexing_1.MachineRule(/^\(/, this.captureBytestring),
            lexing_1.MachineRule(/^ID/, this.captureImageData),
            lexing_1.MachineRule(/^(true|false)/, this.captureBoolean),
            lexing_1.MachineRule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
            lexing_1.MachineRule(/^-?[0-9]*\.[0-9]+/, this.captureFloat),
            lexing_1.MachineRule(/^-?[0-9]+/, this.captureInt),
            lexing_1.MachineRule(/^%%EOF/, this.ignore),
            // maybe create a regex based on the valid operators?
            lexing_1.MachineRule(/^[A-Za-z'"]+[01*]?/, this.captureOperator),
        ];
    }
    CONTENT_STREAM.prototype.captureOperator = function (matchValue) {
        this.value.push({
            operands: this.stack,
            operator: matchValue[0],
            alias: content_stream_operator_aliases[matchValue[0]],
        });
        if (content_stream_operator_aliases[matchValue[0]] === undefined) {
            logger.warn('Unaliased operator: %j', matchValue[0]);
        }
        this.stack = [];
    };
    CONTENT_STREAM.prototype.captureImageData = function (matchValue) {
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
    };
    CONTENT_STREAM.prototype.captureHex = function (matchValue) {
        var hexstring = matchValue[1].replace(/\s+/g, '');
        var bytes = Arrays.range(hexstring.length, 2).map(function (i) { return parseInt(hexstring.slice(i, i + 2), 16); });
        this.stack.push(bytes);
        return undefined;
    };
    CONTENT_STREAM.prototype.captureDictionary = function (matchValue) {
        var dictionary = this.attachState(DICTIONARY).read();
        this.stack.push(dictionary);
        return undefined;
    };
    CONTENT_STREAM.prototype.captureArray = function (matchValue) {
        var array = this.attachState(ARRAY).read();
        this.stack.push(array);
        return undefined;
    };
    CONTENT_STREAM.prototype.captureBytestring = function (matchValue) {
        var buffer = this.attachState(STRING).read();
        this.stack.push(buffer);
        return undefined;
    };
    CONTENT_STREAM.prototype.captureName = function (matchValue) {
        this.stack.push(matchValue[1]);
        return undefined;
    };
    CONTENT_STREAM.prototype.captureBoolean = function (matchValue) {
        this.stack.push(matchValue[0] === 'true');
        return undefined;
    };
    CONTENT_STREAM.prototype.captureFloat = function (matchValue) {
        this.stack.push(parseFloat(matchValue[0]));
        return undefined;
    };
    CONTENT_STREAM.prototype.captureInt = function (matchValue) {
        this.stack.push(parseInt(matchValue[0], 10));
        return undefined;
    };
    return CONTENT_STREAM;
})(lexing_1.MachineState);
exports.CONTENT_STREAM = CONTENT_STREAM;
var ARRAY = (function (_super) {
    __extends(ARRAY, _super);
    function ARRAY() {
        _super.apply(this, arguments);
        this.value = [];
        this.rules = [
            lexing_1.MachineRule(/^\]/, this.pop),
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^/, this.captureObject),
        ];
    }
    ARRAY.prototype.captureObject = function (matchValue) {
        var object = this.attachState(OBJECT).read();
        this.value.push(object);
        return undefined;
    };
    return ARRAY;
})(lexing_1.MachineState);
exports.ARRAY = ARRAY;
var DICTIONARY = (function (_super) {
    __extends(DICTIONARY, _super);
    function DICTIONARY() {
        _super.apply(this, arguments);
        this.value = {};
        this.rules = [
            /**
            > The keyword stream that follows the stream dictionary shall be followed by an end-of-line marker consisting of either a CARRIAGE RETURN and a LINE FEED or just a LINE FEED, and not by a CARRIAGE RETURN alone.
            */
            lexing_1.MachineRule(/^>>\s*stream(\r\n|\n)/, this.popStream),
            lexing_1.MachineRule(/^>>/, this.pop),
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
        ];
    }
    DICTIONARY.prototype.captureName = function (matchValue) {
        var name = matchValue[1];
        this.value[name] = this.attachState(OBJECT).read();
        return undefined;
    };
    /**
    We cannot read the actual stream until we know how long it is, and Length
    might be an object reference. But we can't just stop reading, since an
    indirect object parser wouldn't ever reach the 'endobj' marker. So we hack in
    the PDF, so that we can call pdf._resolveObject on the object reference.
    */
    DICTIONARY.prototype.popStream = function (matchValue) {
        var stream_length = this.value['Length'];
        if (typeof stream_length !== 'number') {
            var pdf = this.iterable['pdf'];
            if (pdf === undefined) {
                throw new Error('Cannot read stream unless a PDF instance is attached to the underlying iterable');
            }
            stream_length = pdf._resolveObject(stream_length);
        }
        var stream_state = new STREAM(this.iterable, this.peek_length);
        stream_state.stream_length = stream_length;
        var buffer = stream_state.read();
        return { dictionary: this.value, buffer: buffer };
    };
    return DICTIONARY;
})(lexing_1.MachineState);
exports.DICTIONARY = DICTIONARY;
var INDIRECT_OBJECT_VALUE = (function (_super) {
    __extends(INDIRECT_OBJECT_VALUE, _super);
    function INDIRECT_OBJECT_VALUE() {
        _super.apply(this, arguments);
        this.rules = [
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^endobj/, this.pop),
            lexing_1.MachineRule(/^/, this.captureValue),
        ];
    }
    INDIRECT_OBJECT_VALUE.prototype.captureValue = function (matchValue) {
        this.value = this.attachState(OBJECT).read();
        return undefined;
    };
    return INDIRECT_OBJECT_VALUE;
})(lexing_1.MachineState);
exports.INDIRECT_OBJECT_VALUE = INDIRECT_OBJECT_VALUE;
var OBJECT = (function (_super) {
    __extends(OBJECT, _super);
    function OBJECT() {
        _super.apply(this, arguments);
        this.rules = [
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^<</, this.captureDictionary),
            lexing_1.MachineRule(/^</, this.captureHexstring),
            // Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
            lexing_1.MachineRule(/^\[/, this.captureArray),
            lexing_1.MachineRule(/^\(/, this.captureBytestring),
            lexing_1.MachineRule(/^([0-9]+)\s+([0-9]+)\s+R/, this.captureReference),
            lexing_1.MachineRule(/^([0-9]+)\s+([0-9]+)\s+obj/, this.captureIndirectObject),
            lexing_1.MachineRule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
            lexing_1.MachineRule(/^true/, this.captureTrue),
            lexing_1.MachineRule(/^false/, this.captureFalse),
            lexing_1.MachineRule(/^null/, this.captureNull),
            lexing_1.MachineRule(/^-?\d*\.\d+/, this.captureFloat),
            lexing_1.MachineRule(/^-?\d+/, this.captureInt),
        ];
    }
    OBJECT.prototype.captureHexstring = function (matchValue) {
        return this.attachState(HEXSTRING).read();
    };
    OBJECT.prototype.captureDictionary = function (matchValue) {
        // DICTIONARY might return a StreamObject
        return this.attachState(DICTIONARY).read();
    };
    OBJECT.prototype.captureArray = function (matchValue) {
        return this.attachState(ARRAY).read();
    };
    OBJECT.prototype.captureBytestring = function (matchValue) {
        var buffer = this.attachState(STRING).read();
        return buffer;
    };
    OBJECT.prototype.captureReference = function (matchValue) {
        return {
            object_number: parseInt(matchValue[1], 10),
            generation_number: parseInt(matchValue[2], 10),
        };
    };
    OBJECT.prototype.captureIndirectObject = function (matchValue) {
        return {
            object_number: parseInt(matchValue[1], 10),
            generation_number: parseInt(matchValue[2], 10),
            value: this.attachState(INDIRECT_OBJECT_VALUE).read(),
        };
    };
    OBJECT.prototype.captureName = function (matchValue) {
        // unescape any #-escaped sequences in the name
        return matchValue[1].replace(/#([A-Fa-f0-9]{2})/g, function (m, m1) { return String.fromCharCode(parseInt(m1, 16)); });
    };
    OBJECT.prototype.captureTrue = function (matchValue) {
        return true;
    };
    OBJECT.prototype.captureFalse = function (matchValue) {
        return false;
    };
    OBJECT.prototype.captureNull = function (matchValue) {
        return null;
    };
    OBJECT.prototype.captureFloat = function (matchValue) {
        return parseFloat(matchValue[0]);
    };
    OBJECT.prototype.captureInt = function (matchValue) {
        return parseInt(matchValue[0], 10);
    };
    return OBJECT;
})(lexing_1.MachineState);
exports.OBJECT = OBJECT;
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
var XREF_WITH_TRAILER = (function (_super) {
    __extends(XREF_WITH_TRAILER, _super);
    function XREF_WITH_TRAILER() {
        _super.apply(this, arguments);
        this.value = {};
        this.rules = [
            // the header line of an XREF consists of the starting object number of
            // the cross references in the following XREF section, followed by a space,
            // followed by the number of cross references in that section, following by
            // a universal newline
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^xref/, this.captureXref),
            lexing_1.MachineRule(/^trailer/, this.captureTrailer),
            lexing_1.MachineRule(/^startxref\s+(\d+)\s+%%EOF/, this.captureStartXref),
        ];
    }
    XREF_WITH_TRAILER.prototype.captureXref = function (matchValue) {
        this.value.cross_references = this.attachState(XREF).read();
        return undefined;
    };
    XREF_WITH_TRAILER.prototype.captureTrailer = function (matchValue) {
        // in particular, a DICTIONARY object
        this.value.trailer = this.attachState(OBJECT).read();
        return undefined;
    };
    XREF_WITH_TRAILER.prototype.captureStartXref = function (matchValue) {
        this.value.startxref = parseInt(matchValue[1], 10);
        return this.value;
    };
    return XREF_WITH_TRAILER;
})(lexing_1.MachineState);
exports.XREF_WITH_TRAILER = XREF_WITH_TRAILER;
var STARTXREF = (function (_super) {
    __extends(STARTXREF, _super);
    function STARTXREF() {
        _super.apply(this, arguments);
        this.rules = [
            lexing_1.MachineRule(/^startxref\s+(\d+)\s+%%EOF/, this.captureStartXref),
        ];
    }
    STARTXREF.prototype.captureStartXref = function (matchValue) {
        return parseInt(matchValue[1], 10);
    };
    return STARTXREF;
})(lexing_1.MachineState);
exports.STARTXREF = STARTXREF;
/**
the header line of an XREF consists of the starting object number of
the cross references in the following XREF section, followed by a space,
followed by the number of cross references in that section, following by
a universal newline
*/
var XREF = (function (_super) {
    __extends(XREF, _super);
    function XREF() {
        _super.apply(this, arguments);
        this.value = [];
        this.rules = [
            lexing_1.MachineRule(/^xref/, this.ignore),
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^(\d+)\s+(\d+)\s*(\r\n|\n|\r)/, this.captureSection),
            lexing_1.MachineRule(/^/, this.pop),
        ];
    }
    XREF.prototype.captureSection = function (matchValue) {
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
    };
    return XREF;
})(lexing_1.MachineState);
exports.XREF = XREF;
var XREF_REFERENCE = (function (_super) {
    __extends(XREF_REFERENCE, _super);
    function XREF_REFERENCE() {
        _super.apply(this, arguments);
        this.rules = [
            lexing_1.MachineRule(/^(\d{10}) (\d{5}) (f|n)( \r| \n|\r\n)/, this.capture),
        ];
    }
    XREF_REFERENCE.prototype.capture = function (matchValue) {
        return {
            // object_number: object_number,
            offset: parseInt(matchValue[1], 10),
            generation_number: parseInt(matchValue[2], 10),
            in_use: matchValue[3] === 'n',
        };
    };
    return XREF_REFERENCE;
})(lexing_1.MachineState);
exports.XREF_REFERENCE = XREF_REFERENCE;
var STREAM = (function (_super) {
    __extends(STREAM, _super);
    function STREAM() {
        _super.apply(this, arguments);
        this.rules = [
            /**
            From PDF32000_2008.pdf:7.3.8
            > There should be an end-of-line marker after the data and before endstream; this marker shall not be included in the stream length. There shall not be any extra bytes, other than white space, between endstream and endobj.
        
            That "should be" is a recommendation. Sometimes there isn't anything, not even
            a newline, before the "endstream" marker.
            */
            lexing_1.MachineRule(/^\s*endstream/, this.pop),
            lexing_1.MachineRule(/^/, this.consumeBytes),
        ];
    }
    /**
    From PDF32000_2008.pdf:7.3.8
    > The sequence of bytes that make up a stream lie between the end-of-line marker following the stream keyword and the endstream keyword; the stream dictionary specifies the exact number of bytes.
    */
    STREAM.prototype.consumeBytes = function (matchValue) {
        if (typeof this.stream_length !== 'number') {
            throw new Error("Stream cannot be read without a numeric length set: " + this.stream_length);
        }
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
    };
    return STREAM;
})(lexing_1.MachineState);
exports.STREAM = STREAM;
function bufferFromUIntBE(value, byteLength) {
    var buffer = new Buffer(byteLength);
    buffer.writeUIntBE(value, 0, byteLength);
    return buffer;
}
var CODESPACERANGE = (function (_super) {
    __extends(CODESPACERANGE, _super);
    function CODESPACERANGE() {
        _super.apply(this, arguments);
        this.value = [];
        this.stack = [];
        this.rules = [
            lexing_1.MachineRule(/^(\r\n|\r|\n)/, this.popStack),
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^</, this.captureHexstring),
            lexing_1.MachineRule(/^endcodespacerange/, this.pop),
        ];
    }
    CODESPACERANGE.prototype.captureHexstring = function (matchValue) {
        var buffer = this.attachState(HEXSTRING).read();
        this.stack.push(buffer);
        return undefined;
    };
    CODESPACERANGE.prototype.popStack = function (matchValue) {
        // stack: [HEX, HEX]
        if (this.stack.length !== 2) {
            throw new Error("Parsing CODESPACERANGE failed; argument stack must be 2-long: " + this.stack);
        }
        var _a = this.stack, start_buffer = _a[0], end_buffer = _a[1];
        this.value.push([start_buffer, end_buffer]);
        this.stack = [];
        return undefined;
    };
    return CODESPACERANGE;
})(lexing_1.MachineState);
exports.CODESPACERANGE = CODESPACERANGE;
/**
not sure how to parse a bfchar like this one:
   <0411><5168 fffd (fffd is repeated 32 times in total)>
String.fromCharCode(parseInt('D840', 16), parseInt('DC3E', 16))
*/
var BFCHAR = (function (_super) {
    __extends(BFCHAR, _super);
    function BFCHAR() {
        _super.apply(this, arguments);
        this.value = [];
        this.stack = [];
        this.rules = [
            lexing_1.MachineRule(/^(\r\n|\r|\n)/, this.popStack),
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^</, this.captureHexstring),
            lexing_1.MachineRule(/^endbfchar/, this.pop),
        ];
    }
    BFCHAR.prototype.captureHexstring = function (matchValue) {
        var buffer = this.attachState(HEXSTRING).read();
        this.stack.push(buffer);
        return undefined;
    };
    BFCHAR.prototype.popStack = function (matchValue) {
        // stack: [HEX, HEX]
        if (this.stack.length !== 2) {
            throw new Error("Parsing BFCHAR failed; argument stack must be 2-long: " + this.stack);
        }
        var _a = this.stack, start_buffer = _a[0], end_buffer = _a[1];
        this.value.push([start_buffer, end_buffer]);
        this.stack = [];
        return undefined;
    };
    return BFCHAR;
})(lexing_1.MachineState);
exports.BFCHAR = BFCHAR;
/**
the typical BFRANGE looks like "<0000> <005E> <0020>"
  which means map 0000 -> 0020, 0001 -> 0021, 0002 -> 0022, and so on, up to 005E -> 007E
the other kind of BFRANGE looks like "<005F> <0061> [<00660066> <00660069> <00660066006C>]"
  which means map 005F -> 00660066, 0060 -> 00660069, and 0061 -> 00660066006C
*/
var BFRANGE = (function (_super) {
    __extends(BFRANGE, _super);
    function BFRANGE() {
        _super.apply(this, arguments);
        this.value = [];
        this.stack = [];
        this.rules = [
            lexing_1.MachineRule(/^(\r\n|\r|\n)/, this.popStack),
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^</, this.captureHexstring),
            lexing_1.MachineRule(/^\[/, this.captureArray),
            lexing_1.MachineRule(/^endbfrange/, this.pop),
        ];
    }
    BFRANGE.prototype.captureHexstring = function (matchValue) {
        var buffer = this.attachState(HEXSTRING).read();
        this.stack.push(buffer);
        return undefined;
    };
    BFRANGE.prototype.captureArray = function (matchValue) {
        var array = this.attachState(ARRAY).read();
        this.stack.push(array);
        return undefined;
    };
    BFRANGE.prototype.popStack = function (matchValue) {
        // stack: [HEX, HEX, HEX | ARRAY<HEX>]
        if (this.stack.length !== 3) {
            throw new Error("Parsing BFRANGE failed; argument stack must be 3-long: " + this.stack);
        }
        var _a = this.stack, start_buffer = _a[0], end_buffer = _a[1], target = _a[2];
        var byteLength = start_buffer.length;
        if (end_buffer.length !== byteLength) {
            throw new Error("Parsing BFRANGE failed; end offset has byteLength=" + end_buffer.length + " but start offset has byteLength=" + byteLength);
        }
        var start_number = start_buffer.readUIntBE(0, byteLength);
        var end_number = end_buffer.readUIntBE(0, byteLength);
        var offset_count = end_number - start_number;
        if (Array.isArray(target)) {
            var target_array = target;
            if (offset_count !== target.length) {
                throw new Error("Parsing BFRANGE failed; target offset array has length=" + target.length + " but end - start = " + offset_count);
            }
            // target is an array of Buffers
            for (var i = 0; i <= offset_count; i++) {
                var from_buffer = bufferFromUIntBE(start_number + i, byteLength);
                var target_buffer = target_array[i];
                this.value.push([from_buffer, target_buffer]);
            }
        }
        else {
            // target is a single Buffer. each of the characters get transformed by the offset
            var target_start_buffer = target;
            var offset = target_start_buffer.readUIntBE(0, target_start_buffer.length) - start_number;
            for (var i = 0; i <= offset_count; i++) {
                var from_buffer = bufferFromUIntBE(start_number + i, byteLength);
                var target_buffer = bufferFromUIntBE(start_number + i + offset, byteLength);
                this.value.push([from_buffer, target_buffer]);
            }
        }
        this.stack = [];
        return undefined;
    };
    return BFRANGE;
})(lexing_1.MachineState);
exports.BFRANGE = BFRANGE;
var CMAP = (function (_super) {
    __extends(CMAP, _super);
    function CMAP() {
        _super.apply(this, arguments);
        this.codeSpaceRanges = [];
        this.mapping = [];
        this.rules = [
            lexing_1.MachineRule(/^\s+/, this.ignore),
            lexing_1.MachineRule(/^begincodespacerange\s+/, this.captureCodeSpaceRange),
            lexing_1.MachineRule(/^beginbfchar\s+/, this.captureBFChar),
            lexing_1.MachineRule(/^beginbfrange\s+/, this.captureBFRange),
            lexing_1.MachineRule(/^$/, this.pop),
            lexing_1.MachineRule(/^\S+/, this.ignore),
        ];
    }
    CMAP.prototype.captureCodeSpaceRange = function (matchValue) {
        var ranges = this.attachState(CODESPACERANGE).read();
        Arrays.pushAll(this.codeSpaceRanges, ranges);
        return undefined;
    };
    CMAP.prototype.captureBFChar = function (matchValue) {
        var pairs = this.attachState(BFCHAR).read();
        Arrays.pushAll(this.mapping, pairs);
        return undefined;
    };
    CMAP.prototype.captureBFRange = function (matchValue) {
        var pairs = this.attachState(BFRANGE).read();
        Arrays.pushAll(this.mapping, pairs);
        return undefined;
    };
    CMAP.prototype.pop = function () {
        var byteLengths = this.codeSpaceRanges.map(function (codeSpaceRange) { return codeSpaceRange[0].length; });
        if (!byteLengths.every(function (byteLength) { return byteLength === byteLengths[0]; })) {
            throw new Error("Mismatched byte lengths in code space ranges in CMap: " + byteLengths.join(', '));
        }
        return {
            codeSpaceRanges: this.codeSpaceRanges,
            mapping: this.mapping,
            byteLength: byteLengths[0],
        };
    };
    return CMAP;
})(lexing_1.MachineState);
exports.CMAP = CMAP;
