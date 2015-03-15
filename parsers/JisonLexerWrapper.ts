/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');

interface JisonLocation {
  first_line: number;
  first_column: number;
  last_line: number;
  last_column: number;
  range?: [number, number];
}

interface JisonSharedState {
  lexer: JisonLexerWrapper;
  parser: any; // an instance of Jison's Parser
}

interface JisonLexerOptions {
  ranges: boolean; // defaults to false
}

/**
This mostly functions to wrap an abstract Lexer into the form that Jison expects.

Error messages require:

    lexer.match: string
    lexer.yylineno: number
    lexer.showPosition(): string

*/
class JisonLexerWrapper {
  // interface:
  yy: JisonSharedState;
  yytext: any = ''; // the content represented by the current token
  yyleng: number = 0; // length of yytext
  yylineno: number; // the current line number in the input
  yyloc: JisonLocation;
  yylloc: JisonLocation; // same as yyloc, except describes the previous location
  options: JisonLexerOptions = {ranges: false};
  token_iterable: lexing.TokenIterable<any>;

  constructor(public tokenizer: lexing.Tokenizer<any>) { }

  /** setInput(input: any, yy: JisonSharedState): void

  The first argument is actually called with whatever you called
  `parser.parse(input)` with as `input`, and it's sent directly to the Lexer
  instance (this) via `parser.lexer.setInput(...)`, and not otherwise used.

  But for the purpose of wrapping lexing.Tokenizer, we need to ensure it's a
  StringIterable.
  */
  setInput(iterable: lexing.StringIterable, yy: JisonSharedState): void {
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
  }

  /**
  This is how the parser hooks into the lexer.
  */
  lex(): string {
    // next() always returns a non-null token
    var token = this.token_iterable.next();
    this.yytext = token.value;
    this.yyleng = this.yytext ? this.yytext.length : 0;
    // logger.debug(`lex[${token}] ->`, this.yytext);
    return token.name;
  }
}

export = JisonLexerWrapper;
