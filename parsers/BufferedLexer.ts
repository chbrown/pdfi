import BufferedReader = require('../readers/BufferedReader');
import logger = require('loge');

interface Location {
  first_line: number;
  first_column: number;
  last_line: number;
  last_column: number;
  range?: [number, number];
}

interface Rule {
  pattern: RegExp;
  action: (match: RegExpMatchArray) => string;
  condition: string;
}

class Machine {
  rules: Rule[];

  constructor(rules: Rule[]) {
    // fix each Rule to a standard Rule
    this.rules = rules.map(function(rule) {
      rule.pattern = new RegExp('^' + (<RegExp>rule.pattern).source);
      return rule;
    });
  }

  getRules(name: string): Rule[] {
    return this.rules.filter(function(rule) {
      return rule.condition == name;
    });
  }
}

interface LexerOptions {
  ranges: boolean; // defaults to false
}

interface Lexer {
  yy: any; // {lexer: [Circular], parser: jison.Parser}

  yytext: any; // the content represented by the current token
  yyleng: number; // length of yytext
  yylineno: number; // the current line number in the input
  yyloc: Location;
  yylloc: Location; // same as yyloc, except describes the previous location

  options: LexerOptions;

  setInput(input: any, yy: any): void;
  lex(): string;

  /** For error messages:
    lexer.match: string
    lexer.yylineno: number
    lexer.showPosition(): string
  */
}

class BufferedLexer implements Lexer {
  // interface:
  yy: any;
  yytext: any;
  yyleng: number;
  yylineno: number;
  yyloc: Location;
  yylloc: Location;
  options: LexerOptions;
  // implementation
  machine: Machine;
  state_stack: string[];
  reader: BufferedReader;

  pushState(state: string) {
    return this.state_stack.push(state);
  }
  popState(): string {
    return this.state_stack.pop();
  }
  currentState(): string {
    return this.state_stack[this.state_stack.length - 1];
  }

  constructor(rules: Rule[], options: LexerOptions = {ranges: false}) {
    this.machine = new Machine(rules);

    // initialize with empty values
    this.yytext = '';
    this.yyleng = 0;
    this.yylineno = 0;
    this.yyloc = this.yylloc = {
      first_line: 1,
      first_column: 0,
      last_line: 1,
      last_column: 0,
    };

    this.state_stack = ['INITIAL'];

    this.options = options;
  }

  setInput(reader: BufferedReader, yy: any): void {
    this.yy = yy;

    this.reader = reader;
    // this.file_cursor_EOF = false;
  }

  lex(): string {
    var token: string = null;
    // parse until we get a non-null token
    while (token === null) {
      token = this.next()
    }
    return token;
  }

  next(): string {
    // pull in some data from the underlying file
    var buffer = this.reader.peekBuffer(256);
    // if we ask for 256 bytes and get back 0, we are at EOF
    if (buffer.length === 0) {
      return 'EOF';
    }

    // TODO: optimize this
    var input = buffer.toString('ascii');

    var current_state = this.currentState();
    var current_rules = this.machine.getRules(current_state);
    for (var i = 0, rule; (rule = current_rules[i]); i++) {
      var match = input.match(rule.pattern);
      if (match) {
        // logger.info(`match: ${rule.pattern.source}, ${rule.condition}`);
        this.yytext = match[0];
        this.reader.skip(this.yytext.length);
        var token = rule.action.call(this, match);
        return token;
      }
    }

    throw new Error(`Invalid language; could not find a match in input: ${input}`);
  }

}

export = BufferedLexer;
