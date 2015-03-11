/// <reference path="../../type_declarations/index.d.ts" />
var assert = require('assert');
var PDF = require('../../PDF');
function check(input, expected_output, start) {
    var pdf = new PDF();
    var output = pdf.parseString(input, start);
    var message = "parse result does not match expected output.\n      parse(\"" + input + "\") => " + JSON.stringify(output) + "\n      but should == " + JSON.stringify(expected_output);
    assert.deepEqual(output, expected_output, message);
}
describe('pdfobject parser: general objects', function () {
    it('should parse short binary string', function () {
        var input = "<ea68d4>";
        // var output = ['ea', '68', 'd4'].map(function(pair) { return parseInt(pair, 16) }
        var output = [234, 104, 212];
        check(input, output);
    });
    it('should parse dictionary object with indirect references', function () {
        var input = "<<\n/Size 369\n/Info 339 0 R\n/Root 342 0 R\n/Prev 632196\n/ID[<7e19ea68d47cd58418bb9001776e808b><7e19ea68d47cd58418bb9001776e808b>]\n>>";
        var output = {
            Size: 369,
            Info: {
                object_number: 339,
                generation_number: 0,
            },
            Root: {
                object_number: 342,
                generation_number: 0,
            },
            Prev: 632196,
            ID: [
                [126, 25, 234, 104, 212, 124, 213, 132, 24, 187, 144, 1, 119, 110, 128, 139],
                [126, 25, 234, 104, 212, 124, 213, 132, 24, 187, 144, 1, 119, 110, 128, 139],
            ]
        };
        check(input, output);
    });
    it('should parse simple dictionary object', function () {
        var input = "<<\n/Size 369\n/Info 339\n/Root 342\n/Prev 632196\n/ID (7e19 808b)\n>>";
        var output = {
            Size: 369,
            Info: 339,
            Root: 342,
            Prev: 632196,
            ID: "7e19 808b",
        };
        check(input, output);
    });
    it('should parse real dictionary object', function () {
        var input = "<< /Author (Kenneth Ward Church) /CreationDate (D:20020326140046-05'00') /ModDate (D:20020403103951-05'00') /Title (Char align: A Program for Aligning Parallel Texts at the Character Level) >>";
        var output = {
            Author: 'Kenneth Ward Church',
            CreationDate: "D:20020326140046-05'00'",
            ModDate: "D:20020403103951-05'00'",
            Title: 'Char align: A Program for Aligning Parallel Texts at the Character Level'
        };
        check(input, output);
    });
    it('should parse real dictionary object #2', function () {
        var input = "<< /Contents [ 17 0 R 18 0 R 19 0 R 20 0 R 21 0 R 22 0 R 23 0 R 24 0 R ] /CropBox [ 0 0 612 792 ] /MediaBox [ 0 0 612 792 ] /Parent 5 0 R /Resources << /Font << /F0 25 0 R /F1 26 0 R /F2 27 0 R >> /ProcSet 28 0 R /XObject << /Im1 29 0 R >> >> /Rotate 0 /Thumb 30 0 R /Type /Page >>";
        var output = {
            Contents: [
                { object_number: 17, generation_number: 0 },
                { object_number: 18, generation_number: 0 },
                { object_number: 19, generation_number: 0 },
                { object_number: 20, generation_number: 0 },
                { object_number: 21, generation_number: 0 },
                { object_number: 22, generation_number: 0 },
                { object_number: 23, generation_number: 0 },
                { object_number: 24, generation_number: 0 },
            ],
            CropBox: [0, 0, 612, 792],
            MediaBox: [0, 0, 612, 792],
            Parent: { object_number: 5, generation_number: 0 },
            Resources: {
                Font: {
                    F0: { object_number: 25, generation_number: 0 },
                    F1: { object_number: 26, generation_number: 0 },
                    F2: { object_number: 27, generation_number: 0 },
                },
                ProcSet: { object_number: 28, generation_number: 0 },
                XObject: {
                    Im1: { object_number: 29, generation_number: 0 },
                }
            },
            Rotate: 0,
            Thumb: { object_number: 30, generation_number: 0 },
            Type: "Page"
        };
        check(input, output);
    });
    it('should parse nested dictionary object', function () {
        var input = "<<\n/Fields [ ]\n/DR << /Font << /ZaDb 316 0 R /Helv 317 0 R >> /Encoding << /PDFDocEncoding 318 0 R >> >>\n/DA (/Helv 0 Tf 0 g )\n>>";
        var output = {
            Fields: [],
            DR: {
                Font: {
                    ZaDb: {
                        object_number: 316,
                        generation_number: 0,
                    },
                    Helv: {
                        object_number: 317,
                        generation_number: 0,
                    },
                },
                Encoding: {
                    PDFDocEncoding: {
                        object_number: 318,
                        generation_number: 0,
                    },
                }
            },
            DA: "/Helv 0 Tf 0 g ",
        };
        check(input, output);
    });
    it('should parse array of names', function () {
        var input = "[\n/PDF /Text /ImageB\n]";
        var output = ['PDF', 'Text', 'ImageB'];
        check(input, output);
    });
    it('should parse array of references', function () {
        var input = "[\n4 0 R 6 0 R 8 0 R 10 0 R\n]";
        var output = [
            { object_number: 4, generation_number: 0 },
            { object_number: 6, generation_number: 0 },
            { object_number: 8, generation_number: 0 },
            { object_number: 10, generation_number: 0 },
        ];
        check(input, output);
    });
    it('should parse an indirect object', function () {
        var input = "4 0 obj\n  << /Length 81 >>\nendobj";
        var output = {
            object_number: 4,
            generation_number: 0,
            value: {
                Length: 81,
            },
        };
        check(input, output, 'INDIRECT_OBJECT');
    });
    it('should parse a list of booleans', function () {
        var input = "[true false true true ]";
        var output = [true, false, true, true,];
        check(input, output);
    });
    it('should parse a stream', function () {
        var input = "<< /Length 25 >>\nstream\nhello there\ni am a stream\nendstream";
        var output = {
            dictionary: {
                Length: 25,
            },
            buffer: new Buffer("hello there\ni am a stream"),
        };
        check(input, output);
    });
});
describe('pdfobject parser: xref', function () {
    it('short xref with trailing newline', function () {
        var input = "xref\n0 2\n0000000000 65535 f\r\n0000000015 00000 n\r\n";
        var output = [
            {
                object_number: 0,
                offset: 0,
                generation_number: 65535,
                in_use: false
            },
            {
                object_number: 1,
                offset: 15,
                generation_number: 0,
                in_use: true
            }
        ];
        check(input, output, 'XREF_ONLY');
    });
    it('another xref with trailing newline', function () {
        var input = "xref\n100 3\n0000000197 00000 n\r\n0000000556 00000 n\r\n0001000023 00000 n\r\n";
        var output = [
            {
                object_number: 100,
                offset: 197,
                generation_number: 0,
                in_use: true
            },
            {
                object_number: 101,
                offset: 556,
                generation_number: 0,
                in_use: true
            },
            {
                object_number: 102,
                offset: 1000023,
                generation_number: 0,
                in_use: true
            }
        ];
        check(input, output, 'XREF_ONLY');
    });
    it('xref from PDF32000_2008.pdf Section 7.5.4 EXAMPLE 2', function () {
        var input = "xref\n0 6\n0000000003 65535 f\r\n0000000017 00000 n\r\n0000000081 00000 n\r\n0000000000 00007 f\r\n0000000331 00000 n\r\n0000000409 00000 n\r\n";
        var output = [
            {
                "offset": 3,
                "generation_number": 65535,
                "in_use": false,
                "object_number": 0
            },
            {
                "offset": 17,
                "generation_number": 0,
                "in_use": true,
                "object_number": 1
            },
            {
                "offset": 81,
                "generation_number": 0,
                "in_use": true,
                "object_number": 2
            },
            {
                "offset": 0,
                "generation_number": 7,
                "in_use": false,
                "object_number": 3
            },
            {
                "offset": 331,
                "generation_number": 0,
                "in_use": true,
                "object_number": 4
            },
            {
                "offset": 409,
                "generation_number": 0,
                "in_use": true,
                "object_number": 5
            }
        ];
        check(input, output, 'XREF_ONLY');
    });
    it('xref from PDF32000_2008.pdf Section 7.5.4 EXAMPLE 3', function () {
        var input = "xref\n0 1\n0000000000 65535 f\r\n3 1\n0000025325 00000 n\r\n23 2\n0000025518 00002 n\r\n0000025635 00000 n\r\n30 1\n0000025777 00000 n\r\n";
        var output = [
            {
                "object_number": 0,
                "offset": 0,
                "generation_number": 65535,
                "in_use": false
            },
            {
                "object_number": 3,
                "offset": 25325,
                "generation_number": 0,
                "in_use": true
            },
            {
                "object_number": 23,
                "offset": 25518,
                "generation_number": 2,
                "in_use": true
            },
            {
                "object_number": 24,
                "offset": 25635,
                "generation_number": 0,
                "in_use": true
            },
            {
                "object_number": 30,
                "offset": 25777,
                "generation_number": 0,
                "in_use": true
            }
        ];
        check(input, output, 'XREF_ONLY');
    });
});
