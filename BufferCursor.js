/// <reference path="type_declarations/index.d.ts" />
/** BufferCursor(buffer: Buffer, offset: number = 0)
 *
 * Monkey-patching Node.js's built-in Buffer doesn't always work, since you get
 * Buffer objects back from other sources, and it's unclear if their prototype
 * has also been patched. This is a wrapper with a few extensions.
 *
 * Is storing an offset of the buffer faster than the built-in buffer.slice?
 *
 * Huh, turns out there's a plain JS version of this idea:
 *   https://github.com/tjfontaine/node-buffercursor
 */
var BufferCursor = (function () {
    function BufferCursor(buffer, position) {
        if (position === void 0) { position = 0; }
        this.buffer = buffer;
        this.position = position;
    }
    /** Reads `length` bytes from the buffer, advancing the cursor past them.
     * Returns the remainder of the buffer if no length is specified.
     * Returns '' if we have reached the end of the buffer.
     */
    BufferCursor.prototype.consumeString = function (length, encoding) {
        if (length === void 0) { length = this.buffer.length - this.position; }
        if (encoding === void 0) { encoding = 'utf8'; }
        var start = this.position;
        this.position += length;
        return this.buffer.toString(encoding, start, this.position);
    };
    /** Reads one byte from the buffer, advancing the cursor past it.
     * Returns undefined if we have reached the end of the buffer.
     */
    BufferCursor.prototype.consumeByte = function () {
        var byte = this.buffer[this.position];
        if (byte === undefined)
            return undefined;
        this.position++;
        return byte;
    };
    /** BufferCursor#unshiftByte(byte: number)
     * Not yet implemented.
     */
    BufferCursor.prototype.unshiftByte = function (byte) {
        throw new Error('not implemented');
    };
    Object.defineProperty(BufferCursor.prototype, "length", {
        /** BufferCursor#length
         * Returns length from current position to end of Buffer
         */
        get: function () {
            return this.buffer.length - this.position;
        },
        enumerable: true,
        configurable: true
    });
    return BufferCursor;
})();
module.exports = BufferCursor;
