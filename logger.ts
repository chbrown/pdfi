import {Logger, Level, Writable} from 'loge';
import {format} from 'util';

class ConsoleLogger extends Logger {
  log(level: Level, args: any[]) {
    if (level >= this.level) {
      var text = format.apply(null, args);
      console.error(`[${Level[level]}] ${text}`);
    }
  }
}

export var logger = new ConsoleLogger(null, Level.info);
