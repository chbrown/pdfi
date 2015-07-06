/// <reference path="../type_declarations/index.d.ts" />
import assert = require('assert');

import {StringIterator} from 'lexing';
import {OBJECT} from '../parsers/states';

function check(input: string, expected: any) {
  var iterable = new StringIterator(input);
  var output =  new OBJECT(iterable, 1024).read();
  var message = `parse result does not match expected output.
      parse("${input}") => ${JSON.stringify(output)}
      but should == ${JSON.stringify(expected)}`;
  assert.deepEqual(output, expected, message);
}

describe('pdfobject parser: general objects', () => {

  it('should parse short binary string', () => {
    var input = `<ea68d4>`;
    // var output = ['ea', '68', 'd4'].map(pair => { return parseInt(pair, 16) }
    var output = [234, 104, 212];
    check(input, output);
  });

  it('should parse dictionary object with indirect references', () => {
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

  it('should parse simple dictionary object', () => {
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

  it('should parse real dictionary object', () => {
    var input = `<< /Author (Kenneth Ward Church) /CreationDate (D:20020326140046-05'00') /ModDate (D:20020403103951-05'00') /Title (Char align: A Program for Aligning Parallel Texts at the Character Level) >>`;
    var output = {
      Author: 'Kenneth Ward Church',
      CreationDate: "D:20020326140046-05'00'",
      ModDate: "D:20020403103951-05'00'",
      Title: 'Char align: A Program for Aligning Parallel Texts at the Character Level'
    };
    check(input, output);
  });

  it('should parse real dictionary object #2', () => {
    var input = `<< /Contents [ 17 0 R 18 0 R 19 0 R 20 0 R 21 0 R 22 0 R 23 0 R 24 0 R ] /CropBox [ 0 0 612 792 ] /MediaBox [ 0 0 612 792 ] /Parent 5 0 R /Resources << /Font << /F0 25 0 R /F1 26 0 R /F2 27 0 R >> /ProcSet 28 0 R /XObject << /Im1 29 0 R >> >> /Rotate 0 /Thumb 30 0 R /Type /Page >>`;
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

  it('should parse nested dictionary object', () => {
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

  it('should parse array of names', () => {
    var input = `[
/PDF /Text /ImageB
]`;
    var output = ['PDF', 'Text', 'ImageB'];
    check(input, output);
  });

  it('should parse array of references', () => {
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

  it('should parse an indirect object', () => {
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

  it('should parse a list of booleans', () => {
    var input = `[true false true true ]`;
    var output = [ true, false, true, true, ];
    check(input, output);
  });

  it('should parse a stream', () => {
    var input = `<< /Length 25 >>
stream
hello there
i am a stream
endstream`;
    var output = {
      dictionary: {
        Length: 25,
      },
      buffer: new Buffer(`hello there
i am a stream`),
    };
    check(input, output);
  });

});
