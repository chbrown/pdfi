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
    'Tc': 'setCharSpacing',
    'Tw': 'setWordSpacing',
    'Tz': 'setHorizontalScale',
    'TL': 'setLeading',
    'Tf': 'setFont',
    'Tr': 'setRenderingMode',
    'Ts': 'setRise',
    'Td': 'adjustCurrentPosition',
    'TD': 'adjustCurrentPositionWithLeading',
    'Tm': 'setTextMatrix',
    'T*': 'newLine',
    'Tj': 'showString',
    'TJ': 'showStrings',
    "'": 'newLineAndShowString',
    '"': 'newLineAndShowStringWithSpacing',
    'BT': 'startTextBlock',
    'ET': 'endTextBlock',
    'q': 'pushGraphicsState',
    'Q': 'popGraphicsState',
    'cm': 'setCTM',
    'Do': 'drawObject',
    'w': 'setLineWidth',
    'J': 'setLineCap',
    'j': 'setLineJoin',
    'M': 'setMiterLimit',
    'd': 'setDashPattern',
    'ri': 'setRenderingIntent',
    'i': 'setFlatnessTolerance',
    'gs': 'setGraphicsStateParameters',
    'RG': 'setStrokeColor',
    'rg': 'setFillColor',
    'G': 'setStrokeGray',
    'g': 'setFillGray',
    'm': 'moveTo',
    'l': 'lineTo',
    'S': 'stroke',
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
var mat3ident = [1, 0, 0, 0, 1, 0, 0, 0, 1];
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
        var copy = new GraphicsState();
        for (var key in this) {
            if (this.hasOwnProperty(key)) {
                if (this[key].clone) {
                    copy[key] = this[key].clone();
                }
                else if (Array.isArray(this[key])) {
                    copy[key] = this[key].slice();
                }
                else {
                    copy[key] = this[key];
                }
            }
        }
        return copy;
    };
    return GraphicsState;
})();
var TextState = (function () {
    function TextState(graphicsState) {
        this.graphicsState = graphicsState;
        this.charSpacing = 0;
        this.wordSpacing = 0;
        this.horizontalScaling = 100;
        this.leading = 0;
        this.renderingMode = 0;
        this.rise = 0;
        this.textMatrix = mat3ident;
        this.textLineMatrix = mat3ident;
    }
    TextState.prototype.getPosition = function () {
        var fs = this.fontSize;
        var fsh = fs * (this.horizontalScaling / 100.0);
        var rise = this.rise;
        var base = [fsh, 0, 0, 0, fs, 0, 0, rise, 1];
        var localTextMatrix = mat3mul(base, this.textMatrix);
        // TODO: optimize this final matrix multiplication; we only need two of the
        // entries, and we discard the rest, so we don't need to calculate them in
        // the first place.
        var textRenderingMatrix = mat3mul(localTextMatrix, this.graphicsState.ctMatrix);
        return [textRenderingMatrix[6], textRenderingMatrix[7]];
    };
    return TextState;
})();
var DrawingContext = (function () {
    function DrawingContext(Resources, graphicsState, textState) {
        if (graphicsState === void 0) { graphicsState = new GraphicsState(); }
        if (textState === void 0) { textState = null; }
        this.Resources = Resources;
        this.graphicsState = graphicsState;
        this.textState = textState;
        this.stateStack = [];
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
    DrawingContext.prototype._renderTextString = function (charCodes) {
        var font = this.Resources.getFont(this.textState.fontName);
        var position = this.textState.getPosition();
        var text = font.decodeString(charCodes);
        var width_units = font.measureString(charCodes);
        this.canvas.addSpan(text, position[0], position[1], width_units, this.textState.fontName, this.textState.fontSize);
    };
    DrawingContext.prototype._renderTextArray = function (array, min_space_width) {
        if (min_space_width === void 0) { min_space_width = -100; }
        var font = this.Resources.getFont(this.textState.fontName);
        var position = this.textState.getPosition();
        // the Font instance handles most of the character code resolution
        var width_units = 0;
        var text = array.map(function (item) {
            // each item is either a string (character code array) or a number
            if (Array.isArray(item)) {
                // if it's a character array, convert it to a unicode string and return it
                var charCodes = item;
                var string = font.decodeString(charCodes);
                width_units += font.measureString(charCodes);
                return string;
            }
            else if (typeof item === 'number') {
                // if it's a very negative number, insert a space. otherwise, it only
                // signifies some minute spacing.
                width_units -= item;
                return (item < min_space_width) ? ' ' : '';
            }
            else {
                throw new Error("Unknown TJ argument type: \"" + item + "\" (array: " + JSON.stringify(array) + ")");
            }
        }).join('');
        this.canvas.addSpan(text, position[0], position[1], width_units, this.textState.fontName, this.textState.fontSize);
    };
    DrawingContext.prototype._drawObject = function (name) {
        // create a nested drawing context and use that
        var XObjectStream = this.Resources.getXObject(name);
        if (XObjectStream === undefined) {
            throw new Error("Cannot draw undefined XObject: " + name);
        }
        if (XObjectStream.Subtype == 'Form') {
            var Resources = XObjectStream.Resources;
            var stream_string = XObjectStream.buffer.toString('ascii');
            var stream_string_iterable = new lexing.StringIterator(stream_string);
            var context = new DrawingContext(Resources, this.graphicsState);
            context.render(stream_string_iterable, this.canvas);
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
    // path operators
    /**
    `x y m`
    */
    DrawingContext.prototype.moveTo = function (x, y) {
        logger.silly("Ignoring moveTo(" + x + ", " + y + ") operation");
    };
    /**
    `x y l`
    */
    DrawingContext.prototype.lineTo = function (x, y) {
        logger.silly("Ignoring lineTo(" + x + ", " + y + ") operation");
    };
    /**
    `S`
    */
    DrawingContext.prototype.stroke = function () {
        logger.silly("Ignoring stroke() operation");
    };
    // ---------------------------------------------------------------------------
    //                           Color operators
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
    // ---------------------------------------------------------------------------
    // Text objects (BT, ET)
    /** `BT` */
    DrawingContext.prototype.startTextBlock = function () {
        // intialize state
        this.textState = new TextState(this.graphicsState);
    };
    /** `ET` */
    DrawingContext.prototype.endTextBlock = function () {
        // remove textState, so that any operations that require it will fail
        this.textState = null;
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
        var newTextMatrix = mat3mul([1, 0, 0, 0, 1, 0, x, y, 1], this.textState.textLineMatrix);
        this.textState.textMatrix = this.textState.textLineMatrix = newTextMatrix;
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
        this.textState.textMatrix = this.textState.textLineMatrix = newTextMatrix;
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
    > to the left or down by the given amount. Figure 46 shows an example of the
    > effect of passing offsets to TJ.
  
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
