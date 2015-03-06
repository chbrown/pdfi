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

0x7E,0x3E == 122,62 == '~>' serves as the EOF marker

While decoding, all whitespace should be ignored. Any other invalid characters should produce an error.

Specifically, ASCII base-85 encoding shall produce 5 ASCII characters for every 4 bytes of binary data. Each group of 4 binary input bytes, (b1 b2 b3 b4), shall be converted to a group of 5 output bytes, (c1 c2 c3 c4 c5), using the relation

(b1 × 2563) + (b2 × 2562) + (b3 × 2561) + b4 = (c1 × 854) + (c2 × 853) + (c3 × 852) + (c4 × 851) + c

In other words, 4 bytes of binary data shall be interpreted as a base-256 number and then shall be converted to a base-85 number. The five bytes of the base-85 number shall then be converted to ASCII characters by adding 33 (the ASCII code for the character !) to each. The resulting encoded data shall contain only printable ASCII characters with codes in the range 33 (!) to 117 (u). As a special case, if all five bytes are 0, they shall be represented by the character with code 122 (z) instead of by five exclamation points (!!!!!).

If the length of the data to be encoded is not a multiple of 4 bytes, the last, partial group of 4 shall be used to produce a last, partial group of 5 output characters. Given n (1, 2, or 3) bytes of binary data, the encoder shall first append 4 - n zero bytes to make a complete group of 4. It shall encode this group in the usual way, but shall not apply the special z case. Finally, it shall write only the first n + 1 characters of the resulting group of 5. These characters shall be immediately followed by the ~> EOD marker.

The following conditions shall never occur in a correctly encoded byte sequence:
• The value represented by a group of 5 characters is greater than 232 - 1.
• A z character occurs in the middle of a group.
• A final partial group contains only one character.


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
// exports.apply = function(stream, dictionary, callback) {
// };
