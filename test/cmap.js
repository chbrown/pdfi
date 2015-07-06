/// <reference path="../type_declarations/index.d.ts" />
var assert = require('assert');
var lexing_1 = require('lexing');
// import {XREF} from '../parsers/states';
var index_1 = require('../parsers/index');
function check(input, expected) {
    var string_iterable = new lexing_1.StringIterator(input);
    var output = index_1.parseCMap(string_iterable);
    var message = "parse result does not match expected output.\n      parse(\"" + input + "\") => " + JSON.stringify(output) + "\n      but should == " + JSON.stringify(expected);
    assert.deepEqual(output, expected, message);
}
describe('CMap parsing:', function () {
    it('should parse simple byteLength=1 bfrange', function () {
        var input = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapType 2 def\n/CMapName/R109 def\n1 begincodespacerange\n<00><ff>\nendcodespacerange\n4 beginbfrange\n<00><00><2212>\n<01><01><00b7>\n<02><02><00d7>\n<14><15><2264>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend end";
        var expected = {
            "codeSpaceRanges": [{ "low": 0, "high": 255 }],
            "mappings": [
                { "src": 0, "dst": "−", "byteLength": 1 },
                { "src": 1, "dst": "·", "byteLength": 1 },
                { "src": 2, "dst": "×", "byteLength": 1 },
                { "src": 20, "dst": "≤", "byteLength": 1 },
                { "src": 21, "dst": "≥", "byteLength": 1 }
            ],
            "byteLength": 1
        };
        check(input, expected);
    });
    it('should parse simple byteLength=2 bfchar', function () {
        var input = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo\n<< /Registry (Softland) /Ordering (Identity) /Supplement 0 >> def\n/CMapName /Softland def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n4 beginbfchar\n<010F> <0062>\n<03EC> <0030>\n<03ED> <0031>\n<03EE> <0032>\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
        var expected = {
            "codeSpaceRanges": [{ "low": 0, "high": 65535 }],
            "mappings": [
                { "src": 271, "dst": "b", "byteLength": 2 },
                { "src": 1004, "dst": "0", "byteLength": 2 },
                { "src": 1005, "dst": "1", "byteLength": 2 },
                { "src": 1006, "dst": "2", "byteLength": 2 },
            ],
            "byteLength": 2
        };
        check(input, expected);
    });
    it('should parse single bfchar', function () {
        var input = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo\n<< /Registry (Adobe)\n/Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfchar\n<0078> <2022>\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end";
        var expected = {
            "codeSpaceRanges": [{ "low": 0, "high": 65535 }],
            "mappings": [
                { "src": 120, "dst": "•", "byteLength": 2 },
            ],
            "byteLength": 2
        };
        check(input, expected);
    });
    it('should parse multiple bfchars and bfrange', function () {
        var input = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo <<\n  /Registry (Adobe)\n  /Ordering (UCS)\n  /Supplement 0\n>> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00><FF>\nendcodespacerange\n1 beginbfchar\n<2c><0009 000d 0020 00a0>\nendbfchar\n1 beginbfchar\n<43><002d 00ad 2010>\nendbfchar\n6 beginbfrange\n<21><21><0031>\n<22><22><002e>\n<23><23><0049>\n<24><24><006e>\n<25><25><0074>\n<26><26><0072>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
        var expected = {
            "codeSpaceRanges": [
                { "low": 0, "high": 255 }
            ],
            "mappings": [
                { "src": 44, "dst": "\t\r  ", "byteLength": 1 },
                { "src": 67, "dst": "-­‐", "byteLength": 1 },
                { "src": 33, "dst": "1", "byteLength": 1 },
                { "src": 34, "dst": ".", "byteLength": 1 },
                { "src": 35, "dst": "I", "byteLength": 1 },
                { "src": 36, "dst": "n", "byteLength": 1 },
                { "src": 37, "dst": "t", "byteLength": 1 },
                { "src": 38, "dst": "r", "byteLength": 1 }
            ],
            "byteLength": 1
        };
        check(input, expected);
    });
    it('should parse multiple code space ranges', function () {
        var input = "%!PS-Adobe-3.0 Resource-CMap\n%%DocumentNeededResources: ProcSet (CIDInit)\n%%IncludeResource: ProcSet (CIDInit)\n%%BeginResource: CMap (90ms-RKSJ-H)\n%%Title: (90ms-RKSJ-H Adobe Japan1 2)\n%%Version: 10.001\n%%Copyright: Copyright 1990-2001 Adobe Systems Inc.\n%%Copyright: All Rights Reserved.\n%%EndComments\n/CIDInit /ProcSet findresource begin 12 dict begin\nbegincmap\n/CIDSystemInfo\n3 dict dup begin /Registry (Adobe) def /Ordering (Japan1) def /Supplement 2 def\nend def\n/CMapName /90ms-RKSJ-H def /CMapVersion 10.001 def /CMapType 1 def\n/UIDOffset 950 def\n/XUID [1 10 25343] def /WMode 0 def\n4 begincodespacerange\n<00> <80>\n<8140> <9FFC>\n<A0> <DF>\n<E040> <FCFC>\nendcodespacerange\n1 beginnotdefrange\n<00> <1F> 231\nendnotdefrange\n100 begincidrange\n<20> <7D> 231\n<7E> <7E> 631\n<8140> <817E> 633\n<8180> <81AC> 696\n<81B8> <81BF> 741\n<81C8> <81CE> 749\n<FB40> <FB7E> 8518\n<FB80> <FBFC> 8581\n<FC40> <FC4B> 8706\nendcidrange\nendcmap\nCMapName currentdict /CMap defineresource pop end\nend\n%%EndResource\n%%EOF";
        var expected = {
            "codeSpaceRanges": [
                { "low": 0, "high": 128 },
                { "low": 33088, "high": 40956 },
                { "low": 160, "high": 223 },
                { "low": 57408, "high": 64764 }
            ],
            "mappings": [],
            "byteLength": 1
        };
        check(input, expected);
    });
});
