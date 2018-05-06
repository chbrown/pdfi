import {strictEqual} from 'assert';

import {BufferIterator} from 'lexing';
import {consumeString} from '../parsers/consumers';

function assertBuffersEqual(actual, expected, message?: string) {
  return strictEqual(actual.toString('hex'), expected.toString('hex'), message);
}

describe('consumers', () => {
  it('should consume a typical PDF string', () => {
    const iterable = BufferIterator.fromString('Hello world) >>\n2 0 obj');
    const expected = Buffer.from('Hello world', 'ascii');
    const actual = consumeString(iterable);
    assertBuffersEqual(actual, expected);
  });

  it('should consume a nested PDF string', () => {
    const iterable = BufferIterator.fromString('Hello (world)!) >>');
    const expected = Buffer.from('Hello (world)!', 'ascii');
    const actual = consumeString(iterable);
    assertBuffersEqual(actual, expected);
  });

  it('should consume a double-nested PDF string', () => {
    const iterable = BufferIterator.fromString('Hello (world (hi))!) >>');
    const expected = Buffer.from('Hello (world (hi))!', 'ascii');
    const actual = consumeString(iterable);
    assertBuffersEqual(actual, expected);
  });

  it('should consume a PDF string with unusual characters', () => {
    const iterable = BufferIterator.fromString('Hello \(world\)!) >>');
    const expected = Buffer.from('Hello (world)!', 'ascii');
    const actual = consumeString(iterable);
    assertBuffersEqual(actual, expected);
  });
});
