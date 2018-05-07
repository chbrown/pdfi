import test from 'ava';

import * as decoders from '../filters/decoders';

test('pdf filters/decoders: ASCII85Decode should decode an ascii string', t => {
  var output = decoders.ASCII85Decode(Buffer.from('87cURD]j7BEbo80'));
  t.deepEqual(output, Buffer.from('Hello world!'));
});

test('pdf filters/decoders: ASCII85Decode should decode an ascii string with an EOF marker', t => {
  var output = decoders.ASCII85Decode(Buffer.from('87cURD]j7BEbo80~>'));
  t.deepEqual(output, Buffer.from('Hello world!'));
});

test('pdf filters/decoders: ASCII85Decode should decode a buffer of 0xFF bytes', t => {
  var output = decoders.ASCII85Decode(Buffer.from('s8W-!'));
  t.deepEqual(output, Buffer.from([255, 255, 255, 255]));
});

test('pdf filters/decoders: ASCII85Decode should decode a random buffer of length 12', t => {
  var output = decoders.ASCII85Decode(Buffer.from("%V'A!!<ZDmrr"));
  t.deepEqual(output, Buffer.from([14, 99, 109, 203, 1, 3, 87, 155, 255]));
});

test('pdf filters/decoders: ASCII85Decode should decode a random buffer of length 5', t => {
  // e.g., comparison point: python3.4 >>> import base64; base64.a85encode(bytes([200, 8, 104, 63]))
  var output = decoders.ASCII85Decode(Buffer.from('a9ZHD'));
  t.deepEqual(output, Buffer.from([200, 8, 104, 63]));
});

test('pdf filters/decoders: ASCII85Decode should decode the leviathan example from wikipedia', t => {
  var input = [
    '9jqo^BlbD-BleB1DJ+*+F(f,q/0JhKF<GL>Cj@.4Gp$d7F!,L7@<6@)/0JDEF<G%<+EV:2F!,',
    'O<DJ+*.@<*K0@<6L(Df-\\0Ec5e;DffZ(EZee.Bl.9pF"AGXBPCsi+DGm>@3BB/F*&OCAfu2/AKY',
    'i(DIb:@FD,*)+C]U=@3BN#EcYf8ATD3s@q?d$AftVqCh[NqF<G:8+EV:.+Cf>-FD5W8ARlolDIa',
    "l(DId<j@<?3r@:F%a+D58'ATD4$Bl@l3De:,-DJs`8ARoFb/0JMK@qB4^F!,R<AKZ&-DfTqBG%G",
    ">uD.RTpAKYo'+CT/5+Cei#DII?(E,9)oF*2M7/c",
  ].join('\n');
  var output = decoders.ASCII85Decode(Buffer.from(input));
  t.deepEqual(output, Buffer.from(`Man is distinguished, not only by his reason, but by this singular passion from other animals, which is a lust of the mind, that by a perseverance of delight in the continued and indefatigable generation of knowledge, exceeds the short vehemence of any carnal pleasure.`));
});

/*
|               8F              |               67              |
|       8               F       |       6               7       |
|_______________________________|_______________________________|
| 1 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | 1 | 1 |
| 0b100011110 = 286 = 0x11E         | 0b11 =| 00111 = 7 = 0x7   |
|                                   | 4 =   |                   |
|                                   | 0x4   |                   |
*/

test('pdf filters/decoders: LZWDecode should iterate through a bit string correctly', t => {
  var buffer = Buffer.from([0x8F, 0x67]);
  var bits = new decoders.BitIterator(buffer);
  //
  var actual: number[] = [bits.next(9), bits.next(2), bits.next(5)];
  t.deepEqual(actual, [286, 3, 7]);
});

test('pdf filters/decoders: LZWDecode should iterate through another bit string correctly', t => {
  var buffer = Buffer.from([0x80, 0x0B, 0x60, 0x50, 0x22, 0x0C, 0x0C, 0x85, 0x01]);
  var bit_iterator = new decoders.BitIterator(buffer);
  //
  var actual: number[] = [];
  while (bit_iterator.length > bit_iterator.offset) {
    var code = bit_iterator.next(9);
    actual.push(code);
  }
  var expected = [256, 45, 258, 258, 65, 259, 66, 257];
  t.deepEqual(actual, expected);
});

test('pdf filters/decoders: LZWDecode should LZW decode the example from the PDF spec (7.4.4.2, Example 2)', t => {
  var encoded = Buffer.from([0x80, 0x0B, 0x60, 0x50, 0x22, 0x0C, 0x0C, 0x85, 0x01]);
  var actual = decoders.LZWDecode(encoded);
  var expected = Buffer.from([45, 45, 45, 45, 45, 65, 45, 45, 45, 66]);
  t.deepEqual(actual, expected);
});
