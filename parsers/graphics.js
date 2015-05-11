/// <reference path="../type_declarations/index.d.ts" />
var lexing_1 = require('lexing');
var states_1 = require('../parsers/states');
function parseString(content_stream_string) {
    return parseStringIterable(new lexing_1.StringIterator(content_stream_string));
}
exports.parseString = parseString;
function parseStringIterable(content_stream_string_iterable) {
    return new states_1.CONTENT_STREAM(content_stream_string_iterable, 1024).read();
}
exports.parseStringIterable = parseStringIterable;
