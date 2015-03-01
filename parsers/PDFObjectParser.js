var jison = require('jison');
var bnf = require('./bnf.json');
var JisonLexer = require('./JisonLexer');
// load the precompiled Jison parser
// import JisonParser = require('./JisonParser');
// and the lexing rules
var pdfrules = require('./pdfrules');
var PDFObjectParser = (function () {
    function PDFObjectParser(pdf, start) {
        this.jison_parser = new jison.Parser({
            start: start,
            bnf: bnf,
        });
        this.jison_parser.lexer = new JisonLexer(pdfrules);
        this.jison_parser.yy = { pdf: pdf };
    }
    PDFObjectParser.prototype.parse = function (reader) {
        return this.jison_parser.parse(reader);
    };
    return PDFObjectParser;
})();
module.exports = PDFObjectParser;
