// mostly from loge but simpler

export enum Level {
  notset = 0,
  debug = 10,
  info = 20,
  warning = 30,
  error = 40,
  critical = 50,
}

export class Logger {
  constructor(public level: Level = Level.notset) { }

  log(level: Level, message?: any, ...optionalParams: any[]) {
    if (level >= this.level) {
      console.error(`[${Level[level]}] ${message}`, ...optionalParams);
    }
  }

  debug(message?: any, ...optionalParams: any[]): void {
    return this.log(Level.debug, message, ...optionalParams);
  }
  info(message?: any, ...optionalParams: any[]): void {
    return this.log(Level.info, message, ...optionalParams);
  }
  warning(message?: any, ...optionalParams: any[]): void {
    return this.log(Level.warning, message, ...optionalParams);
  }
  error(message?: any, ...optionalParams: any[]): void {
    return this.log(Level.error, message, ...optionalParams);
  }
  critical(message?: any, ...optionalParams: any[]): void {
    return this.log(Level.critical, message, ...optionalParams);
  }
}

export const logger = new Logger(Level.info);
