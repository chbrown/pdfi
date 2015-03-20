var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/// <reference path="../type_declarations/index.d.ts" />
var logger = require('loge');
var lexing = require('lexing');
var StackOperationParser = require('./StackOperationParser');
// Rendering mode: see PDF32000_2008.pdf:9.3.6, Table 106
(function (RenderingMode) {
    RenderingMode[RenderingMode["Fill"] = 0] = "Fill";
    RenderingMode[RenderingMode["Stroke"] = 1] = "Stroke";
    RenderingMode[RenderingMode["FillThenStroke"] = 2] = "FillThenStroke";
    RenderingMode[RenderingMode["None"] = 3] = "None";
    RenderingMode[RenderingMode["FillClipping"] = 4] = "FillClipping";
    RenderingMode[RenderingMode["StrokeClipping"] = 5] = "StrokeClipping";
    RenderingMode[RenderingMode["FillThenStrokeClipping"] = 6] = "FillThenStrokeClipping";
    RenderingMode[RenderingMode["NoneClipping"] = 7] = "NoneClipping";
})(exports.RenderingMode || (exports.RenderingMode = {}));
var RenderingMode = exports.RenderingMode;
// Line Cap Style: see PDF32000_2008.pdf:8.4.3.3, Table 54
(function (LineCapStyle) {
    LineCapStyle[LineCapStyle["Butt"] = 0] = "Butt";
    LineCapStyle[LineCapStyle["Round"] = 1] = "Round";
    LineCapStyle[LineCapStyle["ProjectingSquare"] = 2] = "ProjectingSquare";
})(exports.LineCapStyle || (exports.LineCapStyle = {}));
var LineCapStyle = exports.LineCapStyle;
// Line Join Style: see PDF32000_2008.pdf:8.4.3.4, Table 55
(function (LineJoinStyle) {
    LineJoinStyle[LineJoinStyle["Miter"] = 0] = "Miter";
    LineJoinStyle[LineJoinStyle["Round"] = 1] = "Round";
    LineJoinStyle[LineJoinStyle["Bevel"] = 2] = "Bevel";
})(exports.LineJoinStyle || (exports.LineJoinStyle = {}));
var LineJoinStyle = exports.LineJoinStyle;
var operator_aliases = {
    // General graphics state
    'w': 'setLineWidth',
    'J': 'setLineCap',
    'j': 'setLineJoin',
    'M': 'setMiterLimit',
    'd': 'setDashPattern',
    'ri': 'setRenderingIntent',
    'i': 'setFlatnessTolerance',
    'gs': 'setGraphicsStateParameters',
    // Special graphics state
    'q': 'pushGraphicsState',
    'Q': 'popGraphicsState',
    'cm': 'setCTM',
    // Path construction
    'm': 'moveTo',
    'l': 'appendLine',
    'c': 'appendCurve123',
    'v': 'appendCurve23',
    'y': 'appendCurve13',
    'h': 'closePath',
    're': 'appendRectangle',
    // Path painting
    'S': 'stroke',
    's': 'closeAndStroke',
    'f': 'fill',
    'F': 'fillCompat',
    'f*': 'fillEvenOdd',
    'B': 'fillThenStroke',
    'B*': 'fillThenStrokeEvenOdd',
    'b': 'closeAndFillThenStroke',
    'b*': 'closeAndFillThenStrokeEvenOdd',
    'n': 'closePathNoop',
    // Clipping paths
    'W': 'clip',
    'W*': 'clipEvenOdd',
    // Text objects
    'BT': 'startTextBlock',
    'ET': 'endTextBlock',
    // Text state
    'Tc': 'setCharSpacing',
    'Tw': 'setWordSpacing',
    'Tz': 'setHorizontalScale',
    'TL': 'setLeading',
    'Tf': 'setFont',
    'Tr': 'setRenderingMode',
    'Ts': 'setRise',
    // Text positioning
    'Td': 'adjustCurrentPosition',
    'TD': 'adjustCurrentPositionWithLeading',
    'Tm': 'setTextMatrix',
    'T*': 'newLine',
    // Text showing
    'Tj': 'showString',
    'TJ': 'showStrings',
    "'": 'newLineAndShowString',
    '"': 'newLineAndShowStringWithSpacing',
    // Type 3 fonts
    // incomplete: d0, d1
    // Color
    'CS': 'setStrokeColorSpace',
    'cs': 'setFillColorSpace',
    'SC': 'setStrokeColorSpace2',
    'SCN': 'setStrokeColorSpace3',
    'sc': 'setFillColorSpace2',
    'scn': 'setFillColorSpace3',
    'G': 'setStrokeGray',
    'g': 'setFillGray',
    'RG': 'setStrokeColor',
    'rg': 'setFillColor',
    'K': 'setStrokeCMYK',
    'k': 'setFillCMYK',
    // Shading patterns
    'sh': 'shadingPattern',
    // Inline images
    // incomplete: BI, ID, EI
    // XObjects
    'Do': 'drawObject',
};
var Color = (function () {
    function Color() {
    }
    Color.prototype.clone = function () {
        return new Color();
    };
    Color.prototype.toString = function () {
        return 'none';
    };
    return Color;
})();
exports.Color = Color;
var RGBColor = (function (_super) {
    __extends(RGBColor, _super);
    function RGBColor(r, g, b) {
        _super.call(this);
        this.r = r;
        this.g = g;
        this.b = b;
    }
    RGBColor.prototype.clone = function () {
        return new RGBColor(this.r, this.g, this.b);
    };
    RGBColor.prototype.toString = function () {
        return "rgb(" + this.r + ", " + this.g + ", " + this.b + ")";
    };
    return RGBColor;
})(Color);
exports.RGBColor = RGBColor;
var GrayColor = (function (_super) {
    __extends(GrayColor, _super);
    function GrayColor(alpha) {
        _super.call(this);
        this.alpha = alpha;
    }
    GrayColor.prototype.clone = function () {
        return new GrayColor(this.alpha);
    };
    GrayColor.prototype.toString = function () {
        return "rgb(" + this.alpha + ", " + this.alpha + ", " + this.alpha + ")";
    };
    return GrayColor;
})(Color);
exports.GrayColor = GrayColor;
var CMYKColor = (function (_super) {
    __extends(CMYKColor, _super);
    function CMYKColor(c, m, y, k) {
        _super.call(this);
        this.c = c;
        this.m = m;
        this.y = y;
        this.k = k;
    }
    CMYKColor.prototype.clone = function () {
        return new CMYKColor(this.c, this.m, this.y, this.k);
    };
    CMYKColor.prototype.toString = function () {
        return "cmyk(" + this.c + ", " + this.m + ", " + this.y + ", " + this.k + ")";
    };
    return CMYKColor;
})(Color);
exports.CMYKColor = CMYKColor;
/**
> Because a transformation matrix has only six elements that can be changed, in most cases in PDF it shall be specified as the six-element array [a b c d e f].

                 ⎡ a b 0 ⎤
[a b c d e f] => ⎢ c d 0 ⎥
                 ⎣ e f 1 ⎦

*/
/**
returns a new 3x3 matrix representation

See 8.3.4 for a shortcut for avoiding full matrix multiplications.
*/
function mat3mul(A, B) {
    return [
        (A[0] * B[0]) + (A[1] * B[3]) + (A[2] * B[6]),
        (A[0] * B[1]) + (A[1] * B[4]) + (A[2] * B[7]),
        (A[0] * B[2]) + (A[1] * B[5]) + (A[2] * B[8]),
        (A[3] * B[0]) + (A[4] * B[3]) + (A[5] * B[6]),
        (A[3] * B[1]) + (A[4] * B[4]) + (A[5] * B[7]),
        (A[3] * B[2]) + (A[4] * B[5]) + (A[5] * B[8]),
        (A[6] * B[0]) + (A[7] * B[3]) + (A[8] * B[6]),
        (A[6] * B[1]) + (A[7] * B[4]) + (A[8] * B[7]),
        (A[6] * B[2]) + (A[7] * B[5]) + (A[8] * B[8])
    ];
}
function mat3add(A, B) {
    return [
        A[0] + B[0],
        A[1] + B[1],
        A[2] + B[2],
        A[3] + B[3],
        A[4] + B[4],
        A[5] + B[5],
        A[6] + B[6],
        A[7] + B[7],
        A[8] + B[8]
    ];
}
var mat3ident = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function transform2d(point, a, c, b, d, tx, ty) {
    if (tx === void 0) { tx = 0; }
    if (ty === void 0) { ty = 0; }
    return [(a * point[0]) + (b * point[1]) + tx, (c * point[0]) + (d * point[1]) + ty];
}
function countSpaces(text) {
    var matches = text.match(/ /g);
    return matches ? matches.length : 0;
}
function clone(source, target) {
    if (target === void 0) { target = {}; }
    for (var key in source) {
        if (source.hasOwnProperty(key)) {
            if (source[key] === null || source[key] === undefined) {
                target[key] = source[key];
            }
            else if (source[key].clone) {
                target[key] = source[key].clone();
            }
            else if (Array.isArray(source[key])) {
                target[key] = source[key].slice();
            }
            else {
                target[key] = source[key];
            }
        }
    }
    return target;
}
/**
We need to be able to clone it since we need a copy when we process a
`pushGraphicsState` (`q`) command, and it'd be easier to clone if the variables
were in the constructor, but there are a lot of variables!
*/
var GraphicsState = (function () {
    function GraphicsState() {
        this.ctMatrix = mat3ident; // defaults to the identity matrix
        this.strokeColor = new Color();
        this.fillColor = new Color();
    }
    GraphicsState.prototype.clone = function () {
        return clone(this, new GraphicsState());
    };
    return GraphicsState;
})();
var TextState = (function () {
    function TextState() {
        this.charSpacing = 0;
        this.wordSpacing = 0;
        this.horizontalScaling = 100;
        this.leading = 0;
        this.renderingMode = 0;
        this.rise = 0;
    }
    return TextState;
})();
var DrawingContext = (function () {
    function DrawingContext(Resources, graphicsState, depth) {
        if (graphicsState === void 0) { graphicsState = new GraphicsState(); }
        if (depth === void 0) { depth = 0; }
        this.Resources = Resources;
        this.graphicsState = graphicsState;
        this.depth = depth;
        this.stateStack = [];
        // the textState persists across BT and ET markers, and can be modified anywhere
        this.textState = new TextState();
    }
    DrawingContext.prototype.render = function (string_iterable, canvas) {
        this.canvas = canvas;
        var stack_operation_iterator = new StackOperationParser().map(string_iterable);
        while (1) {
            var token = stack_operation_iterator.next();
            // token.name: operator name; token.value: Array of operands
            if (token.name === 'EOF') {
                break;
            }
            var operator_alias = operator_aliases[token.name];
            var operation = this[operator_alias];
            if (operation) {
                operation.apply(this, token.value);
            }
            else {
                logger.warn("Ignoring unimplemented operator \"" + token.name + "\" [" + token.value.join(', ') + "]");
            }
        }
    };
    DrawingContext.prototype.advanceTextMatrix = function (width_units, chars, spaces) {
        // width_units is positive, but we want to move forward, so tx should be positive too
        var tx = (((width_units / 1000) * this.textState.fontSize) + (this.textState.charSpacing * chars) + (this.textState.wordSpacing * spaces)) * (this.textState.horizontalScaling / 100.0);
        this.textMatrix = mat3mul([1, 0, 0, 0, 1, 0, tx, 0, 1], this.textMatrix);
    };
    DrawingContext.prototype.getTextPosition = function () {
        var fs = this.textState.fontSize;
        var fsh = fs * (this.textState.horizontalScaling / 100.0);
        var rise = this.textState.rise;
        var base = [fsh, 0, 0, 0, fs, 0, 0, rise, 1];
        // TODO: optimize this final matrix multiplication; we only need two of the
        // entries, and we discard the rest, so we don't need to calculate them in
        // the first place.
        var composedTransformation = mat3mul(this.textMatrix, this.graphicsState.ctMatrix);
        var textRenderingMatrix = mat3mul(base, composedTransformation);
        return [textRenderingMatrix[6], textRenderingMatrix[7]];
    };
    DrawingContext.prototype.getTextSize = function () {
        // only scale / skew the size of the font; ignore the position of the textMatrix / ctMatrix
        var mat = mat3mul(this.textMatrix, this.graphicsState.ctMatrix);
        var font_point = transform2d([0, this.textState.fontSize], mat[0], mat[3], mat[1], mat[4]);
        return font_point[1];
    };
    DrawingContext.prototype._renderTextString = function (charCodes) {
        var font = this.Resources.getFont(this.textState.fontName);
        var position = this.getTextPosition();
        var fontSize = this.getTextSize();
        var text = font.decodeString(charCodes);
        var width_units = font.measureString(charCodes);
        var nspaces = countSpaces(text);
        this.advanceTextMatrix(width_units, text.length, nspaces);
        this.canvas.addSpan(text, position[0], position[1], width_units, this.textState.fontName, fontSize);
    };
    DrawingContext.prototype._renderTextArray = function (array, min_space_width) {
        if (min_space_width === void 0) { min_space_width = -100; }
        var font = this.Resources.getFont(this.textState.fontName);
        if (font === null) {
            throw new Error("Cannot find font \"" + this.textState.fontName + "\" in Resources");
        }
        var position = this.getTextPosition();
        var fontSize = this.getTextSize();
        // the Font instance handles most of the character code resolution
        var width_units = 0;
        var nchars = 0;
        var nspaces = 0;
        var text_parts = [];
        array.forEach(function (item) {
            // each item is either a string (character code array) or a number
            if (Array.isArray(item)) {
                // if it's a character array, convert it to a unicode string and return it
                var charCodes = item;
                var string = font.decodeString(charCodes);
                width_units += font.measureString(charCodes);
                nchars += string.length;
                nspaces += countSpaces(string);
                text_parts.push(string);
            }
            else if (typeof item === 'number') {
                // negative numbers indicate forward (rightward) movement.
                // if it's a very negative number, insert a space. otherwise, it only
                // signifies some minute spacing.
                width_units -= item;
                if (item < min_space_width) {
                    text_parts.push(' ');
                }
            }
            else {
                throw new Error("Unknown TJ argument type: \"" + item + "\" (array: " + JSON.stringify(array) + ")");
            }
        });
        var text = text_parts.join('');
        // logger.debug(`Adding span "${text}" where graphicsState = ${this.graphicsState.ctMatrix}`);
        // adjust the text matrix accordingly (but not the text line matrix)
        // see the `... TJ` documentation, as well as PDF32000_2008.pdf:9.4.4
        this.advanceTextMatrix(width_units, nchars, nspaces);
        this.canvas.addSpan(text, position[0], position[1], width_units, this.textState.fontName, fontSize);
    };
    /**
    When the Do operator is applied to a form XObject, a conforming reader shall perform the following tasks:
    a) Saves the current graphics state, as if by invoking the q operator
    b) Concatenates the matrix from the form dictionary’s Matrix entry with the current transformation matrix (CTM)
    c) Clips according to the form dictionary’s BBox entry
    d) Paints the graphics objects specified in the form’s content stream
    e) Restores the saved graphics state, as if by invoking the Q operator
    Except as described above, the initial graphics state for the form shall be inherited from the graphics state that is in effect at the time Do is invoked.
    */
    DrawingContext.prototype._drawObject = function (name) {
        // create a nested drawing context and use that
        var XObjectStream = this.Resources.getXObject(name);
        if (XObjectStream === undefined) {
            throw new Error("Cannot draw undefined XObject: " + name);
        }
        if (this.depth > 3) {
            logger.warn("Ignoring \"" + name + " Do\" command (embedded XObject is too deep; depth = " + (this.depth + 1) + ")");
        }
        else if (XObjectStream.Subtype == 'Form') {
            logger.debug("Drawing XObject: " + name);
            // a) push state
            this.pushGraphicsState();
            // b) concatenate the dictionary.Matrix
            if (XObjectStream.dictionary.Matrix) {
                this.setCTM.apply(this, XObjectStream.dictionary.Matrix);
            }
            // c) clip according to the dictionary.BBox value: meh
            // d) paint the XObject's content stream
            var stream_string = XObjectStream.buffer.toString('binary');
            var stream_string_iterable = new lexing.StringIterator(stream_string);
            var context = new DrawingContext(XObjectStream.Resources, this.graphicsState, this.depth + 1); // new GraphicsState()
            context.render(stream_string_iterable, this.canvas);
            // e) pop the graphics state
            this.popGraphicsState();
        }
        else {
            logger.warn("Ignoring \"" + name + " Do\" command (embedded XObject has Subtype \"" + XObjectStream.Subtype + "\")");
        }
    };
    // ---------------------------------------------------------------------------
    // Special graphics states (q, Q, cm)
    /**
    > `q`: Save the current graphics state on the graphics state stack (see 8.4.2).
    */
    DrawingContext.prototype.pushGraphicsState = function () {
        this.stateStack.push(this.graphicsState.clone());
    };
    /**
    > `Q`: Restore the graphics state by removing the most recently saved state
    > from the stack and making it the current state (see 8.4.2).
    */
    DrawingContext.prototype.popGraphicsState = function () {
        this.graphicsState = this.stateStack.pop();
    };
    /**
    > `a b c d e f cm`: Modify the current transformation matrix (CTM) by
    > concatenating the specified matrix. Although the operands specify a matrix,
    > they shall be written as six separate numbers, not as an array.
  
    > Translations shall be specified as [1 0 0 1 tx ty], where tx and ty shall be the distances to translate the origin of the coordinate system in the horizontal and vertical dimensions, respectively.
    > * Scaling shall be obtained by [sx 0 0 sy 0 0]. This scales the coordinates so that 1 unit in the horizontal and vertical dimensions of the new coordinate system is the same size as sx and sy units, respectively, in the previous coordinate system.
    > * Rotations shall be produced by [cos q sin q -sin q cos q 0 0], which has the effect of rotating the coordinate system axes by an angle q counter clockwise.
    > * Skew shall be specified by [1 tan a tan b 1 0 0], which skews the xaxis by an angle a and the y axis by an angle b.
  
    Also see http://en.wikipedia.org/wiki/Linear_map#Examples_of_linear_transformation_matrices
  
    Should we multiply by the current one instead? Yes. That's what they mean by
    concatenating, apparently. Weird stuff happens if you replace.
    */
    DrawingContext.prototype.setCTM = function (a, b, c, d, e, f) {
        var newCTMatrix = mat3mul([a, b, 0, c, d, 0, e, f, 1], this.graphicsState.ctMatrix);
        // logger.info('ctMatrix = %j', newCTMatrix);
        this.graphicsState.ctMatrix = newCTMatrix;
    };
    // ---------------------------------------------------------------------------
    // XObjects (Do)
    /**
    > `name Do`: Paint the specified XObject. The operand name shall appear as a
    > key in the XObject subdictionary of the current resource dictionary. The
    > associated value shall be a stream whose Type entry, if present, is XObject.
    > The effect of Do depends on the value of the XObject's Subtype entry, which
    > may be Image, Form, or PS.
    */
    DrawingContext.prototype.drawObject = function (name) {
        this._drawObject(name);
    };
    // ---------------------------------------------------------------------------
    // General graphics state (w, J, j, M, d, ri, i, gs)
    /**
    > `lineWidth w`: Set the line width in the graphics state.
    */
    DrawingContext.prototype.setLineWidth = function (lineWidth) {
        this.graphicsState.lineWidth = lineWidth;
    };
    /**
    > `lineCap J`: Set the line cap style in the graphics state.
    */
    DrawingContext.prototype.setLineCap = function (lineCap) {
        this.graphicsState.lineCap = lineCap;
    };
    /**
    > `lineJoin j`: Set the line join style in the graphics state.
    */
    DrawingContext.prototype.setLineJoin = function (lineJoin) {
        this.graphicsState.lineJoin = lineJoin;
    };
    /**
    > `miterLimit M`: Set the miter limit in the graphics state.
    */
    DrawingContext.prototype.setMiterLimit = function (miterLimit) {
        this.graphicsState.miterLimit = miterLimit;
    };
    /**
    > `dashArray dashPhase d`: Set the line dash pattern in the graphics state.
    */
    DrawingContext.prototype.setDashPattern = function (dashArray, dashPhase) {
        this.graphicsState.dashArray = dashArray;
        this.graphicsState.dashPhase = dashPhase;
    };
    /**
    > `intent ri`: Set the colour rendering intent in the graphics state.
    > (PDF 1.1)
    */
    DrawingContext.prototype.setRenderingIntent = function (intent) {
        this.graphicsState.renderingIntent = intent;
    };
    /**
    > `flatness i`: Set the flatness tolerance in the graphics state. flatness is
    > a number in the range 0 to 100; a value of 0 shall specify the output
    > device's default flatness tolerance.
    */
    DrawingContext.prototype.setFlatnessTolerance = function (flatness) {
        this.graphicsState.flatnessTolerance = flatness;
    };
    /**
    > `dictName gs`: Set the specified parameters in the graphics state.
    > `dictName` shall be the name of a graphics state parameter dictionary in
    > the ExtGState subdictionary of the current resource dictionary (see the
    > next sub-clause). (PDF 1.2)
    */
    DrawingContext.prototype.setGraphicsStateParameters = function (dictName) {
        logger.warn("Ignoring setGraphicsStateParameters(" + dictName + ") operation");
    };
    // ---------------------------------------------------------------------------
    // Path construction (m, l, c, v, y, h, re) - see Table 59
    /**
    `x y m`
    */
    DrawingContext.prototype.moveTo = function (x, y) {
        logger.silly("Ignoring moveTo(" + x + ", " + y + ") operation");
    };
    /**
    `x y l`
    */
    DrawingContext.prototype.appendLine = function (x, y) {
        logger.silly("Ignoring appendLine(" + x + ", " + y + ") operation");
    };
    /**
    `x1 y1 x2 y2 x3 y3 c`
    */
    DrawingContext.prototype.appendCurve123 = function (x1, y1, x2, y2, x3, y3) {
        logger.silly("Ignoring appendCurve123(" + x1 + ", " + y1 + ", " + x2 + ", " + y2 + ", " + x3 + ", " + y3 + ") operation");
    };
    /**
    `x2 y2 x3 y3 v`
    */
    DrawingContext.prototype.appendCurve23 = function (x2, y2, x3, y3) {
        logger.silly("Ignoring appendCurve23(" + x2 + ", " + y2 + ", " + x3 + ", " + y3 + ") operation");
    };
    /**
    `x1 y1 x3 y3 y`
    */
    DrawingContext.prototype.appendCurve13 = function (x1, y1, x3, y3) {
        logger.silly("Ignoring appendCurve13(" + x1 + ", " + y1 + ", " + x3 + ", " + y3 + ") operation");
    };
    /**
    `h`
    */
    DrawingContext.prototype.closePath = function () {
        logger.silly("Ignoring closePath() operation");
    };
    /**
    > `x y width height re`: Append a rectangle to the current path as a complete
    > subpath, with lower-left corner (x, y) and dimensions width and height in
    > user space. The operation `x y width height re` is equivalent to:
    >     x y m
    >     (x + width) y l
    >     (x + width) (y + height) l x (y + height) l
    >     h
    */
    DrawingContext.prototype.appendRectangle = function (x, y, width, height) {
        logger.silly("Ignoring appendRectangle(" + x + ", " + y + ", " + width + ", " + height + ") operation");
    };
    // ---------------------------------------------------------------------------
    // Path painting (S, s, f, F, f*, B, B*, b, b*, n) - see Table 60
    /**
    > `S`: Stroke the path.
    */
    DrawingContext.prototype.stroke = function () {
        logger.silly("Ignoring stroke() operation");
    };
    /** ALIAS
    > `s`: Close and stroke the path. This operator shall have the same effect as the sequence h S.
    */
    DrawingContext.prototype.closeAndStroke = function () {
        this.closePath();
        this.stroke();
    };
    /**
    > `f`: Fill the path, using the nonzero winding number rule to determine the region to fill. Any subpaths that are open shall be implicitly closed before being filled.
    */
    DrawingContext.prototype.fill = function () {
        // this.closePath(); ?
        logger.silly("Ignoring fill() operation");
    };
    /** ALIAS
    > `F`: Equivalent to f; included only for compatibility. Although PDF reader applications shall be able to accept this operator, PDF writer applications should use f instead.
    */
    DrawingContext.prototype.fillCompat = function () {
        this.fill();
    };
    /**
    > `f*`: Fill the path, using the even-odd rule to determine the region to fill.
    */
    DrawingContext.prototype.fillEvenOdd = function () {
        logger.silly("Ignoring fillEvenOdd() operation");
    };
    /**
    > `B`: Fill and then stroke the path, using the nonzero winding number rule to determine the region to fill. This operator shall produce the same result as constructing two identical path objects, painting the first with f and the second with S.
    > NOTE The filling and stroking portions of the operation consult different values of several graphics state parameters, such as the current colour.
    */
    DrawingContext.prototype.fillThenStroke = function () {
        logger.silly("Ignoring fillAndStroke() operation");
    };
    /**
    > `B*`: Fill and then stroke the path, using the even-odd rule to determine the region to fill. This operator shall produce the same result as B, except that the path is filled as if with f* instead of f.
    */
    DrawingContext.prototype.fillThenStrokeEvenOdd = function () {
        logger.silly("Ignoring fillAndStrokeEvenOdd() operation");
    };
    /** ALIAS
    > `b`: Close, fill, and then stroke the path, using the nonzero winding number rule to determine the region to fill. This operator shall have the same effect as the sequence h B.
    */
    DrawingContext.prototype.closeAndFillThenStroke = function () {
        this.closePath();
        this.fillThenStroke();
    };
    /** ALIAS
    > `b*`: Close, fill, and then stroke the path, using the even-odd rule to determine the region to fill. This operator shall have the same effect as the sequence h B*.
    */
    DrawingContext.prototype.closeAndFillThenStrokeEvenOdd = function () {
        this.closePath();
        this.fillThenStrokeEvenOdd();
    };
    /**
    > `n`: End the path object without filling or stroking it. This operator shall be a path- painting no-op, used primarily for the side effect of changing the current clipping path.
    */
    DrawingContext.prototype.closePathNoop = function () {
        logger.silly("Ignoring closePathNoop() operation");
    };
    // ---------------------------------------------------------------------------
    //                           Color operators
    /**
    > `name CS`
    */
    DrawingContext.prototype.setStrokeColorSpace = function (name) {
        logger.silly("Ignoring setStrokeColorSpace(" + name + ") operation");
    };
    /**
    > `name cs`: Same as CS but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillColorSpace = function (name) {
        logger.silly("Ignoring setFillColorSpace(" + name + ") operation");
    };
    /**
    > `c1 cn SC`
    */
    DrawingContext.prototype.setStrokeColorSpace2 = function (c1, cn) {
        logger.silly("Ignoring setStrokeColorSpace2(" + c1 + ", " + cn + ") operation");
    };
    /**
    > `c1 cn [name] SCN`
    */
    DrawingContext.prototype.setStrokeColorSpace3 = function (c1, cn, patternName) {
        logger.silly("Ignoring setStrokeColorSpace3(" + c1 + ", " + cn + ", " + patternName + ") operation");
    };
    /**
    > `c1 cn sc`: Same as SC but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillColorSpace2 = function (c1, cn) {
        logger.silly("Ignoring setFillColorSpace2(" + c1 + ", " + cn + ") operation");
    };
    /**
    > `c1 cn [name] scn`: Same as SCN but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillColorSpace3 = function (c1, cn, patternName) {
        logger.silly("Ignoring setFillColorSpace3(" + c1 + ", " + cn + ", " + patternName + ") operation");
    };
    /**
    `gray G`: Set the stroking colour space to DeviceGray and set the gray level
    to use for stroking operations. `gray` shall be a number between 0.0 (black)
    and 1.0 (white).
    */
    DrawingContext.prototype.setStrokeGray = function (gray) {
        this.graphicsState.strokeColor = new GrayColor(gray);
    };
    /**
    `gray g`: Same as G but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillGray = function (gray) {
        this.graphicsState.fillColor = new GrayColor(gray);
    };
    /**
    `r g b RG`: Set the stroking colour space to DeviceRGB (or the DefaultRGB colour space; see 8.6.5.6, "Default Colour Spaces") and set the colour to use for stroking operations. Each operand shall be a number between 0.0 (minimum intensity) and 1.0 (maximum intensity).
    */
    DrawingContext.prototype.setStrokeColor = function (r, g, b) {
        this.graphicsState.strokeColor = new RGBColor(r, g, b);
    };
    /**
    `r g b rg`: Same as RG but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillColor = function (r, g, b) {
        this.graphicsState.fillColor = new RGBColor(r, g, b);
    };
    /**
    > `c m y k K`: Set the stroking colour space to DeviceCMYK (or the DefaultCMYK colour space) and set the colour to use for stroking operations. Each operand shall be a number between 0.0 (zero concentration) and 1.0 (maximum concentration).
    */
    DrawingContext.prototype.setStrokeCMYK = function (c, m, y, k) {
        this.graphicsState.strokeColor = new CMYKColor(c, m, y, k);
    };
    /**
    > `c m y k k`: Same as K but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillCMYK = function (c, m, y, k) {
        this.graphicsState.fillColor = new CMYKColor(c, m, y, k);
    };
    // ---------------------------------------------------------------------------
    // Clipping Path Operators (W, W*)
    /**
    > `W`: Modify the current clipping path by intersecting it with the current path, using the nonzero winding number rule to determine which regions lie inside the clipping path.
    */
    DrawingContext.prototype.clip = function () {
        logger.silly("Ignoring clip() operation");
    };
    /**
    > `W*`: Modify the current clipping path by intersecting it with the current path, using the even-odd rule to determine which regions lie inside the clipping path.
    */
    DrawingContext.prototype.clipEvenOdd = function () {
        logger.silly("Ignoring clipEvenOdd() operation");
    };
    // ---------------------------------------------------------------------------
    // Text objects (BT, ET)
    /** `BT` */
    DrawingContext.prototype.startTextBlock = function () {
        this.textMatrix = this.textLineMatrix = mat3ident;
    };
    /** `ET` */
    DrawingContext.prototype.endTextBlock = function () {
        this.textMatrix = this.textLineMatrix = null;
    };
    // ---------------------------------------------------------------------------
    // Text state operators (Tc, Tw, Tz, TL, Tf, Tr, Ts) - see PDF32000_2008.pdf:9.3.1
    /**
    > `charSpace Tc`: Set the character spacing, Tc, to charSpace, which shall
    > be a number expressed in unscaled text space units. Character spacing shall
    > be used by the Tj, TJ, and ' operators. Initial value: 0.
    */
    DrawingContext.prototype.setCharSpacing = function (charSpace) {
        this.textState.charSpacing = charSpace;
    };
    /**
    > `wordSpace Tw`: Set the word spacing, Tw, to wordSpace, which shall be a
    > number expressed in unscaled text space units. Word spacing shall be used
    > by the Tj, TJ, and ' operators. Initial value: 0.
    */
    DrawingContext.prototype.setWordSpacing = function (wordSpace) {
        this.textState.wordSpacing = wordSpace;
    };
    /**
    > `scale Tz`: Set the horizontal scaling, Th, to (scale ÷ 100). scale shall
    > be a number specifying the percentage of the normal width. Initial value:
    > 100 (normal width).
    */
    DrawingContext.prototype.setHorizontalScale = function (scale) {
        this.textState.horizontalScaling = scale;
    };
    /**
    > `leading TL`: Set the text leading, Tl, to leading, which shall be a number
    > expressed in unscaled text space units. Text leading shall be used only by
    > the T*, ', and " operators. Initial value: 0.
    */
    DrawingContext.prototype.setLeading = function (leading) {
        this.textState.leading = leading;
    };
    /**
    > `font size Tf`: Set the text font, Tf, to font and the text font size,
    > Tfs, to size. font shall be the name of a font resource in the Font
    > subdictionary of the current resource dictionary; size shall be a number
    > representing a scale factor. There is no initial value for either font or
    > size; they shall be specified explicitly by using Tf before any text is
    > shown.
    */
    DrawingContext.prototype.setFont = function (font, size) {
        this.textState.fontName = font;
        this.textState.fontSize = size;
    };
    /**
    > `render Tr`: Set the text rendering mode, Tmode, to render, which shall
    > be an integer. Initial value: 0.
    */
    DrawingContext.prototype.setRenderingMode = function (render) {
        this.textState.renderingMode = render;
    };
    /**
    > `rise Ts`: Set the text rise, Trise, to rise, which shall be a number expressed in unscaled text space units. Initial value: 0.
    */
    DrawingContext.prototype.setRise = function (rise) {
        this.textState.rise = rise;
    };
    // ---------------------------------------------------------------------------
    // Text positioning operators (Td, TD, Tm, T*)
    /**
    > `x y Td`: Move to the start of the next line, offset from the start of the
    > current line by (tx, ty). tx and ty shall denote numbers expressed in
    > unscaled text space units. More precisely, this operator shall perform
    > these assignments: Tm = Tlm = [ [1 0 0], [0 1 0], [x y 1] ] x Tlm
    */
    DrawingContext.prototype.adjustCurrentPosition = function (x, y) {
        // y is usually 0, and never positive in normal text.
        var newTextMatrix = mat3mul([1, 0, 0, 0, 1, 0, x, y, 1], this.textLineMatrix);
        this.textMatrix = this.textLineMatrix = newTextMatrix;
    };
    /** COMPLETE (ALIAS)
    > `x y TD`: Move to the start of the next line, offset from the start of the
    > current line by (x, y). As a side effect, this operator shall set the
    > leading parameter in the text state. This operator shall have the same
    > effect as this code: `-ty TL tx ty Td`
    */
    DrawingContext.prototype.adjustCurrentPositionWithLeading = function (x, y) {
        this.setLeading(-y); // TL
        this.adjustCurrentPosition(x, y); // Td
    };
    /**
    > `a b c d e f Tm`: Set the text matrix, Tm, and the text line matrix, Tlm:
    > Tm = Tlm = [ [a b 0], [c d 0], [e f 1] ]
    > The operands shall all be numbers, and the initial value for Tm and Tlm
    > shall be the identity matrix, [1 0 0 1 0 0]. Although the operands specify
    > a matrix, they shall be passed to Tm as six separate numbers, not as an
    > array. The matrix specified by the operands shall not be concatenated onto
    > the current text matrix, but shall replace it.
    */
    DrawingContext.prototype.setTextMatrix = function (a, b, c, d, e, f) {
        // calling setTextMatrix(1, 0, 0, 1, 0, 0) sets it to the identity matrix
        // e and f mark the x and y coordinates of the current position
        var newTextMatrix = [a, b, 0, c, d, 0, e, f, 1];
        this.textMatrix = this.textLineMatrix = newTextMatrix;
    };
    /** COMPLETE (ALIAS)
    > `T*`: Move to the start of the next line. This operator has the same effect
    > as the code `0 -Tl Td` where Tl denotes the current leading parameter in the
    > text state. The negative of Tl is used here because Tl is the text leading
    > expressed as a positive number. Going to the next line entails decreasing
    > the y coordinate.
    */
    DrawingContext.prototype.newLine = function () {
        this.adjustCurrentPosition(0, -this.textState.leading);
    };
    // ---------------------------------------------------------------------------
    // Text showing operators (Tj, TJ, ', ")
    /**
    > `string Tj`: Show a text string.
  
    string is a list of character codes, potentially larger than 256
    */
    DrawingContext.prototype.showString = function (string) {
        this._renderTextString(string);
    };
    /**
    > `array TJ`: Show one or more text strings, allowing individual glyph
    > positioning. Each element of array shall be either a string or a number.
    > If the element is a string, this operator shall show the string. If it is
    > a number, the operator shall adjust the text position by that amount; that
    > is, it shall translate the text matrix, Tm. The number shall be expressed
    > in thousandths of a unit of text space (see 9.4.4, "Text Space Details").
    > This amount shall be subtracted from the current horizontal or vertical
    > coordinate, depending on the writing mode. In the default coordinate system,
    > a positive adjustment has the effect of moving the next glyph painted either
    > to the left or down by the given amount.
  
    In other words:
    - large negative numbers equate to spaces
    - small positive amounts equate to kerning hacks
    */
    DrawingContext.prototype.showStrings = function (array) {
        this._renderTextArray(array);
    };
    /** COMPLETE (ALIAS)
    > `string '` Move to the next line and show a text string. This operator shall have
    > the same effect as the code `T* string Tj`
    */
    DrawingContext.prototype.newLineAndShowString = function (string) {
        this.newLine(); // T*
        this.showString(string); // Tj
    };
    /** COMPLETE (ALIAS)
    > `wordSpace charSpace text "` Move to the next line and show a text string,
    > using `wordSpace` as the word spacing and `charSpace` as the character
    > spacing (setting the corresponding parameters in the text state).
    > `wordSpace` and `charSpace` shall be numbers expressed in unscaled text
    > space units. This operator shall have the same effect as this code:
    > `wordSpace Tw charSpace Tc text '`
    */
    DrawingContext.prototype.newLineAndShowStringWithSpacing = function (wordSpace, charSpace, string) {
        this.setWordSpacing(wordSpace); // Tw
        this.setCharSpacing(charSpace); // Tc
        this.newLineAndShowString(string); // '
    };
    return DrawingContext;
})();
exports.DrawingContext = DrawingContext;
