import BufferedReader = require('../readers/BufferedReader');
import logger = require('loge');

interface Rule<T> {
  pattern: RegExp;
  action: (match: RegExpMatchArray) => T;
  // condition: string;
}

class Stack {
  constructor(private items: string[] = []) { }
  push(item: string) {
    return this.items.push(item);
  }
  pop(): string {
    return this.items.pop();
  }
  get top(): string {
    return this.items[this.items.length - 1];
  }
  get size(): number {
    return this.items.length;
  }
  toString(): string {
    return this.items[this.items.length - 1];
  }
}

class BufferedLexer<T> {
  states: Stack = new Stack(['INITIAL']);

  constructor(private rules: Rule<T>[], public reader?: BufferedReader) { }

  /**
  Returns the next available pair from the input reader (usually [token, data]).

  If the matching rule's action returns null, this will return null.
  */
  read(): T {
    // TODO: abstract out the peekBuffer + toString, back into the reader?
    //   optimize string conversion
    var input = this.reader.peekBuffer(256).toString('ascii');

    var current_state = this.states.top;
    for (var i = 0, rule; (rule = this.rules[i]); i++) {
      if (rule.condition === current_state) {
        var match = input.match(rule.pattern);
        if (match) {
          // var newline_matches = match[0].match(/(\r\n|\n|\r)/g);
          // var newlines = newline_matches ? newline_matches.length : 0;
          this.reader.skip(match[0].length);
          return rule.action.call(this, match);
        }
      }
    }

    throw new Error(`Invalid language; could not find a match in input: "${input}"`);
  }

  /**
  Returns the next available non-null token / symbol output from the input
  reader (usually a token_data: [string, any] tuple).

  This will never return null.
  */
  next(): T {
    var result;
    do {
      result = this.read();
    } while (result === null);
    return result;
  }
}

export = BufferedLexer;
