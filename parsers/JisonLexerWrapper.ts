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

  constructor(public lexer: lexing.BufferedLexer<[string, any]>) { }

  /** setInput(input: any, yy: JisonSharedState): void

  The first argument is actually called with whatever you called
  parser.parse(...) with, which is sent directly to the Lexer and not otherwise
  used.

  But for the purpose of wrapping BufferedLexer, we need to ensure it's a
  BufferedReader.
  */
  setInput(input: lexing.BufferedReader, yy: JisonSharedState): void {
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
  }

  /**
  This is how the parser hooks into the lexer.
  */
  lex(): string {
    // next() runs read() until we get a non-null token
    var token_value_pair = this.lexer.next()
    var token = token_value_pair[0];
    this.yytext = token_value_pair[1];
    this.yyleng = this.yytext ? this.yytext.length : 0;
    // logger.debug(`lex[${token}] ->`, this.yytext);
    return token;
  }
}

export = JisonLexerWrapper;
