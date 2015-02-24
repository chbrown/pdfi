var Machine = (function () {
    function Machine(rules) {
        // fix each Rule to a standard Rule
        this.rules = rules.map(function (rule) {
            rule.pattern = new RegExp('^' + rule.pattern.source);
            return rule;
        });
    }
    Machine.prototype.getRules = function (name) {
        return this.rules.filter(function (rule) {
            return rule.condition == name;
        });
    };
    return Machine;
})();
var BufferedLexer = (function () {
    function BufferedLexer(rules, options) {
        if (options === void 0) { options = { ranges: false }; }
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
    BufferedLexer.prototype.pushState = function (state) {
        return this.state_stack.push(state);
    };
    BufferedLexer.prototype.popState = function () {
        return this.state_stack.pop();
    };
    BufferedLexer.prototype.currentState = function () {
        return this.state_stack[this.state_stack.length - 1];
    };
    BufferedLexer.prototype.setInput = function (reader, yy) {
        this.yy = yy;
        this.reader = reader;
        // this.file_cursor_EOF = false;
    };
    BufferedLexer.prototype.lex = function () {
        var token = null;
        while (token === null) {
            token = this.next();
        }
        return token;
    };
    BufferedLexer.prototype.next = function () {
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
        throw new Error("Invalid language; could not find a match in input: \"" + input + "\"");
    };
    return BufferedLexer;
})();
module.exports = BufferedLexer;
