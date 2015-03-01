/// <reference path="type_declarations/index.d.ts" />
import fs = require('fs');

/** A representation of an opened file (an active file descriptor).

Does not keep track of the current position within the file.
*/
class File {
  constructor(private fd: number) { }

  static open(filepath: string): File {
    var fd = fs.openSync(filepath, 'r');
    return new File(fd);
  }

  get size(): number {
    return fs.fstatSync(this.fd).size;
  }

  /**
  Calls fs.readSync on the underlying file descriptor with pretty much the same
  argument signature.

  Returns `bytesRead`, the number of bytes that were read into the given Buffer.

  Node.js documentation for fs.read() / fs.readSync():
  > position is an integer specifying where to begin reading from in the file.
  > If position is null, data will be read from the current file position.
  */
  read(buffer: Buffer, offset: number, length: number, position: number): number {
    return fs.readSync(this.fd, buffer, offset, length, position);
  }

  /**
  Read a `length` bytes of the underlying file as a Buffer. May return a
  Buffer shorter than `length` iff EOF has been reached.
  */
  readBuffer(length: number, position: number): Buffer {
    var buffer = new Buffer(length);
    var bytesRead = this.read(buffer, 0, length, position);
    if (bytesRead < length) {
      buffer = buffer.slice(0, bytesRead);
    }
    return buffer;
  }

  close(): void {
    fs.closeSync(this.fd);
  }
}

export = File;
