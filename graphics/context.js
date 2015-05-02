var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var geometry_1 = require('./geometry');
var color_1 = require('./color');
var math_1 = require('./math');
// this module should not import ./stream, which is a consumer of this module.
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
/**
We need to be able to clone it since we need a copy when we process a
`pushGraphicsState` (`q`) command, and it'd be easier to clone if the variables
were in the constructor, but there are a lot of variables!
*/
var GraphicsState = (function () {
    function GraphicsState() {
        this.ctMatrix = math_1.mat3ident; // defaults to the identity matrix
        this.strokeColor = new color_1.Color();
        this.fillColor = new color_1.Color();
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
        this.renderingMode = RenderingMode.Fill;
        this.rise = 0;
    }
    return TextState;
})();
/**
DrawingContext is kind of like a Canvas state, keeping track of where we are in
painting the canvas. It's an abstraction away from the content stream and the
rest of the PDF. We

the textState persists across BT and ET markers, and can be modified anywhere
the textMatrix and textLineMatrix do not persist between distinct BT ... ET blocks
*/
var DrawingContext = (function () {
    function DrawingContext() {
        this.graphicsState = new GraphicsState();
        this.stateStack = [];
        this.textState = new TextState();
    }
    DrawingContext.prototype.drawGlyphs = function (bytes, font) {
        throw new Error('Abstract class');
    };
    DrawingContext.prototype.drawTextArray = function (array, font) {
        throw new Error('Abstract class');
    };
    return DrawingContext;
})();
exports.DrawingContext = DrawingContext;
var CanvasDrawingContext = (function (_super) {
    __extends(CanvasDrawingContext, _super);
    function CanvasDrawingContext(canvas) {
        _super.call(this);
        this.canvas = canvas;
    }
    /**
    advanceTextMatrix is only called from the various text drawing
    */
    CanvasDrawingContext.prototype.advanceTextMatrix = function (width_units, chars, spaces) {
        // width_units is positive, but we want to move forward, so tx should be positive too
        var tx = (((width_units / 1000) * this.textState.fontSize) +
            (this.textState.charSpacing * chars) +
            (this.textState.wordSpacing * spaces)) *
            (this.textState.horizontalScaling / 100.0);
        this.textMatrix = math_1.mat3mul([1, 0, 0,
            0, 1, 0,
            tx, 0, 1], this.textMatrix);
        return tx;
    };
    CanvasDrawingContext.prototype.getTextPosition = function () {
        var fs = this.textState.fontSize;
        var fsh = fs * (this.textState.horizontalScaling / 100.0);
        var rise = this.textState.rise;
        var base = [fsh, 0, 0,
            0, fs, 0,
            0, rise, 1];
        // TODO: optimize this final matrix multiplication; we only need two of the
        // entries, and we discard the rest, so we don't need to calculate them in
        // the first place.
        var composedTransformation = math_1.mat3mul(this.textMatrix, this.graphicsState.ctMatrix);
        var textRenderingMatrix = math_1.mat3mul(base, composedTransformation);
        return new geometry_1.Point(textRenderingMatrix[6], textRenderingMatrix[7]);
    };
    CanvasDrawingContext.prototype.getTextSize = function () {
        // only scale / skew the size of the font; ignore the position of the textMatrix / ctMatrix
        var mat = math_1.mat3mul(this.textMatrix, this.graphicsState.ctMatrix);
        var font_point = new geometry_1.Point(0, this.textState.fontSize);
        return font_point.transform(mat[0], mat[3], mat[1], mat[4]).y;
    };
    /**
    drawGlyphs is called when processing a Tj ("showString") operation, and from
    drawTextArray, in turn.
  
    For each item in `array`:
      If item is a number[], that indicates a string of character codes
      If item is a plain number, that indicates a spacing shift
    */
    CanvasDrawingContext.prototype.drawGlyphs = function (bytes, font) {
        // the Font instance handles most of the character code resolution
        var origin = this.getTextPosition();
        var fontSize = this.getTextSize();
        var string = font.decodeString(bytes);
        var width_units = font.measureString(bytes);
        var nchars = string.length;
        var nspaces = countSpaces(string);
        // adjust the text matrix accordingly (but not the text line matrix)
        // see the `... TJ` documentation, as well as PDF32000_2008.pdf:9.4.4
        this.advanceTextMatrix(width_units, nchars, nspaces);
        // TODO: avoid the full getTextPosition() calculation, when all we need is the current x
        var width = this.getTextPosition().x - origin.x;
        var height = Math.ceil(fontSize) | 0;
        var size = new geometry_1.Size(width, height);
        this.canvas.addSpan(string, origin, size, fontSize, this.textState.fontName);
    };
    /**
    drawTextArray is called when processing a TJ ("showStrings") operation.
  
    For each item in `array`:
      If item is a number[], that indicates a string of character codes
      If item is a plain number, that indicates a spacing shift
    */
    CanvasDrawingContext.prototype.drawTextArray = function (array, font) {
        var _this = this;
        array.forEach(function (item) {
            // each item is either a string (character code array) or a number
            if (Array.isArray(item)) {
                // if it's a character array, convert it to a unicode string and render it
                var bytes = item;
                _this.drawGlyphs(bytes, font);
            }
            else if (typeof item === 'number') {
                // negative numbers indicate forward (rightward) movement. if it's a
                // very negative number, it's like inserting a space. otherwise, it
                // only signifies a small manual spacing hack.
                _this.advanceTextMatrix(-item, 0, 0);
            }
            else {
                throw new Error("Unknown TJ argument type: \"" + item + "\" (array: " + JSON.stringify(array) + ")");
            }
        });
    };
    return CanvasDrawingContext;
})(DrawingContext);
exports.CanvasDrawingContext = CanvasDrawingContext;
var TextDrawingContext = (function (_super) {
    __extends(TextDrawingContext, _super);
    function TextDrawingContext(spans) {
        _super.call(this);
        this.spans = spans;
    }
    TextDrawingContext.prototype.drawGlyphs = function (bytes, font) {
        var str = font.decodeString(bytes);
        this.spans.push({ operator: 'Tj', font: this.textState.fontName, text: str });
    };
    TextDrawingContext.prototype.drawTextArray = function (array, font) {
        var str = array.map(function (item) {
            // each item is either a string (character code array) or a number
            if (Array.isArray(item)) {
                // if it's a character array, convert it to a unicode string and render it
                var bytes = item;
                return font.decodeString(bytes);
            }
            else if (typeof item === 'number') {
                // negative numbers indicate forward (rightward) movement. if it's a
                // very negative number, it's like inserting a space. otherwise, it
                // only signifies a small manual spacing hack.
                return (item < -100) ? ' ' : '';
            }
            else {
                throw new Error("Unknown TJ argument type: \"" + item + "\" (array: " + JSON.stringify(array) + ")");
            }
        }).join('');
        this.spans.push({ operator: 'TJ', font: this.textState.fontName, text: str });
    };
    return TextDrawingContext;
})(DrawingContext);
exports.TextDrawingContext = TextDrawingContext;
