declare module "loge" {
  interface Logger {
    level: string;
    silly(...args: any[]): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    critical(...args: any[]): void;
  }
  var logger: Logger;
  export = logger;
}
