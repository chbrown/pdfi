var FileCursor = require('../FileCursor');
var pdf_rules = [
    {
        pattern: /<[A-Fa-f0-9]+>/,
        action: 'HEXSTRING',
    },
    {
        pattern: 'true',
        action: function (match) {
            this.yytext = true;
            return 'BOOLEAN';
        },
    },
    {
        pattern: 'false',
        action: function (match) {
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
        action: function (match) {
            this.pushState('INPARENS');
            return 'OPENPARENS';
        },
    },
    {
        pattern: /\/[!-'*-.0-;=?-Z\\^-z|~]+/,
        action: function (match) {
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
        action: function (match) {
            this.yytext = {
                object_number: parseInt(match[1], 10),
                generation_number: parseInt(match[2], 10),
            };
            return 'REFERENCE';
        }
    },
    {
        pattern: /([0-9]+)\s+([0-9]+)\s+obj/,
        action: function (match) {
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
        action: function (match) {
            this.yytext = parseFloat(match[0]);
            return 'NUMBER';
        },
    },
    {
        pattern: /[0-9]+/,
        action: function (match) {
            this.yytext = parseInt(match[0], 10);
            return 'NUMBER';
        },
    },
    {
        pattern: /stream(\r\n|\n)/,
        action: function (match) {
            this.pushState('STREAM');
            return 'START_STREAM';
        },
    },
    {
        condition: 'STREAM',
        pattern: 'endstream',
        action: function (match) {
            this.popState();
            return 'END_STREAM';
        },
    },
    {
        condition: 'STREAM',
        pattern: '',
        action: function (match) {
            this.yytext = this.readBuffer(this.stream_length);
            this.buffer = this.buffer.slice(this.yytext.length);
            this.stream_length = null;
            return 'STREAM_BUFFER';
        },
    },
    {
        condition: 'INPARENS',
        pattern: /\(/,
        action: function (match) {
            this.pushState('INPARENS');
            return 'CHAR';
        },
    },
    {
        condition: 'INPARENS',
        pattern: /\)/,
        action: function (match) {
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
function standardizePattern(pattern) {
    if (typeof pattern == 'object') {
        return new RegExp('^' + pattern.source);
    }
    else {
        return new RegExp('^' + pattern);
    }
}
function standardizeAction(action) {
    if (typeof action == 'function') {
        return action;
    }
    return function (match) {
        return action;
    };
}
function standardizeCondition(condition) {
    if (condition === undefined) {
        return 'INITIAL';
    }
    return condition;
}
var Machine = (function () {
    function Machine(rule_definitions) {
        // convert each RuleDefinition to a standard Rule
        this.rules = rule_definitions.map(function (rule_definition) {
            return {
                pattern: standardizePattern(rule_definition.pattern),
                action: standardizeAction(rule_definition.action),
                condition: standardizeCondition(rule_definition.condition),
            };
        });
    }
    Machine.prototype.getRules = function (name) {
        return this.rules.filter(function (rule) {
            return rule.condition == name;
        });
    };
    return Machine;
})();
var machine = new Machine(pdf_rules);
var PDFLexer = (function () {
    function PDFLexer() {
    }
    PDFLexer.prototype.pushState = function (state) {
        return this.state_stack.push(state);
    };
    PDFLexer.prototype.popState = function () {
        return this.state_stack.pop();
    };
    PDFLexer.prototype.currentState = function () {
        return this.state_stack[this.state_stack.length - 1];
    };
    PDFLexer.prototype.setInput = function (file_cursor, yy) {
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
        this.options = { ranges: false };
        // initialize
        this.file_cursor = file_cursor;
        this.file_cursor_EOF = false;
        this.state_stack = ['INITIAL'];
        this.buffer = '';
    };
    PDFLexer.prototype.lex = function () {
        var token = null;
        while (token === null) {
            token = this.next();
        }
        return token;
    };
    PDFLexer.prototype.readBuffer = function (length) {
        if (length > this.buffer.length) {
            var new_buffer = this.file_cursor.readBuffer(length - this.buffer.length);
            return Buffer.concat([new Buffer(this.buffer), new_buffer]);
        }
        return new Buffer(this.buffer.slice(0, length));
    };
    PDFLexer.prototype.next = function () {
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
        throw new Error("Invalid language; could not find a match in input: " + this.buffer.slice(0, 128));
    };
    return PDFLexer;
})();
module.exports = PDFLexer;
