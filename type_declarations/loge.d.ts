declare module "loge" {
  interface Logger {
    level: string;
    silly(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    critical(message: string, ...args: any[]): void;
  }
  var logger: Logger;
  export = logger;
}
