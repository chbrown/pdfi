import BufferedReader = require('../readers/BufferedReader');
import BufferedLexer = require('./BufferedLexer');

// TODO: import Rule from a more general source
interface Rule<T> {
  pattern: RegExp;
  action: (match: RegExpMatchArray) => T;
}

interface JisonLocation {
  first_line: number;
  first_column: number;
  last_line: number;
  last_column: number;
  range?: [number, number];
}

interface JisonSharedState {
  lexer: JisonLexer;
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
class JisonLexer extends BufferedLexer<[string, any]> {
  // interface:
  yy: JisonSharedState;
  yytext: any; // the content represented by the current token
  yyleng: number; // length of yytext
  yylineno: number; // the current line number in the input
  yyloc: JisonLocation;
  yylloc: JisonLocation; // same as yyloc, except describes the previous location
  // BufferedLexer needs/provides the following properties:
  // states: Stack;
  // rules: Rule[];
  // reader: BufferedReader;

  constructor(rules: Rule<[string, any]>[],
              public options: JisonLexerOptions = {ranges: false}) {
    super(rules);
  }

  /** setInput(input: any, yy: JisonSharedState): void

  The first argument is actually called with whatever you called
  parser.parse(...) with, which is sent directly to the Lexer and not otherwise
  used.

  But for the purpose of wrapping BufferedLexer, we need to ensure it's a
  BufferedReader.
  */
  setInput(input: BufferedReader, yy: JisonSharedState): void {
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
  }

  lex(): string {
    var token: string = null;
    // next() runs read() until we get a non-null token
    var token_value_pair = this.next()
    token = token_value_pair[0];
    this.yytext = token_value_pair[1];
    this.yyleng = this.yytext ? this.yytext.length : 0;
    // logger.debug(`lex[${token}] ->`, this.yytext);
    return token;
  }
}

export = JisonLexer;
