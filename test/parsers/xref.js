/// <reference path="../../type_declarations/index.d.ts" />
var assert = require('assert');
var parser = require('../../parsers/pdfobject');
function check(input, expected_output) {
    var output = parser.parseString(input);
    var message = "parse result does not match expected output.\n      parse(\"" + input + "\") => " + JSON.stringify(output) + "\n      but should == " + JSON.stringify(expected_output);
    assert.deepEqual(output, expected_output, message);
}
describe('pdfobject parser', function () {
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
        check(input, output);
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
        check(input, output);
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
        check(input, output);
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
        check(input, output);
    });
});
