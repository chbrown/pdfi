import test from 'ava';

import {BufferIterator} from 'lexing';
import {consumeString} from '../parsers/consumers';

test('should consume a typical PDF string', t => {
  const iterable = BufferIterator.fromString('Hello world) >>\n2 0 obj');
  const expected = Buffer.from('Hello world', 'ascii');
  const actual = consumeString(iterable);
  t.deepEqual(actual, expected);
});

test('should consume a nested PDF string', t => {
  const iterable = BufferIterator.fromString('Hello (world)!) >>');
  const expected = Buffer.from('Hello (world)!', 'ascii');
  const actual = consumeString(iterable);
  t.deepEqual(actual, expected);
});

test('should consume a double-nested PDF string', t => {
  const iterable = BufferIterator.fromString('Hello (world (hi))!) >>');
  const expected = Buffer.from('Hello (world (hi))!', 'ascii');
  const actual = consumeString(iterable);
  t.deepEqual(actual, expected);
});

test('should consume a PDF string with unusual characters', t => {
  const iterable = BufferIterator.fromString('Hello \(world\)!) >>');
  const expected = Buffer.from('Hello (world)!', 'ascii');
  const actual = consumeString(iterable);
  t.deepEqual(actual, expected);
});
