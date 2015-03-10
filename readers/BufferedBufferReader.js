var BufferedBufferReader = (function () {
    function BufferedBufferReader(buffer) {
        this.buffer = buffer;
    }
    BufferedBufferReader.prototype.peekByte = function () {
        return this.buffer[0];
    };
    BufferedBufferReader.prototype.peekBuffer = function (length) {
        return this.buffer.slice(0, length);
    };
    BufferedBufferReader.prototype.readByte = function () {
        var byte = this.peekByte();
        this.buffer = this.buffer.slice(1);
        return byte;
    };
    BufferedBufferReader.prototype.readBuffer = function (length) {
        var buffer = this.peekBuffer(length);
        this.buffer = this.buffer.slice(length);
        return buffer;
    };
    /**
    Skip over the next `length` characters, returning the number of skipped
    characters (which may be < `length` iff EOF has been reached).
    */
    BufferedBufferReader.prototype.skip = function (length) {
        // we cannot skip more than `this.buffer.length` bytes
        var bytesSkipped = Math.min(length, this.buffer.length);
        this.buffer = this.buffer.slice(length);
        return bytesSkipped;
    };
    BufferedBufferReader.prototype.toString = function () {
        return this.buffer.toString();
    };
    return BufferedBufferReader;
})();
module.exports = BufferedBufferReader;
