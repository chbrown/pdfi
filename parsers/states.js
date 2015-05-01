var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var Arrays = require('../Arrays');
var Rule = lexing.MachineRule;
// var State = lexing.MachineState; // MachineState<ResultType, InternalType>
function parseHex(raw) {
    var hexstring = raw.replace(/\s+/g, '');
    return Arrays.range(hexstring.length, 2).map(function (i) { return parseInt(hexstring.slice(i, i + 2), 16); });
}
var escapeCharCodes = {
    '\\n': 10,
    '\\r': 13,
    '\\\\': 92,
};
/**
BYTESTRING is parens-delimited
*/
var BYTESTRING = (function (_super) {
    __extends(BYTESTRING, _super);
    function BYTESTRING() {
        _super.apply(this, arguments);
        this.value = [];
        this.rules = [
            Rule(/^\)/, this.pop),
            // escaped start and end parens (yes, this happens, see PDF32000_2008.pdf:9.4.3)
            // and escaped start and end braces (I guess to avoid array ambiguity?)
            Rule(/^\\(\(|\)|\[|\])/, this.captureGroup),
            // escaped control characters; these are kind of weird, not sure if they're legitimate
            Rule(/^\\(n|r)/, this.captureEscape),
            // escaped backslash
            Rule(/^\\\\/, this.captureEscape),
            // 3-digit octal character code
            Rule(/^\\([0-8]{3})/, this.captureOct),
            Rule(/^(.|\n|\r)/, this.captureGroup),
        ];
    }
    BYTESTRING.prototype.captureGroup = function (matchValue) {
        this.value.push(matchValue[1].charCodeAt(0));
        return undefined;
    };
    BYTESTRING.prototype.captureEscape = function (matchValue) {
        this.value.push(escapeCharCodes[matchValue[0]]);
        return undefined;
    };
    BYTESTRING.prototype.captureOct = function (matchValue) {
        this.value.push(parseInt(matchValue[1], 8));
        return undefined;
    };
    return BYTESTRING;
})(lexing.MachineState);
exports.BYTESTRING = BYTESTRING;
var IMAGEDATA = (function (_super) {
    __extends(IMAGEDATA, _super);
    function IMAGEDATA() {
        _super.apply(this, arguments);
        this.value = [];
        this.rules = [
            // TODO: deal with non-operator "EI" strings that crop up in the ID value better.
            // Right now, I'm just assuming that they won't have whitespace before them.
            Rule(/^EI/, this.pop),
            Rule(/^(\S+)/, this.captureGroup),
            Rule(/^(.|\n|\r)/, this.captureGroup),
        ];
    }
    IMAGEDATA.prototype.captureGroup = function (matchValue) {
        this.value.push(matchValue[1]);
        return undefined;
    };
    IMAGEDATA.prototype.pop = function () {
        return this.value.join('');
    };
    return IMAGEDATA;
})(lexing.MachineState);
exports.IMAGEDATA = IMAGEDATA;
var Collection = (function (_super) {
    __extends(Collection, _super);
    function Collection() {
        _super.apply(this, arguments);
    }
    Collection.prototype.push = function (value) {
        throw new Error('Abstract method');
    };
    Collection.prototype.captureHex = function (matchValue) {
        this.push(parseHex(matchValue[1]));
        return undefined;
    };
    Collection.prototype.captureDictionary = function (matchValue) {
        var dictionary = this.attachState(DICTIONARY).read();
        this.push(dictionary);
        return undefined;
    };
    Collection.prototype.captureArray = function (matchValue) {
        var array = this.attachState(ARRAY).read();
        this.push(array);
        return undefined;
    };
    Collection.prototype.captureString = function (matchValue) {
        var string = this.attachState(BYTESTRING).read();
        this.push(string);
        return undefined;
    };
    Collection.prototype.captureName = function (matchValue) {
        this.push(matchValue[1]);
        return undefined;
    };
    Collection.prototype.captureFloat = function (matchValue) {
        this.push(parseFloat(matchValue[0]));
        return undefined;
    };
    Collection.prototype.captureInt = function (matchValue) {
        this.push(parseInt(matchValue[0], 10));
        return undefined;
    };
    return Collection;
})(lexing.MachineState);
var Operation = (function () {
    function Operation(operator, operands) {
        this.operator = operator;
        this.operands = operands;
    }
    return Operation;
})();
exports.Operation = Operation;
var CONTENT_STREAM = (function (_super) {
    __extends(CONTENT_STREAM, _super);
    function CONTENT_STREAM() {
        _super.apply(this, arguments);
        this.value = [];
        this.stack = [];
        this.rules = [
            Rule(/^$/, this.pop),
            Rule(/^\s+/, this.ignore),
            Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
            Rule(/^<</, this.captureDictionary),
            Rule(/^\[/, this.captureArray),
            Rule(/^\(/, this.captureString),
            Rule(/^ID/, this.captureImageData),
            Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
            Rule(/^-?\d*\.\d+/, this.captureFloat),
            Rule(/^-?\d+/, this.captureInt),
            Rule(/^%%EOF/, this.pop),
            Rule(/^[A-Za-z'"]+\*?/, this.captureOperator),
        ];
    }
    CONTENT_STREAM.prototype.captureOperator = function (matchValue) {
        var operator = matchValue[0];
        this.value.push(new Operation(operator, this.stack));
        this.stack = [];
    };
    CONTENT_STREAM.prototype.push = function (value) {
        this.stack.push(value);
    };
    CONTENT_STREAM.prototype.captureImageData = function (matchValue) {
        // var image_data = new IMAGEDATA(this.iterable).read();
        // TODO: Figure out why TypeScript can't infer the type of image_data with
        // the following syntax:
        var image_data = this.attachState(IMAGEDATA).read();
        this.push(image_data);
        return undefined;
    };
    return CONTENT_STREAM;
})(Collection);
exports.CONTENT_STREAM = CONTENT_STREAM;
var ARRAY = (function (_super) {
    __extends(ARRAY, _super);
    function ARRAY() {
        _super.apply(this, arguments);
        this.value = [];
        this.rules = [
            Rule(/^\]/, this.pop),
            Rule(/^\s+/, this.ignore),
            Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
            Rule(/^\(/, this.captureString),
            Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
            Rule(/^-?\d*\.\d+/, this.captureFloat),
            Rule(/^-?\d+/, this.captureInt),
        ];
    }
    ARRAY.prototype.push = function (value) {
        this.value.push(value);
    };
    return ARRAY;
})(Collection);
exports.ARRAY = ARRAY;
var DICTIONARY = (function (_super) {
    __extends(DICTIONARY, _super);
    function DICTIONARY() {
        _super.apply(this, arguments);
        this.value = [];
        this.rules = [
            Rule(/^>>/, this.pop),
            Rule(/^\s+/, this.ignore),
            Rule(/^<([A-Fa-f0-9 \r\n]*)>/, this.captureHex),
            Rule(/^<</, this.captureDictionary),
            Rule(/^\[/, this.captureArray),
            Rule(/^\(/, this.captureString),
            Rule(/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, this.captureName),
            Rule(/^-?\d*\.\d+/, this.captureFloat),
            Rule(/^-?\d+/, this.captureInt),
        ];
    }
    DICTIONARY.prototype.push = function (value) {
        this.value.push(value);
    };
    return DICTIONARY;
})(Collection);
exports.DICTIONARY = DICTIONARY;
