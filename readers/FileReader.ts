/// <reference path="../type_declarations/index.d.ts" />
import fs = require('fs');
import File = require('../File');
import bufferops = require('../bufferops');

/** A representation of an open file with some functions to aid reading.
 */
class FileReader {
  static BLOCK_SIZE = 1024;

  constructor(private file: File, private position: number = 0) { }

  get size(): number {
    return this.file.size;
  }

  /**
  Read the next `length` bytes of the underlying file as a Buffer. May return a
  Buffer shorter than `length` iff EOF has been reached.
  */
  readBuffer(length: number): Buffer {
    var buffer = this.file.readBuffer(length, this.position);
    // `buffer.length` might not equal `length`!
    this.position += buffer.length;
    return buffer;
  }

  /**
  Starting at the current position, read until EOF or we find `needle`,
  whichever happens first.

  1. If we do find needle, return the position of it within the file, and set
     the current position to point at the first character of `needle`.
  2. If we can't find it, return null.

  TODO: add optional fromIndex argument.
  */
  indexOf(searchValue: string): number {
    var needle = new Buffer(searchValue);
    var haystack = new Buffer(0);
    var haystack_file_position = this.position;
    var haystack_search_offset = 0;
    var block_buffer = new Buffer(FileReader.BLOCK_SIZE);
    var bytesRead = FileReader.BLOCK_SIZE;
    // exit loop once we read fewer bytes than intended (indicating EOF)
    while (bytesRead == FileReader.BLOCK_SIZE) {
      // we use the position once, to seek, and then set it to null, to use the
      // current position on subsequent reads. Hopefully no one else has seeked
      // on this file descriptor by the next time we use it! But wait...
      // TODO: figure out why setting position it to null wraps around to the beginning
      //       see s/position += bytesRead;/position = null/ below
      bytesRead = this.file.read(block_buffer, 0, FileReader.BLOCK_SIZE, this.position);
      this.position += bytesRead;
      // append new block to stateful buffer; block_buffer may have extra bytes
      // at the end, so only read up to the readBytes mark
      haystack = Buffer.concat([haystack, block_buffer], haystack.length + bytesRead);
      // TODO: only start looking in the haystack (`buffer`) at the old
      //   offset, backtracking by needle.length in case there's a partial match
      var needle_haystack_index = bufferops.indexOf(haystack, needle, haystack_search_offset);
      // needle_haystack_index, if not null, is the position of needle within haystack
      if (needle_haystack_index !== null) {
        // we found it!
        this.position = haystack_file_position + needle_haystack_index;
        return haystack_file_position + needle_haystack_index;
      }
    }
    // we hit EOF before finding needle; return null
    return null;
  }
}

export = FileReader;
