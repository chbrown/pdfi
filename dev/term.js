/// <reference path="../type_declarations/index.d.ts" />
var util = require("util");
/**
Prepare a string for displaying it in the terminal, by consolidating \r characters
into \r\n. Also handles natural \r\n, via regex's default greediness.
*/
function standardize(input) {
    return input.replace(/\r\n?/g, '\r\n');
}
exports.standardize = standardize;
function escape(input) {
    return input.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}
exports.escape = escape;
function inspect(input) {
    return util.inspect(input, { showHidden: false, depth: 10, colors: true });
}
exports.inspect = inspect;
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
exports.print = print;
