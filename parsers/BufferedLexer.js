var Stack = (function () {
    function Stack(items) {
        if (items === void 0) { items = []; }
        this.items = items;
    }
    Stack.prototype.push = function (item) {
        return this.items.push(item);
    };
    Stack.prototype.pop = function () {
        return this.items.pop();
    };
    Object.defineProperty(Stack.prototype, "top", {
        get: function () {
            return this.items[this.items.length - 1];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Stack.prototype, "size", {
        get: function () {
            return this.items.length;
        },
        enumerable: true,
        configurable: true
    });
    Stack.prototype.toString = function () {
        return this.items[this.items.length - 1];
    };
    return Stack;
})();
var BufferedLexer = (function () {
    function BufferedLexer(rules, reader) {
        this.rules = rules;
        this.reader = reader;
        this.reset();
    }
    /**
    Reset the Lexer back to its initial state.
    */
    BufferedLexer.prototype.reset = function () {
        this.states = new Stack(['INITIAL']);
    };
    /**
    Returns the next available pair from the input reader (usually [token, data]).
  
    If the matching rule's action returns null, this will return null.
    */
    BufferedLexer.prototype.read = function () {
        // TODO: abstract out the peekBuffer + toString, back into the reader?
        //   optimize string conversion
        var input = this.reader.peekBuffer(256).toString('ascii');
        var current_state = this.states.top;
        for (var i = 0, rule; (rule = this.rules[i]); i++) {
            if (rule.condition === current_state) {
                var match = input.match(rule.pattern);
                if (match) {
                    // var newline_matches = match[0].match(/(\r\n|\n|\r)/g);
                    // var newlines = newline_matches ? newline_matches.length : 0;
                    this.reader.skip(match[0].length);
                    return rule.action.call(this, match);
                }
            }
        }
        throw new Error("Invalid language; could not find a match in input: \"" + input + "\"");
    };
    /**
    Returns the next available non-null token / symbol output from the input
    reader (usually a token_data: [string, any] tuple).
  
    This will never return null.
    */
    BufferedLexer.prototype.next = function () {
        var result;
        do {
            result = this.read();
        } while (result === null);
        return result;
    };
    return BufferedLexer;
})();
module.exports = BufferedLexer;
