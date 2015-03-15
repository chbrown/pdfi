/**
This mostly functions to wrap an abstract Lexer into the form that Jison expects.

Error messages require:

    lexer.match: string
    lexer.yylineno: number
    lexer.showPosition(): string

*/
var JisonLexerWrapper = (function () {
    function JisonLexerWrapper(tokenizer) {
        this.tokenizer = tokenizer;
        this.yytext = ''; // the content represented by the current token
        this.yyleng = 0; // length of yytext
        this.options = { ranges: false };
    }
    /** setInput(input: any, yy: JisonSharedState): void
  
    The first argument is actually called with whatever you called
    `parser.parse(input)` with as `input`, and it's sent directly to the Lexer
    instance (this) via `parser.lexer.setInput(...)`, and not otherwise used.
  
    But for the purpose of wrapping lexing.Tokenizer, we need to ensure it's a
    StringIterable.
    */
    JisonLexerWrapper.prototype.setInput = function (iterable, yy) {
        this.token_iterable = this.tokenizer.map(iterable);
        this.yy = this.token_iterable['yy'] = yy;
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
        // next() always returns a non-null token
        var token = this.token_iterable.next();
        this.yytext = token.value;
        this.yyleng = this.yytext ? this.yytext.length : 0;
        // logger.debug(`lex[${token}] ->`, this.yytext);
        return token.name;
    };
    return JisonLexerWrapper;
})();
module.exports = JisonLexerWrapper;
