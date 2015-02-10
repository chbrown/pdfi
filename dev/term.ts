/// <reference path="../type_declarations/index.d.ts" />
import util = require("util");

/**
Prepare a string for displaying it in the terminal, by consolidating \r characters
into \r\n. Also handles natural \r\n, via regex's default greediness.
*/
export function standardize(input: string) {
  return input.replace(/\r\n?/g, '\r\n');
}

export function escape(input: string) {
  return input.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

export function inspect(input: any) {
  return util.inspect(input, {showHidden: false, depth: 10, colors: true});
}

export function print(...args: any[]) {
  // TypeScript converts args to a normal Array for us; just use that
  for (var i = 0; i < args.length; i++) {
    // convert Buffer to string
    if (Buffer.isBuffer(args[i])) {
      args[i] = args[i].toString('utf8');
    }

    // replace \r(\n) in string with \r\n
    if (args[i] && args[i].replace) {
      args[i] = args[i].replace(/\r\n?/g, '\r\n');
    }
  }

  console.log.apply(console.log, args);
}
