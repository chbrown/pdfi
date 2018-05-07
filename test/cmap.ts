import test, {ExecutionContext} from 'ava';

import {parseCMap} from '../parsers/index';

function check(input: string, expected: any, t: ExecutionContext) {
  var output = parseCMap(Buffer.from(input));
  var message = `parse result does not match expected output.
      parse("${input}") => ${JSON.stringify(output)}
      but should == ${JSON.stringify(expected)}`;
  t.deepEqual(output, expected, message);
}

test('CMap parser should parse simple byteLength=1 bfrange', t => {
  var input = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CMapType 2 def
/CMapName/R109 def
1 begincodespacerange
<00><ff>
endcodespacerange
4 beginbfrange
<00><00><2212>
<01><01><00b7>
<02><02><00d7>
<14><15><2264>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end end`;
  var expected = {
    "codeSpaceRanges": [{"low":0, "high":255}],
    "mappings": [
      {"src":0, "dst":"−", "byteLength":1},
      {"src":1, "dst":"·", "byteLength":1},
      {"src":2, "dst":"×", "byteLength":1},
      {"src":20, "dst":"≤", "byteLength":1},
      {"src":21, "dst":"≥", "byteLength":1},
    ],
    "byteLength": 1,
  };
  check(input, expected, t);
});

test('CMap parser should parse simple byteLength=2 bfchar', t => {
  var input = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo
<< /Registry (Softland) /Ordering (Identity) /Supplement 0 >> def
/CMapName /Softland def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
4 beginbfchar
<010F> <0062>
<03EC> <0030>
<03ED> <0031>
<03EE> <0032>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
  var expected = {
    "codeSpaceRanges": [{"low":0, "high":65535}],
    "mappings": [
      {"src":271, "dst":"b", "byteLength":2},
      {"src":1004, "dst":"0", "byteLength":2},
      {"src":1005, "dst":"1", "byteLength":2},
      {"src":1006, "dst":"2", "byteLength":2},
    ],
    "byteLength": 2,
  };
  check(input, expected, t);
});

test('CMap parser should parse single bfchar', t => {
  var input = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo
<< /Registry (Adobe)
/Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfchar
<0078> <2022>
endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end`;
  var expected = {
    "codeSpaceRanges": [{"low":0, "high":65535}],
    "mappings": [
      {"src":120, "dst":"•", "byteLength":2},
    ],
    "byteLength": 2,
  };
  check(input, expected, t);
});

test('CMap parser should parse multiple bfchars and bfrange', t => {
  var input = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo <<
/Registry (Adobe)
/Ordering (UCS)
/Supplement 0
>> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<00><FF>
endcodespacerange
1 beginbfchar
<2c><0009 000d 0020 00a0>
endbfchar
1 beginbfchar
<43><002d 00ad 2010>
endbfchar
6 beginbfrange
<21><21><0031>
<22><22><002e>
<23><23><0049>
<24><24><006e>
<25><25><0074>
<26><26><0072>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
  var expected = {
    "codeSpaceRanges": [
      {"low": 0, "high": 255},
    ],
    "mappings": [
      {"src": 44, "dst": "\t\r  ", "byteLength": 1},
      {"src": 67, "dst": "-­‐", "byteLength": 1},
      {"src": 33, "dst": "1", "byteLength": 1},
      {"src": 34, "dst": ".", "byteLength": 1},
      {"src": 35, "dst": "I", "byteLength": 1},
      {"src": 36, "dst": "n", "byteLength": 1},
      {"src": 37, "dst": "t", "byteLength": 1},
      {"src": 38, "dst": "r", "byteLength": 1},
    ],
    "byteLength": 1,
  };
  check(input, expected, t);
});

test('CMap parser should parse multiple code space ranges', t => {
  var input = `%!PS-Adobe-3.0 Resource-CMap
%%DocumentNeededResources: ProcSet (CIDInit)
%%IncludeResource: ProcSet (CIDInit)
%%BeginResource: CMap (90ms-RKSJ-H)
%%Title: (90ms-RKSJ-H Adobe Japan1 2)
%%Version: 10.001
%%Copyright: Copyright 1990-2001 Adobe Systems Inc.
%%Copyright: All Rights Reserved.
%%EndComments
/CIDInit /ProcSet findresource begin 12 dict begin
begincmap
/CIDSystemInfo
3 dict dup begin /Registry (Adobe) def /Ordering (Japan1) def /Supplement 2 def
end def
/CMapName /90ms-RKSJ-H def /CMapVersion 10.001 def /CMapType 1 def
/UIDOffset 950 def
/XUID [1 10 25343] def /WMode 0 def
4 begincodespacerange
<00> <80>
<8140> <9FFC>
<A0> <DF>
<E040> <FCFC>
endcodespacerange
1 beginnotdefrange
<00> <1F> 231
endnotdefrange
100 begincidrange
<20> <7D> 231
<7E> <7E> 631
<8140> <817E> 633
<8180> <81AC> 696
<81B8> <81BF> 741
<81C8> <81CE> 749
<FB40> <FB7E> 8518
<FB80> <FBFC> 8581
<FC40> <FC4B> 8706
endcidrange
endcmap
CMapName currentdict /CMap defineresource pop end
end
%%EndResource
%%EOF`;
  var expected = {
    "codeSpaceRanges": [
      {"low": 0, "high": 128},
      {"low": 33088, "high": 40956},
      {"low": 160, "high": 223},
      {"low": 57408, "high": 64764},
    ],
    "mappings": [],
    "byteLength": 1,
  };
  check(input, expected, t);
});

// /CIDInit /ProcSet findresource begin
// 12 dict begin
// begincmap
// /CIDSystemInfo
// << /Registry (Adobe)
// /Ordering (UCS) /Supplement 0 >> def
// /CMapName /Adobe-Identity-UCS def
// /CMapType 2 def
// 1 begincodespacerange
// <0000> <FFFF>
// endcodespacerange
// 9 beginbfchar
// <63> <0063>
// <64> <0064>
// <65> <0065>
// <69> <0069>
// <70> <0070>
// <72> <0072>
// <74> <0074>
// <75> <0075>
// <0020> <0020>
// endbfchar
// endcmap CMapName currentdict /CMap defineresource pop end end
