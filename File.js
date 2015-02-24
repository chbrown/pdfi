/// <reference path="type_declarations/index.d.ts" />
var fs = require('fs');
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
    Calls fs.readSync on the underlying file descriptor.
  
    Node.js documentation for fs.read() / fs.readSync():
    > position is an integer specifying where to begin reading from in the file.
    > If position is null, data will be read from the current file position.
    */
    File.prototype.read = function (buffer, offset, length, position) {
        return fs.readSync(this.fd, buffer, offset, length, position);
    };
    File.prototype.close = function () {
        fs.closeSync(this.fd);
    };
    return File;
})();
module.exports = File;
