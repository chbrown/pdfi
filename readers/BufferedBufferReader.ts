/// <reference path="../type_declarations/index.d.ts" />
import BufferedReader = require('./BufferedReader');

class BufferedBufferReader implements BufferedReader {
  constructor(private buffer: Buffer) { }

  peekByte(): number {
    return this.buffer[0];
  }

  peekBuffer(length: number): Buffer {
    return this.buffer.slice(0, length);
  }

  readByte(): number {
    var byte = this.peekByte();
    this.buffer = this.buffer.slice(1);
    return byte;
  }

  readBuffer(length: number): Buffer {
    var buffer = this.peekBuffer(length);
    this.buffer = this.buffer.slice(length);
    return buffer;
  }

  /**
  Skip over the next `length` characters, returning the number of skipped
  characters (which may be < `length` iff EOF has been reached).
  */
  skip(length: number): number {
    // we cannot skip more than `this.buffer.length` bytes
    var bytesSkipped = Math.min(length, this.buffer.length);
    this.buffer = this.buffer.slice(length);
    return bytesSkipped;
  }

  toString(): string {
    return this.buffer.toString();
  }
}

export = BufferedBufferReader;
