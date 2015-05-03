/// <reference path="type_declarations/index.d.ts" />
var fs = require('fs');
var bufferops = require('./bufferops');
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
    /**
    Starting at fromIndex (defaults to 0), read until we find `needle`.
  
    1. If we do find needle, return the file's position of the first character of `needle`.
    2. If we reach EOF without finding it, return null.
    */
    File.prototype.indexOf = function (searchValue, fromIndex, BLOCK_SIZE) {
        if (fromIndex === void 0) { fromIndex = 0; }
        if (BLOCK_SIZE === void 0) { BLOCK_SIZE = 1024; }
        var needle = new Buffer(searchValue);
        var position = fromIndex;
        var haystack = new Buffer(0);
        var haystack_file_position = position;
        var haystack_search_offset = 0;
        var block_buffer = new Buffer(BLOCK_SIZE);
        var bytesRead = BLOCK_SIZE;
        // exit loop once we read fewer bytes than intended (indicating EOF)
        while (bytesRead == BLOCK_SIZE) {
            // we use the position once, to seek, and then set it to null, to use the
            // current position on subsequent reads. Hopefully no one else has seeked
            // on this file descriptor by the next time we use it! But wait...
            // TODO: figure out why setting position it to null wraps around to the beginning
            //       see s/position += bytesRead;/position = null/ below
            bytesRead = this.read(block_buffer, 0, BLOCK_SIZE, position);
            position += bytesRead;
            // append new block to stateful buffer; block_buffer may have extra bytes
            // at the end, so only read up to the readBytes mark
            haystack = Buffer.concat([haystack, block_buffer], haystack.length + bytesRead);
            // TODO: only start looking in the haystack (`buffer`) at the old
            //   offset, backtracking by needle.length in case there's a partial match
            var needle_haystack_index = bufferops.indexOf(haystack, needle, haystack_search_offset);
            // needle_haystack_index, if not null, is the position of needle within haystack
            if (needle_haystack_index !== null) {
                // we found it!
                return haystack_file_position + needle_haystack_index;
            }
        }
        // we hit EOF before finding needle; return null
        return null;
    };
    /**
    Starting at fromIndex (defaults to EOF), read backwards until we find `needle`.
  
    1. If we do find needle, return the file's position of the first character of `needle`.
    2. If we reach the beginning of the file before finding it, return null.
    */
    File.prototype.lastIndexOf = function (searchValue, fromIndex, BLOCK_SIZE) {
        if (fromIndex === void 0) { fromIndex = this.size; }
        if (BLOCK_SIZE === void 0) { BLOCK_SIZE = 1024; }
        var needle = new Buffer(searchValue);
        var position = fromIndex;
        var haystack = new Buffer(0);
        // haystack's position within file is always equal to `position`
        // exit loop once we reach the beginning of the file.
        while (position > -1) {
            position -= BLOCK_SIZE;
            var block_buffer = this.readBuffer(BLOCK_SIZE, position);
            haystack = Buffer.concat([block_buffer, haystack]);
            // TODO: only start looking in the haystack (`buffer`) at the old
            //   offset, backtracking by needle.length in case there's a partial match
            var last_index_of_needle_within_haystack = bufferops.lastIndexOf(haystack, needle);
            if (last_index_of_needle_within_haystack !== null) {
                // we found it!
                return position + last_index_of_needle_within_haystack;
            }
        }
        // we hit EOF before finding needle; return null
        return null;
    };
    return File;
})();
module.exports = File;
