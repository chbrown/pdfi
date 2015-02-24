/// <reference path="type_declarations/index.d.ts" />
import fs = require('fs');

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
  Calls fs.readSync on the underlying file descriptor.

  Node.js documentation for fs.read() / fs.readSync():
  > position is an integer specifying where to begin reading from in the file.
  > If position is null, data will be read from the current file position.
  */
  read(buffer: Buffer, offset: number, length: number, position: number): number {
    return fs.readSync(this.fd, buffer, offset, length, position);
  }

  close(): void {
    fs.closeSync(this.fd);
  }
}

export = File;
