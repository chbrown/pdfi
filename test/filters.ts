/// <reference path="../type_declarations/index.d.ts" />
import assert = require('assert');

import decoders = require('../filters/decoders');

describe('pdf filters/decoders: ASCII85Decode', function() {

  it('should decode an ascii string', function() {
    var output = decoders.ASCII85Decode(new Buffer('87cURD]j7BEbo80'));
    assert.deepEqual(output, new Buffer('Hello world!'));
  });

  it('should decode an ascii string with an EOF marker', function() {
    var output = decoders.ASCII85Decode(new Buffer('87cURD]j7BEbo80~>'));
    assert.deepEqual(output, new Buffer('Hello world!'));
  });

  it('should decode a buffer of 0xFF bytes', function() {
    var output = decoders.ASCII85Decode(new Buffer('s8W-!'));
    assert.deepEqual(output, new Buffer([255, 255, 255, 255]));
  });

  it('should decode a random buffer of length 12', function() {
    var output = decoders.ASCII85Decode(new Buffer("%V'A!!<ZDmrr"));
    assert.deepEqual(output, new Buffer([14, 99, 109, 203, 1, 3, 87, 155, 255]));
  });

  it('should decode a random buffer of length 5', function() {
    // e.g., comparison point: python3.4 >>> import base64; base64.a85encode(bytes([200, 8, 104, 63]))
    var output = decoders.ASCII85Decode(new Buffer('a9ZHD'));
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
    var output = decoders.ASCII85Decode(new Buffer(input));
    assert.deepEqual(output, new Buffer(`Man is distinguished, not only by his reason, but by this singular passion from other animals, which is a lust of the mind, that by a perseverance of delight in the continued and indefatigable generation of knowledge, exceeds the short vehemence of any carnal pleasure.`));
  });

  it('should decode EXAMPLE 3 from PDF32000_2008.pdf:7.4.1', function() {
    var input = "<< /Length 534 /Filter [/ASCII85Decode /LZWDecode] >> stream J..)6T`?p&<!J9%_[umg\"B7/Z7KNXbN'S+,*Q/&\"OLT'F LIDK#!n`$\"<Atdi`\\Vn%b%)&'cA*VnK\\CJY(sF>c!Jnl@ RM]WM;jjH6Gnc75idkL5]+cPZKEBPWdR>FF(kj1_R%W_d &/jS!;iuad7h?[L-F$+]]0A3Ck*$I0KZ?;<)CJtqi65Xb Vc3\\n5ua:Q/=0$W<#N3U;H,MQKqfg1?:lUpR;6oN[C2E4 ZNr8Udn.'p+?#X+1>0Kuk$bCDF/(3fL5]Oq)^kJZ!C2H1 'TO]Rl?Q:&'<5&iP!$Rq;BXRecDN[IJB`,)o8XJOSJ9sD S]hQ;Rj@!ND)bD_q&C\\g:inYC%)&u#:u,M6Bm%IY!Kb1+ \":aAa'S`ViJglLb8<W9k6Yl\\\\0McJQkDeLWdPN?9A'jX* al>iG1p&i;eVoK&juJHs9%;Xomop\"5KatWRT\"JQ#qYuL, JD?M$0QP)lKn06l1apKDC@\\qJ4B!!(5m+j.7F790m(Vj8 8l8Q:_CZ(Gm1%X\\N1&u!FKHMB~>\nendstream";
  });
});
