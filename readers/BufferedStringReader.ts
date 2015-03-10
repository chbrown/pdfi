/// <reference path="../type_declarations/index.d.ts" />
import BufferedBufferReader = require('./BufferedBufferReader');

class BufferedStringReader extends BufferedBufferReader {
  constructor(input: string, encoding?: string) {
    super(new Buffer(input, encoding))
  }
}

export = BufferedStringReader;
