/// <reference path="../../type_declarations/index.d.ts" />
import assert = require('assert');

var parser = require('../../parsers/xref');

function check(input, expected_output) {
  var output = parser.parse(input);
  var message = `parse result does not match expected output.
      parse("${input}") => ${JSON.stringify(output)}
      but should == ${JSON.stringify(expected_output)}`;
  assert.deepEqual(output, expected_output, message);
}

describe('pdfobject parser', function() {

  it('short xref with trailing newline', function() {
    var input = `xref
0 2
0000000000 65535 f\r
0000000015 00000 n\r
`;
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

  it('another xref with trailing newline', function() {
    var input = `xref
100 3
0000000197 00000 n\r
0000000556 00000 n\r
0001000023 00000 n\r
`;
    var output = [
      {
        object_number: 100,
        offset: 197,
        generation_number: 0,
        in_use: true
      }, {
        object_number: 101,
        offset: 556,
        generation_number: 0,
        in_use: true
      }, {
        object_number: 102,
        offset: 1000023,
        generation_number: 0,
        in_use: true
      }
    ];
    check(input, output);
  });

  it('xref from PDF32000_2008.pdf Section 7.5.4 EXAMPLE 2', function() {
    var input = `xref
0 6
0000000003 65535 f\r
0000000017 00000 n\r
0000000081 00000 n\r
0000000000 00007 f\r
0000000331 00000 n\r
0000000409 00000 n\r
`;
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

  it('xref from PDF32000_2008.pdf Section 7.5.4 EXAMPLE 3', function() {
    var input = `xref
0 1
0000000000 65535 f\r
3 1
0000025325 00000 n\r
23 2
0000025518 00002 n\r
0000025635 00000 n\r
30 1
0000025777 00000 n\r
`;
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
