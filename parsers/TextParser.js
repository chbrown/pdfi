/// <reference path="../type_declarations/index.d.ts" />
var _ = require('lodash');
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
These operators only apply between BT and ET markers.
*/
// See PDF32000_2008.pdf:8.2, Table 51 "Operator categories"
var text_operators = {
    // Text state operators (Tc, Tw, Tz, TL, Tf, Tr, Ts)
    // see PDF32000_2008.pdf:9.3.1
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
        logger.debug("[noop] adjustCurrentPosition: " + x + " " + y);
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
        this.breakLine();
    },
    // Text showing operators (Tj, TJ, ', ")
    Tj: function showString(text) {
        // Show a text string.
        this.addText(text);
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
        this.addText(text);
    },
    "'": function (text) {
        // Move to the next line and show a text string. This operator shall have the same effect as the code `T* string Tj`
        this['T*']();
        this['Tj'](text);
    },
    '"': function (wordSpace, charSpace, text) {
        // Move to the next line and show a text string, using aw as the word spacing and ac as the character spacing (setting the corresponding parameters in the text state). aw and ac shall be numbers expressed in unscaled text space units. This operator shall have the same effect as this code: `aw Tw ac Tc string '`
        this['Tw'](wordSpace);
        this['Tc'](charSpace);
        this["'"](text);
    },
};
var color_operators = {
    // Color operators:
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
};
var operators = _.extend({}, color_operators, text_operators);
var text_operator_keys_escaped = Object.keys(text_operators).map(function (key) { return key.replace('*', '\\*'); });
var text_operator_regex = new RegExp("^(" + text_operator_keys_escaped.join('|') + ")");
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
    [text_operator_regex, function (match) { return Token('OPERATOR', match[0]); }],
    [/^(RG|rg|G|g)/, function (match) { return Token('OPERATOR', match[0]); }],
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
var SpanBuilder = (function () {
    function SpanBuilder() {
        this.spans = [];
    }
    Object.defineProperty(SpanBuilder.prototype, "current_span", {
        get: function () {
            if (this.spans.length === 0) {
                this.spans.push({ text: '' });
            }
            return this.spans[this.spans.length - 1];
        },
        enumerable: true,
        configurable: true
    });
    SpanBuilder.prototype.breakLine = function () {
        this.spans.push({ text: '' });
    };
    SpanBuilder.prototype.addText = function (text) {
        this.current_span.text += text;
    };
    SpanBuilder.prototype.toString = function () {
        return this.spans.map(function (span) { return span.text; }).join('\n');
    };
    return SpanBuilder;
})();
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
        var builder = new SpanBuilder();
        while (1) {
            var token = combined_iterator.next();
            // console.log('%s: %j', chalk.green(token.name), token.value);
            if (token.name == 'OPERATOR') {
                var operator = operators[token.value];
                if (operator) {
                    var expected_arguments = operator.length;
                    var stack_arguments = stack.length;
                    if (expected_arguments != stack_arguments) {
                        logger.error("Operator \"" + token.value + "\" expects " + expected_arguments + " arguments, but received " + stack_arguments + ": [" + stack.join(', ') + "]");
                    }
                    operator.apply(builder, stack);
                    // we've consumed everything on the stack; truncate it
                    stack.length = 0;
                }
                else {
                    throw new Error("Unsupported operator: " + token.value);
                }
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
        // logger.info(builder.toString());
        return builder.spans;
    };
    TextParser.prototype.parseString = function (str) {
        return this.parse(lexing.BufferIterator.fromString(str));
    };
    return TextParser;
})();
module.exports = TextParser;
