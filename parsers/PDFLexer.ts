import FileCursor = require('../FileCursor');

/**
Lexer minimum:

  lexer.lex() => string
  lexer.setInput(input, yy: {lexer: [Circular], parser: jison.Parser}): void

Also uses:

  lexer.yytext: any; // the content represented by the current input
  lexer.yyleng: number; // length of yytext
  lexer.yylineno: number; // the current line number in the input
  lexer.yyloc: {
    first_line: number = 1,
    first_column: number = 0,
    last_line: number = 1,
    last_column: number = 0,
    range: [number, number],
  };
  lexer.yylloc: ...; // last location --

  lexer.options: {
    ranges: boolean = false,
  }

Error messages:

  use:
    lexer.match: string
    lexer.yylineno: number

  options:
    lexer.showPosition()

*/

interface Location {
  first_line: number;
  first_column: number;
  last_line: number;
  last_column: number;
  range?: [number, number];
}

type ActionFunction = (match: RegExpMatchArray) => string;

interface RuleDefinition {
  // when pattern is a string, it must match the input exactly.
  // when it is a RegExp, it implicitly has ^ prepended to it.
  pattern: RegExp | string;
  // when action is a string, it is simply returned.
  // when it is null, it returns null (meaning, no output).
  // when it is a function, it is called with the activating match,
  //  and bound to the lexer. The lexer.yytext value will already have been set
  //  to the full text of the match.
  action: string | ActionFunction;
  // if condition is set, the rule only applies when a state matching that
  // condition is on top of the state stack. defaults to INITIAL
  condition?: string; // = 'INITIAL';
}

