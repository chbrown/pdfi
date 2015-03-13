/// <reference path="../type_declarations/index.d.ts" />
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
// longer operators must come first
var operators_escaped = 'BMC BDC EMC BT ET BI ID EI Do MP DP BX EX RG d0 d1 CS cs SC SCN sc scn rg sh re ri gs cm w J j M d i q Q m l c v y h S s f* f F B* B b* b n W* W Tc Tw Tz TL Tf Tr Ts Td TD Tm T* Tj TJ \' " G g K k'.split(' ').map(function (operator) { return operator.replace('*', '\\*'); });
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
function noop(original_arguments) {
    var arglist = Array.prototype.slice.apply(original_arguments);
    logger.debug("[noop] " + original_arguments.callee['name'] + "(" + arglist.join(', ') + ")");
}
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
    // Text state operators (Tc, Tw, Tz, TL, Tf, Tr, Ts) - see PDF32000_2008.pdf:9.3.1
    Tc: function setCharSpacing(charSpace) {
        // > Set the character spacing, Tc, to charSpace, which shall be a number expressed in unscaled text space units. Character spacing shall be used by the Tj, TJ, and ' operators. Initial value: 0.
        this.textState.charSpacing = charSpace;
    },
    Tw: function setWordSpacing(wordSpace) {
        // > Set the word spacing, Tw, to wordSpace, which shall be a number expressed in unscaled text space units. Word spacing shall be used by the Tj, TJ, and ' operators. Initial value: 0.
        this.textState.wordSpacing = wordSpace;
    },
    Tz: function setHorizontalScale(scale) {
        // > Set the horizontal scaling, Th, to (scale ÷ 100). scale shall be a number specifying the percentage of the normal width. Initial value: 100 (normal width).
        this.textState.horizontalScaling = scale;
    },
    TL: function setLeading(leading) {
        // > Set the text leading, Tl, to leading, which shall be a number expressed in unscaled text space units. Text leading shall be used only by the T*, ', and " operators. Initial value: 0.
        this.textState.leading = leading;
    },
    Tf: function setFont(font, size) {
        // > Set the text font, Tf, to font and the text font size, Tfs, to size. font shall be the name of a font resource in the Font subdictionary of the current resource dictionary; size shall be a number representing a scale factor. There is no initial value for either font or size; they shall be specified explicitly by using Tf before any text is shown.
        this.textState.fontName = font;
        this.textState.fontSize = size;
    },
    Tr: function setRenderingMode(render) {
        // > Set the text rendering mode, Tmode, to render, which shall be an integer. Initial value: 0.
        this.textState.renderingMode = render;
    },
    Ts: function setRise(rise) {
        // > Set the text rise, Trise, to rise, which shall be a number expressed in unscaled text space units. Initial value: 0.
        this.textState.rise = rise;
    },
    // ---------------------------------------------------------------------------
    // Text positioning operators (Td, TD, Tm, T*)
    Td: function adjustCurrentPosition(x, y) {
        // > Move to the start of the next line, offset from the start of the current line by (tx, ty). tx and ty shall denote numbers expressed in unscaled text space units. More precisely, this operator shall perform these assignments: Tm = Tlm = [ [1 0 0], [0 1 0], [x y 1] ] x Tlm
        //
        // y is usually 0, and never positive in normal text.
        var base = new Matrix3([[1, 0, 0], [0, 1, 0], [x, y, 1]]);
        this.textState.textMatrix = this.textState.textLineMatrix = base.multiply(this.textState.textLineMatrix);
    },
    /**
    > Move to the start of the next line, offset from the start of the current
    > line by (x, y). As a side effect, this operator shall set the leading
    > parameter in the text state. This operator shall have the same effect as
    > this code: `-ty TL tx ty Td`
  
    COMPLETE (ALIAS)
    */
    TD: function adjustCurrentPositionWithLeading(x, y) {
        operations['TL'].call(this, -y);
        operations['Td'].call(this, x, y);
    },
    Tm: function setMatrix(a, b, c, d, e, f) {
        // > Set the text matrix, Tm, and the text line matrix, Tlm: Tm = Tlm = [ [a b 0], [c d 0], [e f 1] ]
        // > The operands shall all be numbers, and the initial value for Tm and Tlm shall be the identity matrix, [1 0 0 1 0 0]. Although the operands specify a matrix, they shall be passed to Tm as six separate numbers, not as an array.
        // > The matrix specified by the operands shall not be concatenated onto the current text matrix, but shall replace it.
        // calling setMatrix(1, 0, 0, 1, 0, 0) sets it to the identity matrix
        // e and f mark the x and y coordinates of the current position
        logger.debug("setting textState.textMatrix " + a + " " + b + " " + c + " " + d + " " + e + " " + f);
        var base = new Matrix3([[a, b, 0], [c, d, 0], [e, f, 1]]);
        this.textState.textMatrix = this.textState.textLineMatrix = base;
    },
    /**
    > Move to the start of the next line. This operator has the same effect as
    > the code `0 -Tl Td` where Tl denotes the current leading parameter in the
    > text state. The negative of Tl is used here because Tl is the text leading
    > expressed as a positive number. Going to the next line entails decreasing
    > the y coordinate.
  
    COMPLETE (ALIAS)
    */
    'T*': function moveToStartOfNextLine() {
        operations['Td'].call(this, 0, -this.textState.leading);
    },
    // Text showing operators (Tj, TJ, ', ")
    Tj: function showString(text) {
        // Show a text string.
        this.drawText(text);
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
        this.drawText(text);
    },
    /**
    > Move to the next line and show a text string. This operator shall have
    > the same effect as the code `T* string Tj`
  
    COMPLETE (ALIAS)
    */
    "'": function (text) {
        operations['T*'].call(this);
        operations['Tj'].call(this, text);
    },
    /**
    > Move to the next line and show a text string, using `wordSpace` as the
    > word spacing and `charSpace` as the character spacing (setting the
    > corresponding parameters in the text state). `wordSpace` and `charSpace`
    > shall be numbers expressed in unscaled text space units. This operator
    > shall have the same effect as this code: `wordSpace Tw charSpace Tc text '`
  
    COMPLETE (ALIAS)
    */
    '"': function (wordSpace, charSpace, text) {
        operations['Tw'].call(this, wordSpace);
        operations['Tc'].call(this, charSpace);
        operations["'"].call(this, text);
    },
    // ---------------------------------------------------------------------------
    // Text objects (BT, ET)
    BT: function startTextBlock() {
        logger.debug("BT: starting new TextBlock");
        this.startTextBlock();
    },
    ET: function endTextBlock() {
        logger.debug("ET: ending current TextBlock");
        this.endTextBlock();
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
    // ---------------------------------------------------------------------------
    // Special graphics states (q, Q, cm)
    /**
    > Save the current graphics state on the graphics state stack (see 8.4.2).
    */
    q: function pushGraphicsState() {
        logger.debug("[noop] pushGraphicsState");
        this.pushGraphicsState();
    },
    /**
    > Restore the graphics state by removing the most recently saved state from
    > the stack and making it the current state (see 8.4.2).
    */
    Q: function popGraphicsState() {
        logger.debug("popGraphicsState");
        this.popGraphicsState();
    },
    /**
    > Modify the current transformation matrix (CTM) by concatenating the
    > specified matrix. Although the operands specify a matrix, they shall be
    > written as six separate numbers, not as an array.
    */
    cm: function setCTM(a, b, c, d, e, f) {
        // TODO: should we multiple by the current one instead?
        logger.debug("setting graphicsState.ctMatrix " + a + " " + b + " " + c + " " + d + " " + e + " " + f);
        this.graphicsState.ctMatrix = new Matrix3([[a, b, 0], [c, d, 0], [e, f, 1]]);
    },
    // ---------------------------------------------------------------------------
    // XObjects (Do)
    /**
    > Paint the specified XObject. The operand name shall appear as a key in the XObject subdictionary of the current resource dictionary (see 7.8.3, "Resource Dictionaries"). The associated value shall be a stream whose Type entry, if present, is XObject. The effect of Do depends on the value of the XObject’s Subtype entry, which may be Image (see 8.9.5, "Image Dictionaries"), Form (see 8.10, "Form XObjects"), or PS (see 8.8.2, "PostScript XObjects").
    */
    Do: function drawObject(name) {
        this.drawObject(name);
    },
    // ---------------------------------------------------------------------------
    // General graphics state (w, J, j, M, d, ri, i, gs)
    /**
    > Set the line width in the graphics state (see 8.4.3.2, "Line Width").
    */
    w: function setLineWidth(lineWidth) {
        noop(arguments);
    },
    /**
    > Set the line cap style in the graphics state (see 8.4.3.3, "Line Cap Style").
    */
    J: function setLineCap(lineCap) {
        noop(arguments);
    },
    /**
    > Set the line join style in the graphics state (see 8.4.3.4, "Line Join Style").
    */
    j: function setLineJoin(lineJoin) {
        noop(arguments);
    },
    /**
    > Set the miter limit in the graphics state (see 8.4.3.5, "Miter Limit").
    */
    M: function setMiterLimit(miterLimit) {
        noop(arguments);
    },
    /**
    > Set the line dash pattern in the graphics state (see 8.4.3.6, "Line Dash Pattern").
    */
    d: function setDashPattern(dashArray, dashPhase) {
        noop(arguments);
    },
    /**
    > (PDF 1.1) Set the colour rendering intent in the graphics state (see 8.6.5.8, "Rendering Intents").
    */
    ri: function setRenderingIntent(intent) {
        noop(arguments);
    },
    /**
    > Set the flatness tolerance in the graphics state (see 10.6.2, "Flatness Tolerance").
    > flatness is a number in the range 0 to 100; a value of 0 shall specify the output device’s default flatness tolerance.
    */
    i: function setFlatnessTolerance(flatness) {
        noop(arguments);
    },
    /**
    > (PDF 1.2) Set the specified parameters in the graphics state. dictName shall be the name of a graphics state parameter dictionary in the ExtGState subdictionary of the current resource dictionary (see the next sub-clause).
    */
    gs: function setGraphicsStateParameters(dictName) {
        noop(arguments);
    },
};
var Point = (function () {
    function Point(x, y) {
        this.x = x;
        this.y = y;
    }
    Point.prototype.clone = function () {
        return new Point(this.x, this.y);
    };
    Point.prototype.set = function (x, y) {
        this.x = x;
        this.y = y;
    };
    Point.prototype.move = function (dx, dy) {
        this.x += dx;
        this.y += dy;
    };
    return Point;
})();
exports.Point = Point;
function dot(a, b) {
    if (a.length !== b.length) {
        throw new Error('Cannot compute dot product of vectors of inequal length');
    }
    var sum = 0;
    for (var i = 0, l = a.length; i < l; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}
var Matrix3 = (function () {
    function Matrix3(rows) {
        if (rows === void 0) { rows = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; }
        this.rows = rows;
    }
    Matrix3.prototype.clone = function () {
        return new Matrix3(this.rows.map(function (row) { return row.slice(); }));
    };
    // accessors
    Matrix3.prototype.row = function (index) {
        return this.rows[index];
    };
    Matrix3.prototype.col = function (index) {
        return this.rows.map(function (row) { return row[index]; });
    };
    /**
    returns a new Matrix3
    */
    Matrix3.prototype.multiply = function (right) {
        // matrices are stored as matrix[row_index][col_index]
        var product = new Matrix3();
        for (var i = 0; i < 3; i++) {
            for (var j = 0; j < 3; j++) {
                product.rows[i][j] = dot(this.row(i), right.col(j));
            }
        }
        return product;
    };
    return Matrix3;
})();
exports.Matrix3 = Matrix3;
var GraphicsState = (function () {
    function GraphicsState(ctMatrix) {
        if (ctMatrix === void 0) { ctMatrix = new Matrix3(); }
        this.ctMatrix = ctMatrix;
    }
    GraphicsState.prototype.clone = function () {
        return new GraphicsState(this.ctMatrix.clone());
    };
    return GraphicsState;
})();
exports.GraphicsState = GraphicsState;
/**
> Text object (Figure 9: Graphics Objects - 8.2)
> Allowed operators:
> • General graphics state
> • Color
> • Text state
> • Text-showing
> • Text-positioning
> • Marked-content
*/
var TextState = (function () {
    function TextState() {
        this.charSpacing = 0;
        this.wordSpacing = 0;
        this.horizontalScaling = 100;
        this.leading = 0;
        this.renderingMode = 0;
        this.rise = 0;
        this.textMatrix = new Matrix3();
        this.textLineMatrix = new Matrix3();
    }
    TextState.prototype.getPosition = function (ctMatrix) {
        var fs = this.fontSize;
        var fsh = fs * (this.horizontalScaling / 100.0);
        var rise = this.rise;
        var base = new Matrix3([[fsh, 0, 0], [0, fs, 0], [0, rise, 1]]);
        var textRenderingMatrix = base.multiply(this.textMatrix); //.multiply(ctMatrix);
        var x = textRenderingMatrix.rows[2][0];
        var y = textRenderingMatrix.rows[2][1];
        return new Point(x, y);
    };
    return TextState;
})();
exports.TextState = TextState;
var TextSpan = (function () {
    function TextSpan(position, text, size) {
        this.position = position;
        this.text = text;
        this.size = size;
    }
    return TextSpan;
})();
exports.TextSpan = TextSpan;
var TextObject = (function () {
    function TextObject(spans) {
        if (spans === void 0) { spans = []; }
        this.spans = spans;
    }
    return TextObject;
})();
exports.TextObject = TextObject;
var ReferenceObject = (function () {
    function ReferenceObject(position, name) {
        this.position = position;
        this.name = name;
    }
    return ReferenceObject;
})();
exports.ReferenceObject = ReferenceObject;
/**
The operators above will be called with an instance of Canvas
bound as `this`.
*/
var Builder = (function () {
    function Builder() {
        this.graphicsStates = [];
        this.graphicsState = new GraphicsState();
        this.textState = null;
        this.currentTextObject = null;
        this.objects = [];
    }
    Builder.prototype.getPosition = function () {
        var x = this.graphicsState.ctMatrix.rows[2][0];
        var y = this.graphicsState.ctMatrix.rows[2][1];
        return new Point(x, y);
    };
    Builder.prototype.drawText = function (text) {
        var position = this.textState.getPosition(this.graphicsState.ctMatrix);
        var span = new TextSpan(position, text, this.textState.fontSize);
        this.currentTextObject.spans.push(span);
    };
    Builder.prototype.drawObject = function (name) {
        this.objects.push(new ReferenceObject(this.getPosition(), name));
    };
    Builder.prototype.startTextBlock = function () {
        // reset state
        this.textState = new TextState();
        this.currentTextObject = new TextObject();
    };
    Builder.prototype.endTextBlock = function () {
        this.objects.push(this.currentTextObject);
        // set state and buffer to null.
        this.textState = null;
        this.currentTextObject = null;
    };
    Builder.prototype.pushGraphicsState = function () {
        this.graphicsStates.push(this.graphicsState.clone());
    };
    Builder.prototype.popGraphicsState = function () {
        this.graphicsState = this.graphicsStates.pop();
    };
    return Builder;
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
        var builder = new Builder();
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
                    logger.error("Ignoring unimplemented operator \"" + token.value + "\" [" + stack.join(', ') + "]");
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
        return builder.objects;
    };
    TextParser.prototype.parseString = function (str) {
        return this.parse(lexing.BufferIterator.fromString(str));
    };
    return TextParser;
})();
exports.TextParser = TextParser;
