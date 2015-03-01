/// <reference path="type_declarations/index.d.ts" />
var fs = require('fs');
/** A representation of an opened file (an active file descriptor).

Does not keep track of the current position within the file.
*/
var File = (function () {
    function File(fd) {
        this.fd = fd;
    }
    File.open = function (filepath) {
        var fd = fs.openSync(filepath, 'r');
        return new File(fd);
    };
    Object.defineProperty(File.prototype, "size", {
        get: function () {
            return fs.fstatSync(this.fd).size;
        },
        enumerable: true,
        configurable: true
    });
    /**
    Calls fs.readSync on the underlying file descriptor with pretty much the same
    argument signature.
  
    Returns `bytesRead`, the number of bytes that were read into the given Buffer.
  
    Node.js documentation for fs.read() / fs.readSync():
    > position is an integer specifying where to begin reading from in the file.
    > If position is null, data will be read from the current file position.
    */
    File.prototype.read = function (buffer, offset, length, position) {
        return fs.readSync(this.fd, buffer, offset, length, position);
    };
    /**
    Read a `length` bytes of the underlying file as a Buffer. May return a
    Buffer shorter than `length` iff EOF has been reached.
    */
    File.prototype.readBuffer = function (length, position) {
        var buffer = new Buffer(length);
        var bytesRead = this.read(buffer, 0, length, position);
        if (bytesRead < length) {
            buffer = buffer.slice(0, bytesRead);
        }
        return buffer;
    };
    File.prototype.close = function () {
        fs.closeSync(this.fd);
    };
    return File;
})();
module.exports = File;
