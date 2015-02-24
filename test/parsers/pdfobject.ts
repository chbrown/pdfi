/// <reference path="../../type_declarations/index.d.ts" />
import assert = require('assert');

var parser = require('../../parsers/pdfobject');

function check(input, expected_output) {
  var output = parser.parse(input);
  assert.deepEqual(output, expected_output);
}

describe('pdfobject parser', function() {
  it('should parse short binary string', function() {
    var input = `<ea68d4>`;
    // var output = ['ea', '68', 'd4'].map(function(pair) { return parseInt(pair, 16) }
    var output = [234, 104, 212];
    check(input, output);
  });

  it('should parse dictionary object with indirect references', function() {
    var input = `<<
/Size 369
/Info 339 0 R
/Root 342 0 R
/Prev 632196
/ID[<7e19ea68d47cd58418bb9001776e808b><7e19ea68d47cd58418bb9001776e808b>]
>>`;
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
        [126,25,234,104,212,124,213,132,24,187,144,1,119,110,128,139],
        [126,25,234,104,212,124,213,132,24,187,144,1,119,110,128,139],
      ]
    };
    check(input, output);
  });

  it('should parse simple dictionary object', function() {
    var input = `<<
/Size 369
/Info 339
/Root 342
/Prev 632196
/ID (7e19 808b)
>>`;
    var output = {
      Size: 369,
      Info: 339,
      Root: 342,
      Prev: 632196,
      ID: "7e19 808b",
    };
    check(input, output);
  });

  it('should parse real dictionary object', function() {
    var input = `<< /Author (Kenneth Ward Church) /CreationDate (D:20020326140046-05'00') /ModDate (D:20020403103951-05'00') /Title (Char align: A Program for Aligning Parallel Texts at the Character Level) >>`;
    var output = {
      Author: 'Kenneth Ward Church',
      CreationDate: "D:20020326140046-05'00'",
      ModDate: "D:20020403103951-05'00'",
      Title: 'Char align: A Program for Aligning Parallel Texts at the Character Level'
    };
    check(input, output);
  });

  it('should parse nested dictionary object', function() {
    var input = `<<
/Fields [ ]
/DR << /Font << /ZaDb 316 0 R /Helv 317 0 R >> /Encoding << /PDFDocEncoding 318 0 R >> >>
/DA (/Helv 0 Tf 0 g )
>>`;
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

  it('should parse array of names', function() {
    var input = `[
/PDF /Text /ImageB
]`;
    var output = ['PDF', 'Text', 'ImageB'];
    check(input, output);
  });

  it('should parse array of references', function() {
    var input = `[
4 0 R 6 0 R 8 0 R 10 0 R
]`;
    var output = [
      { object_number:  4, generation_number: 0 },
      { object_number:  6, generation_number: 0 },
      { object_number:  8, generation_number: 0 },
      { object_number: 10, generation_number: 0 },
    ];
    check(input, output);
  });

  it('should parse an indirect object', function() {
    var input = `4 0 obj
  << /Length 81 >>
endobj`;
    var output = {
      object_number: 4,
      generation_number: 0,
      value: {
        Length: 81,
      },
    };
    check(input, output);
  });

  it('should parse a list of booleans', function() {
    var input = `[true false true true ]`;
    var output = [ true, false, true, true, ];
    check(input, output);
  });

  it('should parse a stream', function() {
    var input = `<< /Length 26 >>
stream
hello there
i am a stream
endstream`;
    var output = {
      dictionary: {
        Length: 26,
      },
      value: `hello there
i am a stream`,
    };
    check(input, output);
  });

});
