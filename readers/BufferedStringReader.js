var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/// <reference path="../type_declarations/index.d.ts" />
var BufferedBufferReader = require('./BufferedBufferReader');
var BufferedStringReader = (function (_super) {
    __extends(BufferedStringReader, _super);
    function BufferedStringReader(input, encoding) {
        _super.call(this, new Buffer(input, encoding));
    }
    return BufferedStringReader;
})(BufferedBufferReader);
module.exports = BufferedStringReader;
