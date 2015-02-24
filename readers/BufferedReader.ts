/// <reference path="../type_declarations/index.d.ts" />
import Reader = require('./Reader');

interface BufferedReader extends Reader {
  peekByte(): number;
  peekBuffer(length: number): Buffer;
  skip(length: number): number;
}

export = BufferedReader;
