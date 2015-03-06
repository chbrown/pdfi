/// <reference path="../type_declarations/index.d.ts" />
import assert = require('assert');

import filters = require('../filters');

describe('pdf filters: ASCII85Decode', function() {

  it('should decode an ascii string', function() {
    var output = filters.ASCII85Decode(new Buffer('87cURD]j7BEbo80'));
    assert.deepEqual(output, new Buffer('Hello world!'));
  });

  it('should decode an ascii string with an EOF marker', function() {
    var output = filters.ASCII85Decode(new Buffer('87cURD]j7BEbo80~>'));
    assert.deepEqual(output, new Buffer('Hello world!'));
  });

  it('should decode a buffer of 0xFF bytes', function() {
    var output = filters.ASCII85Decode(new Buffer('s8W-!'));
    assert.deepEqual(output, new Buffer([255, 255, 255, 255]));
  });

  it('should decode a random buffer of length 12', function() {
    var output = filters.ASCII85Decode(new Buffer("%V'A!!<ZDmrr"));
    assert.deepEqual(output, new Buffer([14, 99, 109, 203, 1, 3, 87, 155, 255]));
  });

  it('should decode a random buffer of length 5', function() {
    // e.g., comparison point: python3.4 >>> import base64; base64.a85encode(bytes([200, 8, 104, 63]))
    var output = filters.ASCII85Decode(new Buffer('a9ZHD'));
    assert.deepEqual(output, new Buffer([200, 8, 104, 63]));
  });

  it('should decode the leviathan example from wikipedia', function() {
    var input = [
      '9jqo^BlbD-BleB1DJ+*+F(f,q/0JhKF<GL>Cj@.4Gp$d7F!,L7@<6@)/0JDEF<G%<+EV:2F!,',
      'O<DJ+*.@<*K0@<6L(Df-\\0Ec5e;DffZ(EZee.Bl.9pF"AGXBPCsi+DGm>@3BB/F*&OCAfu2/AKY',
      'i(DIb:@FD,*)+C]U=@3BN#EcYf8ATD3s@q?d$AftVqCh[NqF<G:8+EV:.+Cf>-FD5W8ARlolDIa',
      "l(DId<j@<?3r@:F%a+D58'ATD4$Bl@l3De:,-DJs`8ARoFb/0JMK@qB4^F!,R<AKZ&-DfTqBG%G",
      ">uD.RTpAKYo'+CT/5+Cei#DII?(E,9)oF*2M7/c",
    ].join('\n');
    var output = filters.ASCII85Decode(new Buffer(input));
    assert.deepEqual(output, new Buffer(`Man is distinguished, not only by his reason, but by this singular passion from other animals, which is a lust of the mind, that by a perseverance of delight in the continued and indefatigable generation of knowledge, exceeds the short vehemence of any carnal pleasure.`));
  });

});
