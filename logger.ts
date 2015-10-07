/// <reference path="type_declarations/index.d.ts" />
import {Logger, Level, Writable} from 'loge';

var outputStream: Writable;
if (process.stderr) {
  outputStream = process.stderr;
}
else {
  outputStream = {
    write: (str: string) => {
      console.log(str);
      return true;
    }
  }
}

export var logger = new Logger(outputStream, Level.debug);
