/// <reference path="../type_declarations/index.d.ts" />

interface Reader {
  /**
  Reads a single byte.
  */
  readByte(): number;
  /**
  Reads a series of bytes.
  */
  readBuffer(length: number): Buffer;
}

export = Reader;
