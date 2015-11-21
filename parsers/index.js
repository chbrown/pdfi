var lexing_1 = require('lexing');
var states_1 = require('./states');
function parsePDFObject(string_iterable) {
    return new states_1.OBJECT(string_iterable, 1024).read();
}
exports.parsePDFObject = parsePDFObject;
function parseContentStream(content_stream_string) {
    var string_iterable = new lexing_1.StringIterator(content_stream_string);
    return new states_1.CONTENT_STREAM(string_iterable, 1024).read();
}
exports.parseContentStream = parseContentStream;
function parseCMap(string_iterable) {
    return new states_1.CMAP(string_iterable, 1024).read();
}
exports.parseCMap = parseCMap;
