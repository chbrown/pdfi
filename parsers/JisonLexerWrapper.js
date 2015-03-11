/**
This mostly functions to wrap an abstract Lexer into the form that Jison expects.

Error messages require:

    lexer.match: string
    lexer.yylineno: number
    lexer.showPosition(): string

*/
var JisonLexerWrapper = (function () {
    function JisonLexerWrapper(lexer) {
        this.lexer = lexer;
        this.yytext = ''; // the content represented by the current token
        this.yyleng = 0; // length of yytext
        this.options = { ranges: false };
    }
    /** setInput(input: any, yy: JisonSharedState): void
  
    The first argument is actually called with whatever you called
    parser.parse(...) with, which is sent directly to the Lexer and not otherwise
    used.
  
    But for the purpose of wrapping BufferedLexer, we need to ensure it's a
    BufferedReader.
    */
    JisonLexerWrapper.prototype.setInput = function (input, yy) {
        this.lexer.reader = input;
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
    /**
    This is how the parser hooks into the lexer.
    */
    JisonLexerWrapper.prototype.lex = function () {
        // next() runs read() until we get a non-null token
        var token_value_pair = this.lexer.next();
        var token = token_value_pair[0];
        this.yytext = token_value_pair[1];
        this.yyleng = this.yytext ? this.yytext.length : 0;
        // logger.debug(`lex[${token}] ->`, this.yytext);
        return token;
    };
    return JisonLexerWrapper;
})();
module.exports = JisonLexerWrapper;
