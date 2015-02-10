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
class BufferCursor {
  constructor(public buffer: Buffer, public position: number = 0) { }
  /** Reads `length` bytes from the buffer, advancing the cursor past them.
   * Returns the remainder of the buffer if no length is specified.
   * Returns '' if we have reached the end of the buffer.
   */
  consumeString(length: number = this.buffer.length - this.position,
                encoding: string = 'utf8'): string {
    var start = this.position;
    this.position += length;
    return this.buffer.toString(encoding, start, this.position);
  }
  /** Reads one byte from the buffer, advancing the cursor past it.
   * Returns undefined if we have reached the end of the buffer.
   */
  consumeByte(): number {
    var byte = this.buffer[this.position];
    if (byte === undefined) return undefined;
    this.position++;
    return byte;
  }

  /** BufferCursor#unshiftByte(byte: number)
   * Not yet implemented.
   */
  unshiftByte(byte: number): void {
    throw new Error('not implemented');
  }

  /** BufferCursor#length
   * Returns length from current position to end of Buffer
   */
  get length(): number {
    return this.buffer.length - this.position;
  }
}

export = BufferCursor;