var pdf_rules: RuleDefinition[] = [
  {
    pattern: /<[A-Fa-f0-9]+>/,
    action: 'HEXSTRING',
  },
  {
    pattern: 'true',
    action: function(match) {
      this.yytext = true;
      return 'BOOLEAN';
    },
  },
  {
    pattern: 'false',
    action: function(match) {
      this.yytext = false;
      return 'FALSE';
    },
  },
  {
    pattern: /\s+/,
    action: null,
  },
  {
    pattern: /\(/,
    action: function(match) {
      this.pushState('INPARENS');
      return 'OPENPARENS';
    },
  },
  {
    pattern: /\/[!-'*-.0-;=?-Z\\^-z|~]+/,
    action: function(match) {
      this.yytext = this.yytext.slice(1);
      return 'NAME';
    },
  },
  {
    pattern: /<</,
    action: '<<',
  },
  {
    pattern: />>/,
    action: '>>',
  },
  {
    pattern: /\[/,
    action: '[',
  },
  {
    pattern: /\]/,
    action: ']',
  },
  {
    pattern: /([0-9]+)\s+([0-9]+)\s+R/,
    action: function(match) {
      this.yytext = {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
      };
      return 'REFERENCE';
    }
  },
  {
    pattern: /([0-9]+)\s+([0-9]+)\s+obj/,
    action: function(match) {
      this.yytext = {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
      };
      return 'INDIRECT_OBJECT_IDENTIFIER';
    }
  },
  {
    pattern: /endobj/,
    action: 'END_INDIRECT_OBJECT',
  },
  {
    pattern: /[0-9]+\.[0-9]+/,
    action: function(match) {
      this.yytext = parseFloat(match[0]);
      return 'NUMBER';
    },
  },
  {
    pattern: /[0-9]+/,
    action: function(match) {
      this.yytext = parseInt(match[0], 10);
      return 'NUMBER';
    },
  },
  {
    pattern: /stream(\r\n|\n)/,
    action: function(match) {
      this.pushState('STREAM');
      return 'START_STREAM';
    },
  },
  {
    condition: 'STREAM',
    pattern: 'endstream',
    action: function(match) {
      this.popState();
      return 'END_STREAM';
    },
  },
  {
    condition: 'STREAM',
    pattern: '',
    action: function(match) {
      this.yytext = this.readBuffer(this.stream_length);
      this.buffer = this.buffer.slice(this.yytext.length);
      this.stream_length = null;
      return 'STREAM_BUFFER';
    },
  },
  {
    condition: 'INPARENS',
    pattern: /\(/,
    action: function(match) {
      this.pushState('INPARENS');
      return 'CHAR';
    },
  },
  {
    condition: 'INPARENS',
    pattern: /\)/,
    action: function(match) {
      this.state_stack.pop();
      return (this.currentState() == 'INITIAL') ? 'CLOSEPARENS' : 'CHAR';
    },
  },
  {
    condition: 'INPARENS',
    pattern: /./,
    action: 'CHAR',
  },
];

interface Rule {
  pattern: RegExp;
  action: (match: RegExpMatchArray) => string;
  condition: string;
}

function standardizePattern(pattern: RegExp | string): RegExp {
  if (typeof pattern == 'object') {
    return new RegExp('^' + (<RegExp>pattern).source);
  }
  else {
    return new RegExp('^' + pattern);
  }
}

function standardizeAction(action: string | ActionFunction): ActionFunction {
  if (typeof action == 'function') {
    return <ActionFunction>action;
  }
  return function(match: RegExpMatchArray): string { return <string>action; };
}

function standardizeCondition(condition?: string): string {
  if (condition === undefined) {
    return 'INITIAL';
  }
  return condition;
}

class Machine {
  rules: Rule[];

  constructor(rule_definitions: RuleDefinition[]) {
    // convert each RuleDefinition to a standard Rule
    this.rules = rule_definitions.map(function(rule_definition) {
      return {
        pattern: standardizePattern(rule_definition.pattern),
        action: standardizeAction(rule_definition.action),
        condition: standardizeCondition(rule_definition.condition),
      };
    });
  }

  getRules(name: string): Rule[] {
    return this.rules.filter(function(rule) {
      return rule.condition == name;
    });
  }
}

var machine = new Machine(pdf_rules);

interface LexerOptions {
  ranges: boolean;
}

class PDFLexer {
  yy: any;

  yytext: any;
  yyleng: number;
  yylineno: number;
  yyloc: Location;
  yylloc: Location;

  options: LexerOptions;

  // implementation
  file_cursor: FileCursor;
  file_cursor_EOF: boolean;
  state_stack: string[];
  buffer: string;

  pushState(state: string) {
    return this.state_stack.push(state);
  }
  popState(): string {
    return this.state_stack.pop();
  }
  currentState(): string {
    return this.state_stack[this.state_stack.length - 1];
  }

  setInput(file_cursor: FileCursor, yy: any): void {
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

    this.options = {ranges: false};

    // initialize
    this.file_cursor = file_cursor;
    this.file_cursor_EOF = false;
    this.state_stack = ['INITIAL'];
    this.buffer = '';
  }

  lex(): string {
    var token: string = null;
    // parse until we get a non-null token
    while (token === null) {
      token = this.next()
    }
    return token;
  }

  readBuffer(length: number): Buffer {
    if (length > this.buffer.length) {
      var new_buffer = this.file_cursor.readBuffer(length - this.buffer.length);
      return Buffer.concat([new Buffer(this.buffer), new_buffer]);
    }
    return new Buffer(this.buffer.slice(0, length));
  }

  next(): string {
    // pull in more data from the underlying file if we're running low and there's more to be had
    if (this.buffer.length < 128 && !this.file_cursor_EOF) {
      var block_buffer = this.file_cursor.readBlock();
      if (block_buffer.length < FileCursor.BLOCK_SIZE) {
        this.file_cursor_EOF = true;
      }

      this.buffer += block_buffer.toString('ascii');
    }
    // return special 'EOF' token if we are at EOF
    if (this.buffer.length == 0 && this.file_cursor_EOF) {
      return 'EOF';
    }

    var current_state = this.currentState();
    var current_rules = machine.getRules(current_state);
    for (var i = 0, rule; (rule = current_rules[i]); i++) {
      var match = this.buffer.match(rule.pattern);
      if (match) {
        this.yytext = match[0];
        this.buffer = this.buffer.slice(this.yytext.length);
        var token = rule.action.call(this, match);
        return token;
      }
    }

    throw new Error(`Invalid language; could not find a match in input: ${this.buffer.slice(0, 128)}`);
  }

}

export = PDFLexer;
