/// <reference path="../type_declarations/index.d.ts" />
function print() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i - 0] = arguments[_i];
    }
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
module.exports = print;
