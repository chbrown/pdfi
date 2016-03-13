import {BufferIterable} from 'lexing';
import {List, compare} from 'lexing/buffer';

import ascii from '../encoding/ascii';

/** BufferTest represents a function that tests a Buffer and returns the number
of matching bytes from the beginning of the Buffer. A return value of 0 means
that no bytes matched. */
type BufferTest = (buffer: List<number>) => number;

function createBufferEqualityTest(expected: List<number>): BufferTest {
  return (actual: List<number>) => {
    // actual might be much longer, but that's okay, compare only tests up to
    // the end of the 'needle' argument
    return compare(actual, expected) ? expected.length : 0;
  };
}

function createStringEqualityTest(expected: string, encoding = 'utf8'): BufferTest {
  return createBufferEqualityTest(new Buffer(expected, encoding));
}

/**
Test for 3-digit octal character codes / escapes like \053 (= 43 = "+")
*/
function octalTest(buffer: List<number>): number {
  if (buffer[0] == ascii.REVERSE_SOLIDUS) {
    // 48 -> "0", 49 -> "1", ..., 57 -> "9"
    if (buffer[1] >= 48 && buffer[1] <= 57) {
      if (buffer[2] >= 48 && buffer[2] <= 57) {
        if (buffer[3] >= 48 && buffer[3] <= 57) {
          return 4;
        }
      }
    }
  }
  return 0;
}

const endStringTest = createStringEqualityTest(')');
const beginStringTest = createStringEqualityTest('(');

/**
The string consumer just reads a (nestable) string until the end, without any
processing, so it returns a standard Buffer.
*/
export function consumeString(iterable: BufferIterable,
                              state: Buffer = new Buffer(0),
                              peekLength = 1024): Buffer {
  const buffer = iterable.peek(peekLength);
  let matchLength: number;
  // end of string marker
  if ((matchLength = endStringTest(buffer)) > 0) {
    iterable.skip(matchLength);
    // pop; the outermost string does not get parens wrappers
    return state;
  }
  // handle nested STRING
  else if ((matchLength = beginStringTest(buffer)) > 0) {
    iterable.skip(matchLength);
    const nestedState = consumeString(iterable);
    const newState = Buffer.concat([state, new Buffer('('), nestedState, new Buffer(')')]);
    return consumeString(iterable, newState);
  }
  // capture 3-digit octal character codes / escapes like \053 (= 43 = "+")
  else if ((matchLength = octalTest(buffer)) > 0) {
    const match = iterable.next(matchLength);
    const byte = parseInt(match.toString('ascii', 1, 4), 8);
    const newState = Buffer.concat([state, new Buffer([byte])]);
    return consumeString(iterable, newState);
  }
  // escaped control characters; these are kind of weird, not sure if they're legitimate
  // '\\'+'n' => \n
  else if (buffer[0] === ascii.REVERSE_SOLIDUS && buffer[1] === ascii.LATIN_SMALL_LETTER_N) {
    iterable.skip(2);
    const newState = Buffer.concat([state, new Buffer([ascii.LINE_FEED])]);
    return consumeString(iterable, newState);
  }
  // '\\'+'r' => \r
  else if (buffer[0] === ascii.REVERSE_SOLIDUS && buffer[1] === ascii.LATIN_SMALL_LETTER_R) {
    iterable.skip(2);
    const newState = Buffer.concat([state, new Buffer([ascii.CARRIAGE_RETURN])]);
    return consumeString(iterable, newState);
  }
  // '\\'+'\n' or '\\'+'\r' => nothing
  else if (buffer[0] === ascii.REVERSE_SOLIDUS && (
             buffer[1] === ascii.LINE_FEED ||
             buffer[1] === ascii.CARRIAGE_RETURN)) {
    iterable.skip(2);
    return consumeString(iterable, state);
  }
  // escaped backslash => single backslash
  // escaped start and end parens (yes, this happens, see PDF33000_2008.pdf:9.4.3)
  // and escaped start and end braces (I guess to avoid array ambiguity?)
  // Rule(/^\\(\\|\(|\)|\[|\])/, ...),
  else if (buffer[0] === ascii.REVERSE_SOLIDUS && (
             buffer[1] === ascii.REVERSE_SOLIDUS ||
             buffer[1] === ascii.LEFT_PARENTHESIS ||
             buffer[1] === ascii.RIGHT_PARENTHESIS ||
             buffer[1] === ascii.LEFT_SQUARE_BRACKET ||
             buffer[1] === ascii.RIGHT_SQUARE_BRACKET)) {
    const match = iterable.next(2);
    const newState = Buffer.concat([state, match.slice(1)]);
    return consumeString(iterable, newState);
  }

  // capture anything else verbatim
  // TODO: start at 1 so that we mis-parse rather than stack overflow
  for (matchLength = 0; matchLength < buffer.length; matchLength++) {
    const byte = buffer[matchLength];
    // if the current byte matches any of the special characters or delimiters,
    // we break so that the verbatim match does not consume it
    if (byte === ascii.REVERSE_SOLIDUS || byte === ascii.LEFT_PARENTHESIS || byte === ascii.RIGHT_PARENTHESIS) {
      break;
    }
  }
  // TODO: handle premature EOF -- we should never reach it before the ')'
  // character, but if the file is broken / malformed we'd quickly hit a stack overflow
  const newState = Buffer.concat([state, iterable.next(matchLength)]);
  return consumeString(iterable, newState);
}
