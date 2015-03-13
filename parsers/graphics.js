var logger = require('loge');
var lexing = require('lexing');
var Token = lexing.Token;
// Rendering mode: see PDF32000_2008.pdf:9.3.6, Table 106
var RenderingMode;
(function (RenderingMode) {
    RenderingMode[RenderingMode["Fill"] = 0] = "Fill";
    RenderingMode[RenderingMode["Stroke"] = 1] = "Stroke";
    RenderingMode[RenderingMode["FillThenStroke"] = 2] = "FillThenStroke";
    RenderingMode[RenderingMode["None"] = 3] = "None";
    RenderingMode[RenderingMode["FillClipping"] = 4] = "FillClipping";
    RenderingMode[RenderingMode["StrokeClipping"] = 5] = "StrokeClipping";
    RenderingMode[RenderingMode["FillThenStrokeClipping"] = 6] = "FillThenStrokeClipping";
    RenderingMode[RenderingMode["NoneClipping"] = 7] = "NoneClipping";
})(RenderingMode || (RenderingMode = {}));
;
/**
Table 51: "Operator categories" (PDF32000_2008.pdf:8.2)

General graphics state: w, J, j, M, d, ri, i, gs
Special graphics state: q, Q, cm
Path construction: m, l, c, v, y, h, re
Path painting: S, s, f, F, f*, B, B*, b, b*, n
Clipping paths: W, W*
Text objects: BT, ET
Text state: Tc, Tw, Tz, TL, Tf, Tr, Ts
Text positioning: Td, TD, Tm, T*
Text showing: Tj, TJ, ', "
Type 3 fonts: d0, d1
Color: CS, cs, SC, SCN, sc, scn, G, g, RG, rg, K, k
Shading patterns: sh
Inline images: BI, ID, EI
XObjects: Do
Marked content: MP, DP, BMC, BDC, EMC
Compatibility: BX, EX

The "Text state", "Text positioning", and "Text showing" operators only apply between BT and ET markers.
*/
var operations = {
    // ---------------------------------------------------------------------------
    //            Text state operators (Tc, Tw, Tz, TL, Tf, Tr, Ts)
    //                     see PDF32000_2008.pdf:9.3.1
    Tc: function setCharacterSpacing(charSpace) {
        logger.debug("[noop] setCharacterSpacing: " + charSpace);
    },
    Tw: function setWordSpacing(wordSpace) {
        logger.debug("[noop] setWordSpacing: " + wordSpace);
    },
    Tz: function setHorizontalScape(scale) {
        logger.debug("[noop] setHorizontalScape: " + scale);
    },
    TL: function setLeading(leading) {
        logger.debug("[noop] setLeading: " + leading);
    },
    Tf: function setFont(font, size) {
        logger.debug("[noop] setFont: " + font + " " + size);
    },
    Tr: function setRenderingMode(render) {
        logger.debug("[noop] setRenderingMode: " + render);
    },
    Ts: function setRise(rise) {
        logger.debug("[noop] setRise: " + rise);
    },
    // Text positioning operators (Td, TD, Tm, T*)
    Td: function adjustCurrentPosition(x, y) {
        // Move to the start of the next line, offset from the start of the current line by (tx, ty). tx and ty shall denote numbers expressed in unscaled text space units.
        // logger.debug(`[noop] adjustCurrentPosition: ${x} ${y}`);
        this.newline();
    },
    TD: function adjustCurrentPositionWithLeading(x, y) {
        logger.debug("[noop] adjustCurrentPositionWithLeading: " + x + " " + y);
    },
    Tm: function setMatrix(a, b, c, d, e, f) {
        logger.debug("[noop] setMatrix: " + a + " " + b + " " + c + " " + d + " " + e + " " + f);
    },
    'T*': function moveToStartOfNextLine() {
        // Move to the start of the next line. This operator has the same effect as the code
        // `0 -Tl Td`
        // where Tl denotes the current leading parameter in the text state. The
        // negative of Tl is used here because Tl is the text leading expressed as a
        // positive number. Going to the next line entails decreasing the y coordinate.
        var current_Tl = 0; // TODO: ???
        operations['Td'].call(this, 0, -current_Tl);
    },
    // Text showing operators (Tj, TJ, ', ")
    Tj: function showString(text) {
        // Show a text string.
        this.pushText(text);
    },
    TJ: function showStrings(array) {
        /**
        > Show one or more text strings, allowing individual glyph positioning. Each element of array shall be either a string or a number. If the element is a string, this operator shall show the string. If it is a number, the operator shall adjust the text position by that amount; that is, it shall translate the text matrix, Tm. The number shall be expressed in thousandths of a unit of text space (see 9.4.4, "Text Space Details"). This amount shall be subtracted from the current horizontal or vertical coordinate, depending on the writing mode. In the default coordinate system, a positive adjustment has the effect of moving the next glyph painted either to the left or down by the given amount. Figure 46 shows an example of the effect of passing offsets to TJ.
    
        In other words:
        - large negative numbers equate to spaces
        - small positive amounts equate to kerning hacks
    
        */
        var text = array.map(function (item) {
            var item_type = typeof item;
            if (item_type === 'string') {
                return item;
            }
            else if (item_type === 'number') {
                return (item < -100) ? ' ' : '';
            }
            else {
                throw new Error("Unknown TJ argument type: " + item_type + " (" + item + ")");
            }
        }).join('');
        this.pushText(text);
    },
    "'": function (text) {
        // Move to the next line and show a text string. This operator shall have the same effect as the code `T* string Tj`
        operations['T*'].call(this);
        operations['Tj'].call(this, text);
    },
    '"': function (wordSpace, charSpace, text) {
        // Move to the next line and show a text string, using aw as the word spacing and ac as the character spacing (setting the corresponding parameters in the text state). aw and ac shall be numbers expressed in unscaled text space units. This operator shall have the same effect as this code: `aw Tw ac Tc string '`
        operations['Tw'].call(this, wordSpace);
        operations['Tc'].call(this, charSpace);
        operations["'"].call(this, text);
    },
    // ---------------------------------------------------------------------------
    //                           Color operators
    RG: function setStrokeColor(r, g, b) {
        logger.debug("[noop] setStrokeColor: " + r + " " + g + " " + b);
    },
    rg: function setFillColor(r, g, b) {
        logger.debug("[noop] setFillColor: " + r + " " + g + " " + b);
    },
    G: function setStrokeGray(gray) {
        logger.debug("[noop] setStrokeGray: " + gray);
    },
    g: function setFillGray(gray) {
        logger.debug("[noop] setFillGray: " + gray);
    },
    // others ...
    Do: function drawObject(name) {
        this.pushName(name);
    },
};
var operators_escaped = 'w J j M d ri i gs q Q cm m l c v y h re S s f F f* B B* b b* n W W* BT ET Tc Tw Tz TL Tf Tr Ts Td TD Tm T* Tj TJ \' " d0 d1 CS cs SC SCN sc scn G g RG rg K k sh BI ID EI Do MP DP BMC BDC EMC BX EX'.split(' ').map(function (operator) { return operator.replace('*', '\\*'); });
var operator_regex = new RegExp("^(" + operators_escaped.join('|') + ")");
var default_rules = [
    [/^$/, function (match) { return Token('EOF'); }],
    [/^\s+/, function (match) { return null; }],
    [/^\(/, function (match) {
        this.states.push('STRING');
        return Token('START', 'STRING');
    }],
    [/^\[/, function (match) {
        this.states.push('ARRAY');
        return Token('START', 'ARRAY');
    }],
    [/^(BT|ET)/, function (match) { return null; }],
    [operator_regex, function (match) { return Token('OPERATOR', match[0]); }],
    [/^\/(\w+)/, function (match) { return Token('OPERAND', match[1]); }],
    [/^-?[0-9]+\.[0-9]+/, function (match) { return Token('OPERAND', parseFloat(match[0])); }],
    [/^-?[0-9]+/, function (match) { return Token('OPERAND', parseInt(match[0], 10)); }],
    [/^\S+/, function (match) { return Token('OPERAND', match[0]); }],
];
var state_rules = {};
state_rules['STRING'] = [
    [/^\)/, function (match) {
        this.states.pop();
        return Token('END', 'STRING');
    }],
    [/^\\(.)/, function (match) { return Token('CHAR', match[1]); }],
    [/^(.|\n|\r)/, function (match) { return Token('CHAR', match[0]); }],
];
state_rules['ARRAY'] = [
    [/^\]/, function (match) {
        this.states.pop();
        return Token('END', 'ARRAY');
    }],
    [/^\(/, function (match) {
        this.states.push('STRING');
        return Token('START', 'STRING');
    }],
    [/^-?\d+\.\d+/, function (match) { return Token('NUMBER', parseFloat(match[0])); }],
    [/^-?\d+/, function (match) { return Token('NUMBER', parseInt(match[0], 10)); }],
    [/^(.|\n|\r)/, function (match) { return Token('CHAR', match[0]); }],
];
/**
The text operators above will be called with an instance of DocumentBuilder
bound as `this`.
*/
var DocumentBuilder = (function () {
    function DocumentBuilder() {
        this.elements = [];
    }
    /**
    Add a new element, but return the element instead of the new length.
  
    The `pushElement<T extends DocumentElement>` version doesn't work.
    */
    // pushElement<T extends DocumentElement>(element: T): T {
    //   this.elements.push(element);
    //   return element;
    // }
    DocumentBuilder.prototype.pushSpan = function (span) {
        this.elements.push(span);
        return span;
    };
    DocumentBuilder.prototype.pushName = function (name) {
        this.elements.push({ name: name });
    };
    Object.defineProperty(DocumentBuilder.prototype, "spans", {
        get: function () {
            return this.elements.filter(function (span) { return span['text']; });
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DocumentBuilder.prototype, "current_span", {
        get: function () {
            if (this.elements.length === 0) {
                return this.pushSpan({ text: '' });
            }
            var last_element = this.elements[this.elements.length - 1];
            if (last_element['text'] !== undefined) {
                return last_element;
            }
            return this.pushSpan({ text: '' });
        },
        enumerable: true,
        configurable: true
    });
    DocumentBuilder.prototype.newline = function () {
        this.elements.push({ text: '' });
    };
    DocumentBuilder.prototype.pushText = function (text) {
        this.current_span.text += text;
    };
    DocumentBuilder.prototype.toString = function () {
        return this.spans.map(function (span) { return span.text; }).join('\n');
    };
    return DocumentBuilder;
})();
exports.DocumentBuilder = DocumentBuilder;
var TextParser = (function () {
    function TextParser() {
        this.tokenizer = new lexing.Tokenizer(default_rules, state_rules);
        // lexing.CombinerRule<any, any>[]
        this.combiner = new lexing.Combiner([
            ['STRING', function (tokens) { return Token('OPERAND', tokens.map(function (token) { return token.value; }).join('')); }],
            ['ARRAY', function (tokens) { return Token('OPERAND', tokens.map(function (token) { return token.value; })); }],
        ]);
    }
    TextParser.prototype.parse = function (iterable) {
        var token_iterator = this.tokenizer.map(iterable);
        var combined_iterator = this.combiner.map(token_iterator);
        var stack = [];
        var builder = new DocumentBuilder();
        while (1) {
            var token = combined_iterator.next();
            // console.log('%s: %j', chalk.green(token.name), token.value);
            if (token.name == 'OPERATOR') {
                var operation = operations[token.value];
                if (operation) {
                    var expected_arguments = operation.length;
                    var stack_arguments = stack.length;
                    if (expected_arguments != stack_arguments) {
                        logger.error("Operator \"" + token.value + "\" expects " + expected_arguments + " arguments, but received " + stack_arguments + ": [" + stack.join(', ') + "]");
                    }
                    operation.apply(builder, stack);
                }
                else {
                    logger.error("Unsupported operator: " + token.name + ":" + token.value);
                }
                // we've consumed everything on the stack; truncate it
                stack.length = 0;
            }
            else if (token.name == 'OPERAND') {
                stack.push(token.value);
            }
            else if (token.name == 'EOF') {
                break;
            }
            else {
                logger.warn("Unrecognized token: " + token.name + ":" + token.value);
            }
        }
        return builder;
    };
    TextParser.prototype.parseString = function (str) {
        return this.parse(lexing.BufferIterator.fromString(str));
    };
    return TextParser;
})();
exports.TextParser = TextParser;
