/// <reference path="../../type_declarations/index.d.ts" />
import assert = require('assert');

var parser = require('../../parsers/xref');

function check(input, expected_output) {
  var output = parser.parse(input);
  assert.deepEqual(output, expected_output);
}

describe('pdfobject parser', function() {

  it('short xref with trailing newline', function() {
    var input = `xref
0 2
0000000000 65535 f
0000000015 00000 n
`;
    check(input, [
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
    ]);
  });

  it('short xref without trailing newline', function() {
    var input = `xref
100 3
0000000197 00000 n
0000000556 00000 n
0001000023 00000 n`;
    check(input, [
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
    ]);
  });

});
