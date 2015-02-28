/* parser generated by jison 0.4.15 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var parser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,4],$V1=[1,5],$V2=[1,6],$V3=[1,9],$V4=[1,12],$V5=[1,17],$V6=[1,15],$V7=[1,16],$V8=[1,19],$V9=[1,18],$Va=[1,21],$Vb=[1,22],$Vc=[1,5,7,8,9,12,15,19,20,21,22,25,26,31,33,35,42],$Vd=[1,38],$Ve=[23,34],$Vf=[7,8,9,12,15,19,20,21,22,25,31,35,42],$Vg=[37,39],$Vh=[12,33],$Vi=[37,39,41];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"BODY":3,"OBJECT":4,"EOF":5,"STRING":6,"NUMBER":7,"REFERENCE":8,"BOOLEAN":9,"ARRAY":10,"DICTIONARY":11,"NAME":12,"INDIRECT_OBJECT":13,"STREAM":14,"NULL":15,"XREF":16,"TRAILER":17,"objects":18,"[":19,"]":20,"HEXSTRING":21,"OPENPARENS":22,"CLOSEPARENS":23,"chars":24,"INDIRECT_OBJECT_IDENTIFIER":25,"END_INDIRECT_OBJECT":26,"STREAM_HEADER":27,"START_STREAM":28,"STREAM_BUFFER":29,"END_STREAM":30,"<<":31,"keyvaluepairs":32,">>":33,"CHAR":34,"XREF_START":35,"XREF_SUBSECTIONS":36,"XREF_END":37,"XREF_SUBSECTION":38,"XREF_SUBSECTION_HEADER":39,"XREF_REFERENCES":40,"XREF_REFERENCE":41,"TRAILER_START":42,"TRAILER_STARTXREF":43,"TRAILER_END":44,"$accept":0,"$end":1},
terminals_: {2:"error",5:"EOF",7:"NUMBER",8:"REFERENCE",9:"BOOLEAN",12:"NAME",15:"NULL",19:"[",20:"]",21:"HEXSTRING",22:"OPENPARENS",23:"CLOSEPARENS",25:"INDIRECT_OBJECT_IDENTIFIER",26:"END_INDIRECT_OBJECT",28:"START_STREAM",29:"STREAM_BUFFER",30:"END_STREAM",31:"<<",33:">>",34:"CHAR",35:"XREF_START",37:"XREF_END",39:"XREF_SUBSECTION_HEADER",41:"XREF_REFERENCE",42:"TRAILER_START",43:"TRAILER_STARTXREF",44:"TRAILER_END"},
productions_: [0,[3,2],[3,2],[4,1],[4,1],[4,1],[4,1],[4,1],[4,1],[4,1],[4,1],[4,1],[4,1],[4,1],[4,1],[18,1],[18,2],[10,3],[10,2],[6,1],[6,2],[6,3],[13,3],[27,2],[14,3],[11,3],[32,2],[32,3],[24,1],[24,2],[16,3],[38,2],[36,1],[36,2],[40,1],[40,2],[17,5]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1: case 2:
 return $$[$0-1] 
break;
case 15: case 28: case 32: case 34:
 this.$ = [$$[$0]] 
break;
case 16: case 29: case 33: case 35:
 this.$ = $$[$0-1]; $$[$0-1].push($$[$0]) 
break;
case 17:
 this.$ = $$[$0-1]; 
break;
case 18:
 this.$ = []; 
break;
case 20:
 this.$ = "" 
break;
case 21:
 this.$ = $$[$0-1].join("") 
break;
case 22:

        this.$ = {
          object_number: $$[$0-2].object_number,
          generation_number: $$[$0-2].generation_number,
          value: $$[$0-1],
        }
      
break;
case 23:

        // pretty ugly hack right here
        // yy is the Jison sharedState
        // yy.lexer is the JisonLexer-extends-BufferedLexer instance
        // yy.pdf_reader is the original pdf_reader instance
        yy.lexer.stream_length = yy.pdf_reader.resolveObject($$[$0-1].Length);
      
break;
case 24:

        this.$ = { dictionary: $$[$0-2], buffer: $$[$0-1] }
      
break;
case 25:
 this.$ = $$[$0-1] 
break;
case 26:
 this.$ = {}; this.$[$$[$0-1]] = $$[$0]; 
break;
case 27:
 this.$ = $$[$0-2]; $$[$0-2][$$[$0-1]] = $$[$0]; 
break;
case 30:

        // produce single array
        this.$ = Array.prototype.concat.apply([], $$[$0-1]);
      
break;
case 31:

        this.$ = $$[$0];
        for (var i = 0; i < this.$.length; i++) {
          this.$[i].object_number = $$[$0-1] + i;
        }
      
break;
case 36:

        this.$ = $$[$0-3];
        this.$.startxref = $$[$0-1];
      
break;
}
},
table: [{3:1,4:2,6:3,7:$V0,8:$V1,9:$V2,10:7,11:8,12:$V3,13:10,14:11,15:$V4,16:13,17:14,19:$V5,21:$V6,22:$V7,25:$V8,27:20,31:$V9,35:$Va,42:$Vb},{1:[3]},{4:24,5:[1,23],6:3,7:$V0,8:$V1,9:$V2,10:7,11:8,12:$V3,13:10,14:11,15:$V4,16:13,17:14,19:$V5,21:$V6,22:$V7,25:$V8,27:20,31:$V9,35:$Va,42:$Vb},o($Vc,[2,3]),o($Vc,[2,4]),o($Vc,[2,5]),o($Vc,[2,6]),o($Vc,[2,7]),o($Vc,[2,8],{28:[1,25]}),o($Vc,[2,9]),o($Vc,[2,10]),o($Vc,[2,11]),o($Vc,[2,12]),o($Vc,[2,13]),o($Vc,[2,14]),o($Vc,[2,19]),{23:[1,26],24:27,34:[1,28]},{4:31,6:3,7:$V0,8:$V1,9:$V2,10:7,11:8,12:$V3,13:10,14:11,15:$V4,16:13,17:14,18:29,19:$V5,20:[1,30],21:$V6,22:$V7,25:$V8,27:20,31:$V9,35:$Va,42:$Vb},{12:[1,33],32:32},{4:34,6:3,7:$V0,8:$V1,9:$V2,10:7,11:8,12:$V3,13:10,14:11,15:$V4,16:13,17:14,19:$V5,21:$V6,22:$V7,25:$V8,27:20,31:$V9,35:$Va,42:$Vb},{29:[1,35]},{36:36,38:37,39:$Vd},{11:39,31:$V9},{1:[2,1]},{1:[2,2]},{29:[2,23]},o($Vc,[2,20]),{23:[1,40],34:[1,41]},o($Ve,[2,28]),{4:43,6:3,7:$V0,8:$V1,9:$V2,10:7,11:8,12:$V3,13:10,14:11,15:$V4,16:13,17:14,19:$V5,20:[1,42],21:$V6,22:$V7,25:$V8,27:20,31:$V9,35:$Va,42:$Vb},o($Vc,[2,18]),o($Vf,[2,15]),{12:[1,45],33:[1,44]},{4:46,6:3,7:$V0,8:$V1,9:$V2,10:7,11:8,12:$V3,13:10,14:11,15:$V4,16:13,17:14,19:$V5,21:$V6,22:$V7,25:$V8,27:20,31:$V9,35:$Va,42:$Vb},{26:[1,47]},{30:[1,48]},{37:[1,49],38:50,39:$Vd},o($Vg,[2,32]),{40:51,41:[1,52]},{43:[1,53]},o($Vc,[2,21]),o($Ve,[2,29]),o($Vc,[2,17]),o($Vf,[2,16]),o([1,5,7,8,9,12,15,19,20,21,22,25,26,28,31,33,35,42,43],[2,25]),{4:54,6:3,7:$V0,8:$V1,9:$V2,10:7,11:8,12:$V3,13:10,14:11,15:$V4,16:13,17:14,19:$V5,21:$V6,22:$V7,25:$V8,27:20,31:$V9,35:$Va,42:$Vb},o($Vh,[2,26]),o($Vc,[2,22]),o($Vc,[2,24]),o($Vc,[2,30]),o($Vg,[2,33]),o($Vg,[2,31],{41:[1,55]}),o($Vi,[2,34]),{7:[1,56]},o($Vh,[2,27]),o($Vi,[2,35]),{44:[1,57]},o($Vc,[2,36])],
defaultActions: {23:[2,1],24:[2,2],25:[2,23]},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        throw new Error(str);
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        function lex() {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};

function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}