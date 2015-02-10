/// <reference path="type_declarations/index.d.ts" />
import fs = require('fs');
import logger = require('loge');

import bufferops = require('./bufferops');

/** ByteRange: used to designate a portion of a file.
 * This allows us to specify where to start
 *
 * buffer: the bytes of the file segment
 * start: the byte offset within the original file of the first byte in buffer
 * end: the byte offset within the original file of the character directly
 *      following the last byte in buffer.
 *
 * buffer.length should equal (end - start)
 */
interface ByteRange {
  buffer: Buffer;
  start: number;
  end: number;
}

/** A representation of an open file with some helper functions.
 */
class FileCursor {
  static BLOCK_SIZE = 1024;

  fd: number;
  stats: fs.Stats;
  constructor(public filepath: string) {
    this.fd = fs.openSync(filepath, 'r');
    this.stats = fs.fstatSync(this.fd);
  }

  /**
   * calls readRangeUntilBuffer(start, needle: Buffer) after converting the
   * given string to a Buffer
   */
  readRangeUntilString(start: number, needle: string): ByteRange {
    return this.readRangeUntilBuffer(start, new Buffer(needle));
  }

  /** Starting at 'start', read until EOF or we find `needle`,
   * whichever happens first.
   *
   * 1. If we do find needle, return the intervening content as a Buffer, and
   *    advance the offset to point to the first character beyond `needle`.
   * 2. If we can't find it, return null.
   *
   * I'm not totally happy with the way TypeScript does overloading. I mean,
   * it's true to the Javascript, but they could add a little sugar, I think,
   * to avoid typeof, etc., comparisons, no? They need some type assertion
   * sugar, too.
   */
  readRangeUntilBuffer(start: number, needle: Buffer): ByteRange {
    var position = start;
    var haystack = new Buffer(0);
    var haystack_search_offset = 0;
    var block_buffer = new Buffer(FileCursor.BLOCK_SIZE);
    var bytesRead = FileCursor.BLOCK_SIZE;
    // exit loop once we read fewer bytes than intended (indicating EOF)
    while (bytesRead == FileCursor.BLOCK_SIZE) {
      // we use the position once, to seek, and then set it to null, to use the
      // current position on subsequent reads. Hopefully no one else has seeked
      // on this file descriptor by the next time we use it!
      // TODO: figure out why setting it to null wraps around to the beginning
      //       see s/position += bytesRead;/position = null/ below
      bytesRead = fs.readSync(this.fd, block_buffer, 0, FileCursor.BLOCK_SIZE, position);
      //logger.debug('[FileCursor] read %d bytes', bytesRead);
      //logger.debug('bytes: %s', block_buffer.toString('ascii', 0, bytesRead));
      position += bytesRead;
      // append new block to stateful buffer; block_buffer may have extra bytes
      // at the end, so only read up to the readBytes mark
      haystack = Buffer.concat([haystack, block_buffer], haystack.length + bytesRead);
      // TODO: only start looking in the haystack (`buffer`) at the old
      //   offset, backtracking by needle.length in case there's a partial match
      var haystack_needle_index = bufferops.indexOf(haystack, needle, haystack_search_offset);
      // haystack_needle_index, if not null, is the length of the result range
      if (haystack_needle_index !== null) {
        // we found it!
        return {
          buffer: haystack.slice(0, haystack_needle_index),
          start: start,
          end: start + haystack_needle_index,
        };
      }
    }
    logger.debug('FileCursor failed to find %s in %s', needle, haystack);
    // we hit EOF before finding needle; return null
    return null;
  }
}

export = FileCursor;
