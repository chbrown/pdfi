/**
Provide buffered (and Buffer-friendly) access to a file.
*/
var BufferedFileReader = (function () {
    function BufferedFileReader(file, file_position) {
        if (file_position === void 0) { file_position = 0; }
        this.file = file;
        this.file_position = file_position;
        this.buffer = new Buffer(0);
    }
    Object.defineProperty(BufferedFileReader.prototype, "size", {
        get: function () {
            return this.file.size;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(BufferedFileReader.prototype, "position", {
        /**
        Return the position in the file that would be read from if we called
        readBuffer(...). This is different from the internally-held position, which
        points to the end of the currently held buffer.
        */
        get: function () {
            return this.file_position - this.buffer.length;
        },
        enumerable: true,
        configurable: true
    });
    /**
    Ensure that the available buffer is at least `length` bytes long.
  
    This may return without the condition being met of this.buffer.length >= length,
    if the end of the underlying file has been reached.
    */
    BufferedFileReader.prototype.ensureLength = function (length) {
        while (length > this.buffer.length) {
            // all the action happens only if we need more bytes than are in the buffer
            var EOF = this.fillBuffer(BufferedFileReader.BLOCK_SIZE);
            if (EOF) {
                break;
            }
        }
    };
    /**
    Read data from the underlying file and append it to the buffer.
  
    Returns false iff EOF has been reached, otherwise returns true. */
    BufferedFileReader.prototype.fillBuffer = function (length) {
        var buffer = new Buffer(length);
        // always read from the reader's current position
        var bytesRead = this.file.read(buffer, 0, length, this.file_position);
        // and update it accordingly
        this.file_position += bytesRead;
        // use the Buffer.concat totalLength argument to slice the fresh buffer if needed
        this.buffer = Buffer.concat([this.buffer, buffer], this.buffer.length + bytesRead);
        return bytesRead < length;
    };
    BufferedFileReader.prototype.peekByte = function () {
        this.ensureLength(1);
        return this.buffer[0];
    };
    BufferedFileReader.prototype.peekBuffer = function (length) {
        this.ensureLength(length);
        return this.buffer.slice(0, length);
    };
    BufferedFileReader.prototype.readByte = function () {
        var byte = this.peekByte();
        this.buffer = this.buffer.slice(1);
        return byte;
    };
    BufferedFileReader.prototype.readBuffer = function (length) {
        var buffer = this.peekBuffer(length);
        this.buffer = this.buffer.slice(length);
        return buffer;
    };
    /**
    Skip over the next `length` characters, returning the number of skipped
    characters (which may be < `length` iff EOF has been reached).
    */
    BufferedFileReader.prototype.skip = function (length) {
        this.ensureLength(length);
        // we cannot skip more than `this.buffer.length` bytes
        var bytesSkipped = Math.min(length, this.buffer.length);
        this.buffer = this.buffer.slice(length);
        return bytesSkipped;
    };
    // when reading more data, pull in chunks of `BLOCK_SIZE` bytes.
    BufferedFileReader.BLOCK_SIZE = 1024;
    return BufferedFileReader;
})();
module.exports = BufferedFileReader;
