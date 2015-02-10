/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');

function run(fn: (callback: ErrorCallback) => void): void {
  fn(function(err) {
    if (err) throw err;
    logger.info('DONE');
  });
}

export = run;
