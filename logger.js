/// <reference path="type_declarations/index.d.ts" />
var loge_1 = require('loge');
var outputStream;
if (process.stderr) {
    outputStream = process.stderr;
}
else {
    outputStream = {
        write: function (str) {
            console.log(str);
            return true;
        }
    };
}
exports.logger = new loge_1.Logger(outputStream, loge_1.Level.debug);
