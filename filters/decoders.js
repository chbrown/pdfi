/// <reference path="../type_declarations/index.d.ts" />
var zlib = require('zlib');
/**

FILTER name     [Has Parameters] Description
ASCIIHexDecode  [no]    Decodes data encoded in an ASCII hexadecimal representation, reproducing the original binary data.
ASCII85Decode   [no]    Decodes data encoded in an ASCII base-85 representation, reproducing the original binary data.
LZWDecode       [yes]   Decompresses data encoded using the LZW (Lempel-Ziv- Welch) adaptive compression method, reproducing the original text or binary data.
FlateDecode     [yes]   (PDF 1.2) Decompresses data encoded using the zlib/deflate compression method, reproducing the original text or binary data.
RunLengthDecode [no]    Decompresses data encoded using a byte-oriented run-length encoding algorithm, reproducing the original text or binary data (typically monochrome image data, or any data that contains frequent long runs of a single byte value).
CCITTFaxDecode  [yes]   Decompresses data encoded using the CCITT facsimile standard, reproducing the original data (typically monochrome image data at 1 bit per pixel).
JBIG2Decode     [yes]   (PDF1.4) Decompresses data encoded using the JBIG2 standard, reproducing the original monochrome (1 bit per pixel) image data (or an approximation of that data).
DCTDecode       [yes]   Decompresses data encoded using a DCT (discrete cosine transform) technique based on the JPEG standard, reproducing image sample data that approximates the original data.
JPXDecode       [no]    (PDF 1.5) Decompresses data encoded using the wavelet- based JPEG2000 standard, reproducing the original image data.
Crypt           [yes]   (PDF 1.5) Decrypts data encrypted by a security handler, reproducing the data as it was before encryption.

callback: Function(Error, String)
*/
/**
This returns a function that can be called multiple times.

When that function is called, it will return one of the following types:
- An array of 1 to 5 ASCII characters
- The string 'ZERO'
- null, when the EOF has been reached.

*/
function ASCII85Lexer(input) {
    var i = 0;
    return function () {
        var stack = [];
        while (1) {
            var next = input[i++];
            if (next === undefined) {
                if (stack.length !== 0) {
                    return stack;
                }
                return null;
            }
            else if (next == 126 && input[i] == 62) {
                i++;
                if (input.length > i) {
                    throw new Error('EOF marker (~>) reached before the end of the input');
                }
            }
            else if (next == 9 || next == 10 || next == 13 || next == 32) {
            }
            else if (next == 122) {
                if (stack.length !== 0) {
                    throw new Error('The "z" character cannot occur in the middle of a group');
                }
                return 'ZERO';
            }
            else {
                var stack_size = stack.push(next);
                if (stack_size === 5) {
                    return stack;
                }
            }
        }
    };
}
/**
`ascii` is a buffer in base-85 encoding. The output is a buffer that is 4/5 as long.

All values are in the range 0x21-0x75 == 33-117 == '!'-'u' and 0x7A == 122 == 'z'

0x7E,0x3E == 126,62 == '~>' serves as the EOF marker

While decoding, all whitespace should be ignored. Any other invalid characters should produce an error.

http://en.wikipedia.org/wiki/Ascii85 is helpful, as well as PDF32000_2008.pdf:7.4.3

TODO:
throw when encountering a 'z' inside a group (or any other out-of-range character)
throw when a final group contains only one character
*/
function ASCII85Decode(ascii) {
    // ascii.length * (4 / 5) <- we can't use this for the length since we have
    // to ignore newlines and handle z's specially
    var c0_pow = 52200625; // 85^4
    var c1_pow = 614125; // 85^3
    var c2_pow = 7225; // 85^2
    var c3_pow = 85; // 85^1
    // var binary_length = 0;
    var bytes = [];
    var lex = ASCII85Lexer(ascii);
    while (1) {
        var token = lex();
        if (token === null) {
            break;
        }
        else if (token === 'ZERO') {
            bytes.push(0, 0, 0, 0);
        }
        else {
            // pad the current stack with u's == 117 if needed
            // TODO: optimize this
            var padded_token = token;
            if (token.length !== 5) {
                padded_token = token.concat(117, 117, 117, 117).slice(0, 5);
            }
            // subtract 33 == '!' for each ascii character code
            var c0 = (padded_token[0] - 33);
            var c1 = (padded_token[1] - 33);
            var c2 = (padded_token[2] - 33);
            var c3 = (padded_token[3] - 33);
            var c4 = (padded_token[4] - 33);
            var sum = c0 * c0_pow + c1 * c1_pow + c2 * c2_pow + c3 * c3_pow + c4;
            var b0 = (sum >> 24);
            // var b1 = (sum >> 16) - (b0 << 8);
            var b1 = (sum >> 16) & 255;
            // var b2 = (sum >>  8) - (b1 << 8) - (b0 << 16);
            var b2 = (sum >> 8) & 255;
            // var b3 = (sum      ) - (b2 << 8) - (b1 << 16) - (b0 << 24);
            var b3 = sum & 255;
            // if the final chunk has 4 chars -> 3 byte; 3 chars -> 2 bytes; 2 chars -> 1 byte
            if (token.length === 5) {
                bytes.push(b0, b1, b2, b3);
            }
            else if (token.length === 4) {
                bytes.push(b0, b1, b2);
            }
            else if (token.length === 3) {
                bytes.push(b0, b1);
            }
            else if (token.length === 2) {
                bytes.push(b0);
            }
        }
    }
    return new Buffer(bytes);
}
exports.ASCII85Decode = ASCII85Decode;
/**
This returns a function that can be called multiple times.

When that function is called, it will return one of the following types:
- An array of 2 ASCII characters (possibly with a final padding byte of 0).
- null, when the EOF has been reached.
*/
function ASCIIHexLexer(input) {
    var index = 0;
    return function () {
        var stack = [];
        while (1) {
            var next = input[index++];
            if (next === undefined || next == 62) {
                if (stack.length > 0) {
                    if (stack.length == 1) {
                        stack.push(0);
                    }
                    return stack;
                }
                return null;
            }
            else if (next === 0 || next === 9 || next === 10 || next === 12 || next === 13 || next === 32) {
            }
            else {
                // TODO: check that next is in the range 0-9, A-F, or a-f
                var stack_size = stack.push(next);
                if (stack_size === 2) {
                    return stack;
                }
            }
        }
    };
}
/**
> The ASCIIHexDecode filter shall produce one byte of binary data for each pair of ASCII hexadecimal digits (0–9 and A–F or a–f). All white-space characters (see 7.2, "Lexical Conventions") shall be ignored. A GREATER-THAN SIGN (3Eh) indicates EOD. Any other characters shall cause an error. If the filter encounters the EOD marker after reading an odd number of hexadecimal digits, it shall behave as if a 0 (zero) followed the last digit.
*/
function ASCIIHexDecode(ascii) {
    var lex = ASCIIHexLexer(ascii);
    var bytes = [];
    while (1) {
        var token = lex();
        if (token === null) {
            break;
        }
        else {
            var pair = new Buffer(token).toString('ascii');
            var byte = parseInt(pair, 16);
            bytes.push(byte);
        }
    }
    return new Buffer(bytes);
}
exports.ASCIIHexDecode = ASCIIHexDecode;
function FlateDecode(buffer, decodeParms) {
    var inflated = zlib.inflateSync(buffer);
    if (decodeParms && decodeParms.Predictor && decodeParms.Columns) {
        if (decodeParms.Predictor !== 12) {
            throw new Error("Unsupported DecodeParms.Predictor value: \"" + decodeParms.Predictor + "\"");
        }
        // references:
        // PDF32000_2008.pdf:7.4.4.4 "LZW and Flate Predictor Functions"
        // http://tools.ietf.org/html/rfc2083#page-33
        // https://forums.adobe.com/thread/664902
        var columns = decodeParms.Columns;
        var rows = inflated.length / (columns + 1);
        var decoded = new Buffer(rows * columns); // decoded.fill(0);
        inflated.copy(decoded, 0, 1, columns + 1);
        // assuming PNG predictor == 2
        for (var row = 1; row < rows; row++) {
            for (var column = 0; column < columns; column++) {
                decoded[row * columns + column] = decoded[(row - 1) * columns + column] + inflated[row * (columns + 1) + (column + 1)];
            }
        }
        return decoded;
    }
    return inflated;
}
exports.FlateDecode = FlateDecode;
var BitIterator = (function () {
    function BitIterator(buffer) {
        /** The number of bits from the front of the buffer */
        this.offset = 0;
        this.buffer = buffer;
        this.length = buffer.length * 8;
    }
    /**
    Read the next `n` bits from the underlying buffer, but do not advance the offset.
    */
    BitIterator.prototype.peek = function (n) {
        var start = Math.floor(this.offset / 8);
        var end = Math.ceil((this.offset + n) / 8);
        var byteLength = end - start;
        // (end - start) is the number of bytes we need to read to extract the
        // desired bits.
        var bytes = this.buffer.slice(start, end);
        // readUIntBE(offset: number, byteLength: number, noAssert?: boolean): number;
        var uint = this.buffer['readUIntBE'](start, byteLength);
        // first, we push some bits off the right edge.
        //   offset % 8 is distance to our bits from the left edge of uint
        //   so ((offset % 8) + n) is the distance from the left edge of uint to the right edge of our bits
        //   and (byteLength * 8) - ((offset % 8) + n) is the distance from the right edge to the right edge of our bits
        var base = uint >> (byteLength * 8) - ((this.offset % 8) + n);
        // we need to chop off some bits from the front. The max number we can return
        // if we are asking for n bits, is 2^n - 1 == (2 << (n - 1)) - 1
        var code = base & ((2 << (n - 1)) - 1);
        return code;
    };
    /**
    Read the next `n` bits from the underlying buffer and advance the offset by `n`.
    */
    BitIterator.prototype.next = function (n) {
        var code = this.peek(n);
        // advance
        this.offset += n;
        return code;
    };
    return BitIterator;
})();
exports.BitIterator = BitIterator;
/**
Each code shall represent:
* a single character of input data (0–255)
* a clear-table marker (256)
* an EOD marker (257)
* a table entry representing a multiple-character sequence that has been encountered previously in the input (258 or greater).

The encoder shall execute the following sequence of steps to generate each output code:
a) Accumulate a sequence of one or more input characters matching a sequence already present in the table. For maximum compression, the encoder looks for the longest such sequence.
b) Emit the code corresponding to that sequence.
c) Create a new table entry for the first unused code. Its value is the sequence found in step (a) followed by the next input character.

From Wikipedia's http://en.wikipedia.org/wiki/Lempel-Ziv-Welch:
> In order to rebuild the dictionary in the same way as it was built during encoding, it also obtains the next value from the input and adds to the dictionary the concatenation of the current string and the first character of the string obtained by decoding the next input value, or THE FIRST CHARACTER OF THE STRING JUST OUTPUT IF THE NEXT VALUE CAN NOT BE DECODED (If the next value is unknown to the decoder, then it must be the value that will be added to the dictionary this iteration, and so its first character must be the same as the first character of the current string being sent to decoded output). The decoder then proceeds to the next input value (which was already read in as the "next value" in the previous pass) and repeats the process until there is no more input, at which point the final input value is decoded without any more additions to the dictionary.
*/
function LZWDecode(buffer) {
    // logger.error(`Using LZWDecode on buffer of length ${buffer.length}`);
    var bits = new BitIterator(buffer);
    var tableMax;
    var table;
    var chunks = [];
    var codeLength = 9;
    while (bits.length > bits.offset) {
        var code = bits.next(codeLength);
        if (code == 256) {
            table = {};
            tableMax = 257;
        }
        else if (code == 257) {
            break;
        }
        else {
            // emit the table buffer, or a single character if there is no table entry
            var outputChunk = (code < 255) ? new Buffer([code]) : table[code];
            chunks.push(outputChunk);
            // add the corresponding new table entry
            var nextCode = bits.peek(codeLength);
            // the default next code is a basic character code in the range 0-255
            var nextPrefix = nextCode;
            // but it may be outside that range
            if (nextCode === 256 || nextCode === 257) {
                // it's a control code; so it doesn't really matter
                nextPrefix = 0;
            }
            else if (nextCode > tableMax) {
                // if we don't know the next code, it must be a doubling table entry,
                // which equates to: outputChunk + outputChunk[0]
                nextPrefix = outputChunk[0];
            }
            else if (nextCode > 257) {
                // otherwise we can look it up from the table entry
                nextPrefix = table[nextCode][0];
            }
            var tableChunk = Buffer.concat([outputChunk, new Buffer([nextPrefix])]);
            var tableIndex = tableMax + 1;
            table[tableIndex] = tableChunk;
            // The first output code that is 10 bits long shall be the one following the creation of table entry 511, and similarly for 11 (1023) and 12 (2047) bits. Codes shall never be longer than 12 bits; therefore, entry 4095 is the last entry of the LZW table.
            if (tableIndex == 511) {
                codeLength++;
            }
            else if (tableIndex == 1023) {
                codeLength++;
            }
            else if (tableIndex == 2047) {
                codeLength++;
            }
            // finally, increment our table entry cursor
            tableMax++;
        }
    }
    return Buffer.concat(chunks);
}
exports.LZWDecode = LZWDecode;
var decoders = {
    ASCII85Decode: ASCII85Decode,
    ASCIIHexDecode: ASCIIHexDecode,
    FlateDecode: FlateDecode,
    LZWDecode: LZWDecode,
};
function decodeBuffer(buffer, filters, decodeParmss) {
    filters.forEach(function (filter, i) {
        var decoder = decoders[filter];
        if (decoder !== undefined) {
            buffer = decoder(buffer, decodeParmss ? decodeParmss[i] : undefined);
        }
        else {
            throw new Error("Could not find decoder named \"" + filter + "\" to fully decode stream");
        }
    });
    return buffer;
}
exports.decodeBuffer = decodeBuffer;
