/// <reference path="../type_declarations/index.d.ts" />
var logger = require('loge');
function run(fn) {
    fn(function (err) {
        if (err)
            throw err;
        logger.info('DONE');
    });
}
module.exports = run;
