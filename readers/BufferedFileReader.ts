/// <reference path="../type_declarations/index.d.ts" />
import fs = require('fs');
import File = require('../File');
import BufferedReader = require('./BufferedReader');

/**
Provide buffered (and Buffer-friendly) access to a file.
*/
class BufferedFileReader implements BufferedReader {
  // when reading more data, pull in chunks of `BLOCK_SIZE` bytes.
  static BLOCK_SIZE = 1024;
  private buffer: Buffer;

  constructor(private file: File, private position: number = 0) {
    this.buffer = new Buffer(0);
  }

  /**
  Ensure that the available buffer is at least `length` bytes long.

  This may return without the condition being met of this.buffer.length >= length,
  if the end of the underlying file has been reached.
  */
  private ensureLength(length: number): void {
    while (length > this.buffer.length) {
      // all the action happens only if we need more bytes than are in the buffer
      var EOF = this.fillBuffer(BufferedFileReader.BLOCK_SIZE);
      if (EOF) {
        // exit regardless
        break;
      }
    }
  }

  /**
  Read data from the underlying file and append it to the buffer.
  Returns false iff EOF has been reached, otherwise returns true. */
  private fillBuffer(length: number): boolean {
    var fresh_buffer = new Buffer(length);
    // always read from the reader's current position
    var bytesRead = this.file.read(fresh_buffer, 0, length, this.position);
    // and update it accordingly
    this.position += bytesRead;
    // use the Buffer.concat totalLength argument to slice the fresh buffer if needed
    this.buffer = Buffer.concat([this.buffer, fresh_buffer], this.buffer.length + bytesRead);
    return bytesRead < length;
  }

  peekByte(): number {
    this.ensureLength(1);
    return this.buffer[0];
  }

  peekBuffer(length: number): Buffer {
    this.ensureLength(length);
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
    this.ensureLength(length);
    // we cannot skip more than `this.buffer.length` bytes
    var bytesSkipped = Math.min(length, this.buffer.length);
    this.buffer = this.buffer.slice(length);
    return bytesSkipped;
  }

}

export = BufferedFileReader;
