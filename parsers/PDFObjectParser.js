/// <reference path="../type_declarations/index.d.ts" />
var logger = require('loge');
var chalk = require('chalk');
var BufferedStringReader = require('../readers/BufferedStringReader');
var JisonLexer = require('./JisonLexer');
// load the precompiled Jison parser
var JisonParser = require('./pdfobject.parser').Parser;
// and the lexing rules
var pdfrules = require('./pdfrules');
var PDFObjectParser = (function () {
    function PDFObjectParser() {
        this.jison_parser = new JisonParser();
        this.jison_parser.lexer = new JisonLexer(pdfrules);
    }
    Object.defineProperty(PDFObjectParser.prototype, "yy", {
        get: function () {
            return this.jison_parser.yy;
        },
        enumerable: true,
        configurable: true
    });
    PDFObjectParser.prototype.parseString = function (input) {
        var reader = new BufferedStringReader(input);
        return this.parse(reader);
    };
    PDFObjectParser.prototype.parse = function (reader) {
        try {
            return this.jison_parser.parse(reader);
        }
        catch (exc) {
            logger.error(chalk.red(exc.message).toString());
            throw exc;
        }
    };
    return PDFObjectParser;
})();
module.exports = PDFObjectParser;
