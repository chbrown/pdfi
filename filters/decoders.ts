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
function ASCII85Lexer(input: Buffer) {
  var i = 0;
  return function(): any {
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
      else if (next == 9 || next == 10 || next == 13 || next == 32) { // \t, \n, \r, or ' '
        // ignore
      }
      else if (next == 122) { // 'z'
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
  }
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
export function ASCII85Decode(ascii: Buffer): Buffer {
  // ascii.length * (4 / 5) <- we can't use this for the length since we have
  // to ignore newlines and handle z's specially

  var c0_pow = 52200625; // 85^4
  var c1_pow = 614125; // 85^3
  var c2_pow = 7225; // 85^2
  var c3_pow = 85; // 85^1

  // var binary_length = 0;
  var bytes: number[] = [];

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

/**
This returns a function that can be called multiple times.

When that function is called, it will return one of the following types:
- An array of 2 ASCII characters (possibly with a final padding byte of 0).
- null, when the EOF has been reached.
*/
function ASCIIHexLexer(input: Buffer): () => any {
  var index = 0;
  return function(): any {
    var stack = [];
    while (1) {
      var next = input[index++];
      if (next === undefined || next == 62) { // 0x3E == 62 == '>' (EOF)
        if (stack.length > 0) {
          if (stack.length == 1) {
            stack.push(0);
          }
          return stack;
        }
        return null;
      }
      else if (next === 0 || next === 9 || next === 10 || next === 12 || next === 13 || next === 32) {
        // ignore whitespace: NULL, TAB, LF, FF, CR, SP (0 9 10 12 13 32)
      }
      else {
        // TODO: check that next is in the range 0-9, A-F, or a-f
        var stack_size = stack.push(next);
        if (stack_size === 2) {
          return stack;
        }
      }
    }
  }
}

/**
> The ASCIIHexDecode filter shall produce one byte of binary data for each pair of ASCII hexadecimal digits (0–9 and A–F or a–f). All white-space characters (see 7.2, "Lexical Conventions") shall be ignored. A GREATER-THAN SIGN (3Eh) indicates EOD. Any other characters shall cause an error. If the filter encounters the EOD marker after reading an odd number of hexadecimal digits, it shall behave as if a 0 (zero) followed the last digit.
*/
export function ASCIIHexDecode(ascii: Buffer): Buffer {
  var lex = ASCIIHexLexer(ascii);
  var bytes: number[] = [];
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

export function FlateDecode(buffer: Buffer): Buffer {
  return zlib.inflateSync(buffer);
}
