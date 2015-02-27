var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var BufferedLexer = require('./BufferedLexer');
/**
This mostly functions to wrap an abstract Lexer into the form that Jison expects.

Error messages require:

    lexer.match: string
    lexer.yylineno: number
    lexer.showPosition(): string

*/
var JisonLexer = (function (_super) {
    __extends(JisonLexer, _super);
    // BufferedLexer needs/provides the following properties:
    // states: Stack;
    // rules: Rule[];
    // reader: BufferedReader;
    function JisonLexer(rules, options) {
        if (options === void 0) { options = { ranges: false }; }
        _super.call(this, rules);
        this.options = options;
    }
    /** setInput(input: any, yy: JisonSharedState): void
  
    The first argument is actually called with whatever you called
    parser.parse(...) with, which is sent directly to the Lexer and not otherwise
    used.
  
    But for the purpose of wrapping BufferedLexer, we need to ensure it's a
    BufferedReader.
    */
    JisonLexer.prototype.setInput = function (input, yy) {
        this.reader = input;
        this.yy = yy;
        this.yytext = '';
        this.yyleng = 0;
        this.yylineno = 0;
        this.yyloc = this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0,
        };
    };
    JisonLexer.prototype.lex = function () {
        var token = null;
        // next() runs read() until we get a non-null token
        var token_value_pair = this.next();
        token = token_value_pair[0];
        this.yytext = token_value_pair[1];
        this.yyleng = this.yytext ? this.yytext.length : 0;
        // logger.debug(`lex[${token}] ->`, this.yytext);
        return token;
    };
    return JisonLexer;
})(BufferedLexer);
module.exports = JisonLexer;
