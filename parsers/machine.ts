import {BufferIterable} from 'lexing';

import {PDF} from '../PDF';
import {PDFBufferIterable} from './index';

// mostly copied and modified from lexing

export type MachineCallback<T> = (match?: RegExpMatchArray) => T;

export type MachineRule<T> = [RegExp, MachineCallback<T>];
export function MachineRule<T>(regexp: RegExp, callback: MachineCallback<T>): MachineRule<T> {
  return [regexp, callback];
}

export interface MachineStateConstructor<T, I> {
  new(iterable: PDFBufferIterable, encoding?: string, peekLength?: number): MachineState<T, I>;
}
export class MachineState<T, I> {
  protected value: I;
  protected rules: MachineRule<T>[];
  constructor(protected iterable: PDFBufferIterable,
              protected encoding: string = 'binary',
              protected peekLength: number = 1024) { }

  private get name(): string {
    return this.constructor['name'];
  }
  pop(): T {
    return <any>this.value;
  }
  ignore(): T {
    return undefined;
  }
  attachState<SubT, SubI>(SubState: MachineStateConstructor<SubT, SubI>): MachineState<SubT, SubI> {
    return new SubState(this.iterable, this.encoding, this.peekLength);
  }
  read(): T {
    while (1) {
      var input = this.iterable.peek(this.peekLength).toString(this.encoding);
      var match: RegExpMatchArray;
      for (var i = 0, rule: MachineRule<T>; (rule = this.rules[i]); i++) {
        // rule[0] is the RegExp; rule[1] is the instance method to call on success
        match = input.match(rule[0]);
        if (match !== null) {
          // advance the input tape over the matched input
          const matchByteLength = Buffer.byteLength(match[0], this.encoding);
          this.iterable.skip(matchByteLength);
          // apply the matched transition
          var result = rule[1].call(this, match);
          if (result !== undefined) {
            return result;
          }
          if (input.length === 0) {
            throw new Error(`EOF reached without termination; cannot continue`);
          }
          // break out of the for loop while match is still defined
          break;
        }
      }

      // If at some point in the input iterable we run through all the patterns
      // and none of them match, we cannot proceed further.
      if (match === null) {
        var clean_input = input.slice(0, 128).replace(/\r\n|\r/g, '\n').replace(/\t|\v|\f/g, ' ').replace(/\0|\b/g, '');
        throw new Error(`Invalid language; could not find a match in input "${clean_input}" for state "${this.name}"`);
      }
    }
  }
}
