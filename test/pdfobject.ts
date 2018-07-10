import test, {ExecutionContext} from 'ava';

import {PDFBufferIterator} from '../parsers/index';
import {OBJECT} from '../parsers/states';

/**
Given a raw input string and expected output, parse the input and check that it
is equivalent to the expectation.
*/
function check(input: string, expected: any, t: ExecutionContext) {
  const bufferIterable = new PDFBufferIterator(Buffer.from(input), 0, null);
  const actual = new OBJECT(bufferIterable, 'binary', 1024).read();
  const message = `parse result does not match expected output.
        parse("${input}") => ${JSON.stringify(actual)}
        but should == ${JSON.stringify(expected)}`;
  t.deepEqual(actual, expected, message);
}

test('pdfobject parser should parse short binary string', t => {
  const input = '<ea68d4>';
  // var output = ['ea', '68', 'd4'].map(pair => { return parseInt(pair, 16) }
  const output = Buffer.from([234, 104, 212]);
  check(input, output, t);
});

test('pdfobject parser should parse a string with escaped line break literals', t => {
  const input = `(/G18/G19/G20\
/G21/G22/G23\
/G24)`;
  const output = Buffer.from('/G18/G19/G20/G21/G22/G23/G24');
  check(input, output, t);
});

test('pdfobject parser should parse dictionary object with indirect references', t => {
  const input = `<<
/Size 369
/Info 339 0 R
/Root 342 0 R
/Prev 632196
/ID[<7e19ea68d47cd58418bb9001776e808b><7e19ea68d47cd58418bb9001776e808b>]
>>`;
  const output = {
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
      Buffer.from([126, 25, 234, 104, 212, 124, 213, 132, 24, 187, 144, 1, 119, 110, 128, 139]),
      Buffer.from([126, 25, 234, 104, 212, 124, 213, 132, 24, 187, 144, 1, 119, 110, 128, 139]),
    ],
  };
  check(input, output, t);
});

test('pdfobject parser should parse simple dictionary object', t => {
  const input = `<<
/Size 369
/Info 339
/Root 342
/Prev 632196
/ID (7e19 808b)
>>`;
  const output = {
    Size: 369,
    Info: 339,
    Root: 342,
    Prev: 632196,
    ID: Buffer.from('7e19 808b'),
  };
  check(input, output, t);
});

test('pdfobject parser should parse real dictionary object', t => {
  const input = "<< /Author (Kenneth Ward Church) /CreationDate (D:20020326140046-05'00') /ModDate (D:20020403103951-05'00') /Title (Char align: A Program for Aligning Parallel Texts at the Character Level) >>";
  const output = {
    Author: Buffer.from('Kenneth Ward Church'),
    CreationDate: Buffer.from("D:20020326140046-05'00'"),
    ModDate: Buffer.from("D:20020403103951-05'00'"),
    Title: Buffer.from('Char align: A Program for Aligning Parallel Texts at the Character Level'),
  };
  check(input, output, t);
});

test('pdfobject parser should parse real dictionary object #2', t => {
  const input = '<< /Contents [ 17 0 R 18 0 R 19 0 R 20 0 R 21 0 R 22 0 R 23 0 R 24 0 R ] /CropBox [ 0 0 612 792 ] /MediaBox [ 0 0 612 792 ] /Parent 5 0 R /Resources << /Font << /F0 25 0 R /F1 26 0 R /F2 27 0 R >> /ProcSet 28 0 R /XObject << /Im1 29 0 R >> >> /Rotate 0 /Thumb 30 0 R /Type /Page >>';
  const output = {
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
      },
    },
    Rotate: 0,
    Thumb: { object_number: 30, generation_number: 0 },
    Type: 'Page',
  };
  check(input, output, t);
});

test('pdfobject parser should parse nested dictionary object', t => {
  const input = `<<
/Fields [ ]
/DR << /Font << /ZaDb 316 0 R /Helv 317 0 R >> /Encoding << /PDFDocEncoding 318 0 R >> >>
/DA (/Helv 0 Tf 0 g )
>>`;
  const output = {
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
      },
    },
    DA: Buffer.from('/Helv 0 Tf 0 g '),
  };
  check(input, output, t);
});

test('pdfobject parser should parse array of names', t => {
  const input = `[
/PDF /Text /ImageB
]`;
  const output = ['PDF', 'Text', 'ImageB'];
  check(input, output, t);
});

test('pdfobject parser should parse array of references', t => {
  const input = `[
4 0 R 6 0 R 8 0 R 10 0 R
]`;
  const output = [
    { object_number:  4, generation_number: 0 },
    { object_number:  6, generation_number: 0 },
    { object_number:  8, generation_number: 0 },
    { object_number: 10, generation_number: 0 },
  ];
  check(input, output, t);
});

test('pdfobject parser should parse an indirect object', t => {
  const input = `4 0 obj
<< /Length 81 >>
endobj`;
  const output = {
    object_number: 4,
    generation_number: 0,
    value: {
      Length: 81,
    },
  };
  check(input, output, t);
});

test('pdfobject parser should parse a list of booleans', t => {
  const input = '[true false true true ]';
  const output = [true, false, true, true];
  check(input, output, t);
});

test('pdfobject parser should parse a stream', t => {
  const input = `<< /Length 25 >>
stream
hello there
i am a stream
endstream`;
  const output = {
    dictionary: {
      Length: 25,
    },
    buffer: Buffer.from(`hello there
i am a stream`),
  };
  check(input, output, t);
});

test('pdfobject parser should parse a 0-length stream', t => {
  const input = `<< /Type /XObject /BBox [ 0 0 10 10] /Length 0 >> stream

endstream`;
  const output = {
    dictionary: {
      Type: 'XObject',
      BBox: [0, 0, 10, 10],
      Length: 0,
    },
    buffer: Buffer.alloc(0),
  };
  check(input, output, t);
});
