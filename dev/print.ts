/// <reference path="../type_declarations/index.d.ts" />

function print(...args: any[]) {
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

export = print;
