var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var logger_1 = require('../logger');
var util_1 = require('../util');
var index_1 = require('../parsers/index');
var geometry_1 = require('./geometry');
var color_1 = require('./color');
var math_1 = require('./math');
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
var TextState = (function () {
    function TextState() {
        this.charSpacing = 0;
        this.wordSpacing = 0;
        this.horizontalScaling = 100;
        this.leading = 0;
        this.renderingMode = RenderingMode.Fill;
        this.rise = 0;
    }
    TextState.prototype.clone = function () {
        return util_1.clone(this, new TextState());
    };
    return TextState;
})();
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
        this.textState = new TextState();
    }
    /**
    clone() creates an blank new GraphicsState object and recursively copies all
    of `this`'s properties to it.
    */
    GraphicsState.prototype.clone = function () {
        return util_1.clone(this, new GraphicsState());
    };
    return GraphicsState;
})();
/**
DrawingContext is kind of like a Canvas state, keeping track of where we are in
painting the canvas. It's an abstraction away from the content stream and the
rest of the PDF.

the textState persists across BT and ET markers, and can be modified anywhere
the textMatrix and textLineMatrix do not persist between distinct BT ... ET blocks

I don't think textState transfers to (or out of) "Do"-drawn XObjects.
E.g., P13-4028.pdf breaks if textState carries out of the drawn object.
*/
var DrawingContext = (function () {
    function DrawingContext(resources, graphicsState) {
        this.resourcesStack = [resources];
        this.graphicsStateStack = [graphicsState];
    }
    Object.defineProperty(DrawingContext.prototype, "graphicsState", {
        get: function () {
            return this.graphicsStateStack[this.graphicsStateStack.length - 1];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DrawingContext.prototype, "resources", {
        get: function () {
            return this.resourcesStack[this.resourcesStack.length - 1];
        },
        enumerable: true,
        configurable: true
    });
    // ###########################################################################
    // content stream operators interpreters
    // ---------------------------------------------------------------------------
    // Special graphics states (q, Q, cm)
    /**
    > `q`: Save the current graphics state on the graphics state stack (see 8.4.2).
    */
    DrawingContext.prototype.pushGraphicsState = function () {
        this.graphicsStateStack.push(this.graphicsState.clone());
    };
    /**
    > `Q`: Restore the graphics state by removing the most recently saved state
    > from the stack and making it the current state (see 8.4.2).
    */
    DrawingContext.prototype.popGraphicsState = function () {
        this.graphicsStateStack.pop();
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
        var newCTMatrix = math_1.mat3mul([a, b, 0,
            c, d, 0,
            e, f, 1], this.graphicsState.ctMatrix);
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
  
    When the Do operator is applied to a form XObject, a conforming reader shall perform the following tasks:
    a) Saves the current graphics state, as if by invoking the q operator
    b) Concatenates the matrix from the form dictionary’s Matrix entry with the current transformation matrix (CTM)
    c) Clips according to the form dictionary’s BBox entry
    d) Paints the graphics objects specified in the form’s content stream
    e) Restores the saved graphics state, as if by invoking the Q operator
    Except as described above, the initial graphics state for the form shall be inherited from the graphics state that is in effect at the time Do is invoked.
    */
    DrawingContext.prototype.drawObject = function (name) {
        logger_1.logger.error('Unimplemented "drawObject" operation');
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
  
    LW number (Optional; PDF 1.3) The line width
    LC integer (Optional; PDF 1.3) The line cap style
    LJ integer (Optional; PDF 1.3) The line join style
    ML number (Optional; PDF 1.3) The miter limit
    D array (Optional; PDF 1.3) The line dash pattern, expressed as an array of the form [dashArray dashPhase], where dashArray shall be itself an array and dashPhase shall be an integer
    RI name (Optional; PDF 1.3) The name of the rendering intent
    OP boolean (Optional) A flag specifying whether to apply overprint. In PDF 1.2 and earlier, there is a single overprint parameter that applies to all painting operations. Beginning with PDF 1.3, there shall be two separate overprint parameters: one for stroking and one for all other painting operations. Specifying an OP entry shall set both parameters unless there is also an op entry in the same graphics state parameter dictionary, in which case the OP entry shall set only the overprint parameter for stroking.
    op boolean (Optional; PDF 1.3) A flag specifying whether to apply overprint for painting operations other than stroking. If this entry is absent, the OP entry, if any, shall also set this parameter.
    OPM integer (Optional; PDF1.3) The overprint mode
    Font array (Optional; PDF 1.3) An array of the form [font size], where font shall be an indirect reference to a font dictionary and size shall be a number expressed in text space units. These two objects correspond to the operands of the Tf operator (see 9.3, "Text State Parameters and Operators"); however, the first operand shall be an indirect object reference instead of a resource name.
    BG function (Optional) The black-generation function, which maps the interval [0.0 1.0] to the interval [0.0 1.0]
    BG2 function or name (Optional; PDF 1.3) Same as BG except that the value may also be the name Default, denoting the black-generation function that was in effect at the start of the page. If both BG and BG2 are present in the same graphics state parameter dictionary, BG2 shall take precedence.
    UCR function (Optional) The undercolor-removal function, which maps the interval [0.0 1.0] to the interval [−1.0 1.0]
    UCR2 function or name (Optional; PDF 1.3) Same as UCR except that the value may also be the name Default, denoting the undercolor-removal function that was in effect at the start of the page. If both UCR and UCR2 are present in the same graphics state parameter dictionary, UCR2 shall take precedence.
    TR function, array, or name (Optional) The transfer function, which maps the interval [0.0 1.0] to the interval [0.0 1.0]. The value shall be either a single function (which applies to all process colorants) or an array of four functions (which apply to the process colorants individually). The name Identity may be used to represent the identity function.
    TR2 function, array, or name (Optional; PDF 1.3) Same as TR except that the value may also be the name Default, denoting the transfer function that was in effect at the start of the page. If both TR and TR2 are present in the same graphics state parameter dictionary, TR2 shall take precedence.
    HT dictionary, stream, or name (Optional) The halftone dictionary or stream or the name Default, denoting the halftone that was in effect at the start of the page.
    FL number (Optional; PDF 1.3) The flatness tolerance
    SM number (Optional; PDF1.3) The smoothness tolerance
    SA boolean (Optional) A flag specifying whether to apply automatic stroke adjustment.
    BM name or array (Optional; PDF 1.4) The current blend mode to be used in the transparent imaging model
    SMask dictionary or name (Optional; PDF 1.4) The current soft mask, specifying the mask shape or mask opacity values that shall be used in the transparent imaging model (see 11.3.7.2, "Source Shape and Opacity" and 11.6.4.3, "Mask Shape and Opacity"). Although the current soft mask is sometimes referred to as a "soft clip," altering it with the gs operator completely replaces the old value with the new one, rather than intersecting the two as is done with the current clipping path parameter
    CA number (Optional; PDF 1.4) The current stroking alpha constant, specifying the constant shape or constant opacity value that shall be used for stroking operations in the transparent imaging model
    ca number (Optional; PDF 1.4) Same as CA, but for nonstroking operations.
    AIS boolean (Optional; PDF1.4) The alpha source flag ("alpha is shape"), specifying whether the current soft mask and alpha constant shall be interpreted as shape values (true) or opacity values (false).
    TK boolean (Optional; PDF1.4) The text knockout flag, shall determine the behaviour of overlapping glyphs within a text object in the transparent imaging model
    */
    DrawingContext.prototype.setGraphicsStateParameters = function (dictName) {
        var ExtGState = this.resources.getExtGState(dictName);
        Object.keys(ExtGState.object).filter(function (key) { return key !== 'Type'; }).forEach(function (key) {
            var value = ExtGState.get(key);
            logger_1.logger.debug("Ignoring setGraphicsStateParameters(" + dictName + ") operation: %s = %j", key, value);
        });
    };
    // ---------------------------------------------------------------------------
    // Path construction (m, l, c, v, y, h, re) - see Table 59
    /**
    `x y m`
    */
    DrawingContext.prototype.moveTo = function (x, y) {
        logger_1.logger.debug("Ignoring moveTo(" + x + ", " + y + ") operation");
    };
    /**
    `x y l`
    */
    DrawingContext.prototype.appendLine = function (x, y) {
        logger_1.logger.debug("Ignoring appendLine(" + x + ", " + y + ") operation");
    };
    /**
    `x1 y1 x2 y2 x3 y3 c`
    */
    DrawingContext.prototype.appendCurve123 = function (x1, y1, x2, y2, x3, y3) {
        logger_1.logger.debug("Ignoring appendCurve123(" + x1 + ", " + y1 + ", " + x2 + ", " + y2 + ", " + x3 + ", " + y3 + ") operation");
    };
    /**
    `x2 y2 x3 y3 v`
    */
    DrawingContext.prototype.appendCurve23 = function (x2, y2, x3, y3) {
        logger_1.logger.debug("Ignoring appendCurve23(" + x2 + ", " + y2 + ", " + x3 + ", " + y3 + ") operation");
    };
    /**
    `x1 y1 x3 y3 y`
    */
    DrawingContext.prototype.appendCurve13 = function (x1, y1, x3, y3) {
        logger_1.logger.debug("Ignoring appendCurve13(" + x1 + ", " + y1 + ", " + x3 + ", " + y3 + ") operation");
    };
    /**
    `h`
    */
    DrawingContext.prototype.closePath = function () {
        logger_1.logger.debug("Ignoring closePath() operation");
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
        logger_1.logger.debug("Ignoring appendRectangle(" + x + ", " + y + ", " + width + ", " + height + ") operation");
    };
    // ---------------------------------------------------------------------------
    // Path painting (S, s, f, F, f*, B, B*, b, b*, n) - see Table 60
    /**
    > `S`: Stroke the path.
    */
    DrawingContext.prototype.stroke = function () {
        logger_1.logger.debug("Ignoring stroke() operation");
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
        logger_1.logger.debug("Ignoring fill() operation");
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
        logger_1.logger.debug("Ignoring fillEvenOdd() operation");
    };
    /**
    > `B`: Fill and then stroke the path, using the nonzero winding number rule to determine the region to fill. This operator shall produce the same result as constructing two identical path objects, painting the first with f and the second with S.
    > NOTE The filling and stroking portions of the operation consult different values of several graphics state parameters, such as the current colour.
    */
    DrawingContext.prototype.fillThenStroke = function () {
        logger_1.logger.debug("Ignoring fillAndStroke() operation");
    };
    /**
    > `B*`: Fill and then stroke the path, using the even-odd rule to determine the region to fill. This operator shall produce the same result as B, except that the path is filled as if with f* instead of f.
    */
    DrawingContext.prototype.fillThenStrokeEvenOdd = function () {
        logger_1.logger.debug("Ignoring fillAndStrokeEvenOdd() operation");
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
        logger_1.logger.debug("Ignoring closePathNoop() operation");
    };
    // ---------------------------------------------------------------------------
    //                           Color operators
    /**
    > `name CS`
    */
    DrawingContext.prototype.setStrokeColorSpace = function (name) {
        logger_1.logger.debug("Ignoring setStrokeColorSpace(" + name + ") operation");
    };
    /**
    > `name cs`: Same as CS but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillColorSpace = function (name) {
        logger_1.logger.debug("Ignoring setFillColorSpace(" + name + ") operation");
    };
    /**
    > `c1 cn SC`
    */
    DrawingContext.prototype.setStrokeColorSpace2 = function (c1, cn) {
        logger_1.logger.debug("Ignoring setStrokeColorSpace2(" + c1 + ", " + cn + ") operation");
    };
    /**
    > `c1 cn [name] SCN`
    */
    DrawingContext.prototype.setStrokeColorSpace3 = function (c1, cn, patternName) {
        logger_1.logger.debug("Ignoring setStrokeColorSpace3(" + c1 + ", " + cn + ", " + patternName + ") operation");
    };
    /**
    > `c1 cn sc`: Same as SC but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillColorSpace2 = function (c1, cn) {
        logger_1.logger.debug("Ignoring setFillColorSpace2(" + c1 + ", " + cn + ") operation");
    };
    /**
    > `c1 cn [name] scn`: Same as SCN but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillColorSpace3 = function (c1, cn, patternName) {
        logger_1.logger.debug("Ignoring setFillColorSpace3(" + c1 + ", " + cn + ", " + patternName + ") operation");
    };
    /**
    `gray G`: Set the stroking colour space to DeviceGray and set the gray level
    to use for stroking operations. `gray` shall be a number between 0.0 (black)
    and 1.0 (white).
    */
    DrawingContext.prototype.setStrokeGray = function (gray) {
        this.graphicsState.strokeColor = new color_1.GrayColor(gray);
    };
    /**
    `gray g`: Same as G but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillGray = function (gray) {
        this.graphicsState.fillColor = new color_1.GrayColor(gray);
    };
    /**
    `r g b RG`: Set the stroking colour space to DeviceRGB (or the DefaultRGB colour space; see 8.6.5.6, "Default Colour Spaces") and set the colour to use for stroking operations. Each operand shall be a number between 0.0 (minimum intensity) and 1.0 (maximum intensity).
    */
    DrawingContext.prototype.setStrokeColor = function (r, g, b) {
        this.graphicsState.strokeColor = new color_1.RGBColor(r, g, b);
    };
    /**
    `r g b rg`: Same as RG but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillColor = function (r, g, b) {
        this.graphicsState.fillColor = new color_1.RGBColor(r, g, b);
    };
    /**
    > `c m y k K`: Set the stroking colour space to DeviceCMYK (or the DefaultCMYK colour space) and set the colour to use for stroking operations. Each operand shall be a number between 0.0 (zero concentration) and 1.0 (maximum concentration).
    */
    DrawingContext.prototype.setStrokeCMYK = function (c, m, y, k) {
        this.graphicsState.strokeColor = new color_1.CMYKColor(c, m, y, k);
    };
    /**
    > `c m y k k`: Same as K but used for nonstroking operations.
    */
    DrawingContext.prototype.setFillCMYK = function (c, m, y, k) {
        this.graphicsState.fillColor = new color_1.CMYKColor(c, m, y, k);
    };
    // ---------------------------------------------------------------------------
    // Shading Pattern Operator (sh)
    /**
    > `name sh`: Paint the shape and colour shading described by a shading dictionary, subject to the current clipping path. The current colour in the graphics state is neither used nor altered. The effect is different from that of painting a path using a shading pattern as the current colour.
    > name is the name of a shading dictionary resource in the Shading subdictionary of the current resource dictionary. All coordinates in the shading dictionary are interpreted relative to the current user space. (By contrast, when a shading dictionary is used in a type 2 pattern, the coordinates are expressed in pattern space.) All colours are interpreted in the colour space identified by the shading dictionary’s ColorSpace entry. The Background entry, if present, is ignored.
    > This operator should be applied only to bounded or geometrically defined shadings. If applied to an unbounded shading, it paints the shading’s gradient fill across the entire clipping region, which may be time-consuming.
    */
    DrawingContext.prototype.shadingPattern = function (name) {
        logger_1.logger.debug("Ignoring shadingPattern(" + name + ") operation");
    };
    // ---------------------------------------------------------------------------
    // Inline Image Operators (BI, ID, EI)
    DrawingContext.prototype.beginInlineImage = function () {
        logger_1.logger.debug("Ignoring beginInlineImage() operation");
    };
    DrawingContext.prototype.endInlineImage = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        logger_1.logger.debug("Ignoring endInlineImage() operation");
    };
    // ---------------------------------------------------------------------------
    // Clipping Path Operators (W, W*)
    /**
    > `W`: Modify the current clipping path by intersecting it with the current path, using the nonzero winding number rule to determine which regions lie inside the clipping path.
    */
    DrawingContext.prototype.clip = function () {
        logger_1.logger.debug("Ignoring clip() operation");
    };
    /**
    > `W*`: Modify the current clipping path by intersecting it with the current path, using the even-odd rule to determine which regions lie inside the clipping path.
    */
    DrawingContext.prototype.clipEvenOdd = function () {
        logger_1.logger.debug("Ignoring clipEvenOdd() operation");
    };
    // ---------------------------------------------------------------------------
    // Text objects (BT, ET)
    /** `BT` */
    DrawingContext.prototype.startTextBlock = function () {
        this.textMatrix = this.textLineMatrix = math_1.mat3ident;
    };
    /** `ET` */
    DrawingContext.prototype.endTextBlock = function () {
        this.textMatrix = this.textLineMatrix = undefined;
    };
    // ---------------------------------------------------------------------------
    // Text state operators (Tc, Tw, Tz, TL, Tf, Tr, Ts) - see PDF32000_2008.pdf:9.3.1
    /**
    > `charSpace Tc`: Set the character spacing, Tc, to charSpace, which shall
    > be a number expressed in unscaled text space units. Character spacing shall
    > be used by the Tj, TJ, and ' operators. Initial value: 0.
    */
    DrawingContext.prototype.setCharSpacing = function (charSpace) {
        this.graphicsState.textState.charSpacing = charSpace;
    };
    /**
    > `wordSpace Tw`: Set the word spacing, Tw, to wordSpace, which shall be a
    > number expressed in unscaled text space units. Word spacing shall be used
    > by the Tj, TJ, and ' operators. Initial value: 0.
    */
    DrawingContext.prototype.setWordSpacing = function (wordSpace) {
        this.graphicsState.textState.wordSpacing = wordSpace;
    };
    /**
    > `scale Tz`: Set the horizontal scaling, Th, to (scale ÷ 100). scale shall
    > be a number specifying the percentage of the normal width. Initial value:
    > 100 (normal width).
    */
    DrawingContext.prototype.setHorizontalScale = function (scale) {
        this.graphicsState.textState.horizontalScaling = scale;
    };
    /**
    > `leading TL`: Set the text leading, Tl, to leading, which shall be a number
    > expressed in unscaled text space units. Text leading shall be used only by
    > the T*, ', and " operators. Initial value: 0.
    */
    DrawingContext.prototype.setLeading = function (leading) {
        this.graphicsState.textState.leading = leading;
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
        this.graphicsState.textState.fontName = font;
        this.graphicsState.textState.fontSize = size;
    };
    /**
    > `render Tr`: Set the text rendering mode, Tmode, to render, which shall
    > be an integer. Initial value: 0.
    */
    DrawingContext.prototype.setRenderingMode = function (render) {
        this.graphicsState.textState.renderingMode = render;
    };
    /**
    > `rise Ts`: Set the text rise, Trise, to rise, which shall be a number expressed in unscaled text space units. Initial value: 0.
    */
    DrawingContext.prototype.setRise = function (rise) {
        this.graphicsState.textState.rise = rise;
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
        var newTextMatrix = math_1.mat3mul([1, 0, 0,
            0, 1, 0,
            x, y, 1], this.textLineMatrix);
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
        var newTextMatrix = [a, b, 0,
            c, d, 0,
            e, f, 1];
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
        this.adjustCurrentPosition(0, -this.graphicsState.textState.leading);
    };
    // ---------------------------------------------------------------------------
    // Text showing operators (Tj, TJ, ', ")
    /**
    > `string Tj`: Show a text string.
  
    `string` is a list of bytes (most often, character codes), each in the range
    [0, 256). Because parsing hex strings depends on the current font, we cannot
    resolve the bytes into character codes until rendered in the context of a
    textState.
    */
    DrawingContext.prototype.showString = function (buffer) {
        logger_1.logger.error('Unimplemented "showString" operation');
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
        logger_1.logger.error('Unimplemented "showStrings" operation');
    };
    /** COMPLETE (ALIAS)
    > `string '` Move to the next line and show a text string. This operator shall have
    > the same effect as the code `T* string Tj`
    */
    DrawingContext.prototype.newLineAndShowString = function (buffer) {
        this.newLine(); // T*
        this.showString(buffer); // Tj
    };
    /** COMPLETE (ALIAS)
    > `wordSpace charSpace text "` Move to the next line and show a text string,
    > using `wordSpace` as the word spacing and `charSpace` as the character
    > spacing (setting the corresponding parameters in the text state).
    > `wordSpace` and `charSpace` shall be numbers expressed in unscaled text
    > space units. This operator shall have the same effect as this code:
    > `wordSpace Tw charSpace Tc text '`
    */
    DrawingContext.prototype.newLineAndShowStringWithSpacing = function (wordSpace, charSpace, buffer) {
        this.setWordSpacing(wordSpace); // Tw
        this.setCharSpacing(charSpace); // Tc
        this.newLineAndShowString(buffer); // '
    };
    // ---------------------------------------------------------------------------
    // Marked content (BMC, BDC, EMC)
    /**
    > `tag BMC`: Begin a marked-content sequence terminated by a balancing EMC operator. tag shall be a name object indicating the role or significance of the sequence.
    */
    DrawingContext.prototype.beginMarkedContent = function (tag) {
        logger_1.logger.debug("Ignoring beginMarkedContent(" + tag + ") operation");
    };
    /**
    > `tag properties BDC`: Begin a marked-content sequence with an associated property list, terminated by a balancing EMC operator. tag shall be a name object indicating the role or significance of the sequence. properties shall be either an inline dictionary containing the property list or a name object associated with it in the Properties subdictionary of the current resource dictionary.
    */
    DrawingContext.prototype.beginMarkedContentWithDictionary = function (tag, dictionary) {
        logger_1.logger.debug("Ignoring beginMarkedContentWithDictionary(" + tag + ", %j) operation", dictionary);
    };
    /**
    > `EMC`: End a marked-content sequence begun by a BMC or BDC operator.
    */
    DrawingContext.prototype.endMarkedContent = function () {
        logger_1.logger.debug("Ignoring endMarkedContent() operation");
    };
    return DrawingContext;
})();
exports.DrawingContext = DrawingContext;
/**
Add Resources tracking and drawObject support.
*/
var RecursiveDrawingContext = (function (_super) {
    __extends(RecursiveDrawingContext, _super);
    function RecursiveDrawingContext(resources, depth) {
        if (depth === void 0) { depth = 0; }
        _super.call(this, resources, new GraphicsState());
        this.depth = depth;
    }
    RecursiveDrawingContext.prototype.applyOperation = function (operator, operands) {
        // logger.debug('applyOperation "%s": %j', operator, operands);
        var func = this[operator];
        if (func) {
            func.apply(this, operands);
        }
        else {
            logger_1.logger.warning("Ignoring unrecognized operator \"" + operator + "\" [" + operands.join(', ') + "]");
        }
    };
    RecursiveDrawingContext.prototype.applyContentStream = function (content_stream_string) {
        var _this = this;
        // read the operations and apply them
        var operations = index_1.parseContentStream(content_stream_string);
        operations.forEach(function (operation) { return _this.applyOperation(operation.alias, operation.operands); });
    };
    /** Do */
    RecursiveDrawingContext.prototype.drawObject = function (name) {
        var XObjectStream = this.resources.getXObject(name);
        if (XObjectStream === undefined) {
            throw new Error("Cannot draw undefined XObject: " + name);
        }
        if (XObjectStream.Subtype !== 'Form') {
            logger_1.logger.debug("Ignoring \"" + name + " Do\" command; embedded XObject has unsupported Subtype \"" + XObjectStream.Subtype + "\"");
            return;
        }
        var object_depth = this.depth + 1;
        if (object_depth >= 5) {
            logger_1.logger.warning("Ignoring \"" + name + " Do\" command; embedded XObject is too deep; depth = " + object_depth);
            return;
        }
        logger_1.logger.debug("drawObject: rendering \"" + name + "\" at depth=" + object_depth);
        // create a nested drawing context and use that
        // a) copy the current state and push it on top of the state stack
        this.pushGraphicsState();
        // b) concatenate the dictionary.Matrix onto the graphics state
        if (XObjectStream.dictionary.Matrix) {
            this.setCTM.apply(this, XObjectStream.dictionary.Matrix);
        }
        // c) clip according to the dictionary.BBox value
        // ...meh, don't worry about that
        // d) paint the XObject's content stream
        this.resourcesStack.push(XObjectStream.Resources);
        this.depth++;
        var content_stream_string = XObjectStream.buffer.toString('binary');
        this.applyContentStream(content_stream_string);
        this.depth--;
        this.resourcesStack.pop();
        // e) pop the graphics state
        this.popGraphicsState();
        logger_1.logger.debug("drawObject: finished drawing \"" + name + "\"");
    };
    return RecursiveDrawingContext;
})(DrawingContext);
exports.RecursiveDrawingContext = RecursiveDrawingContext;
var CanvasDrawingContext = (function (_super) {
    __extends(CanvasDrawingContext, _super);
    function CanvasDrawingContext(canvas, resources, skipMissingCharacters, depth) {
        if (skipMissingCharacters === void 0) { skipMissingCharacters = false; }
        if (depth === void 0) { depth = 0; }
        _super.call(this, resources, depth);
        this.canvas = canvas;
        this.skipMissingCharacters = skipMissingCharacters;
    }
    /**
    advanceTextMatrix is only called from the various text drawing operations,
    like showString and showStrings.
    */
    CanvasDrawingContext.prototype.advanceTextMatrix = function (width_units, chars, spaces) {
        // width_units is positive, but we want to move forward, so tx should be positive too
        var tx = (((width_units / 1000) * this.graphicsState.textState.fontSize) +
            (this.graphicsState.textState.charSpacing * chars) +
            (this.graphicsState.textState.wordSpacing * spaces)) *
            (this.graphicsState.textState.horizontalScaling / 100.0);
        this.textMatrix = math_1.mat3mul([1, 0, 0,
            0, 1, 0,
            tx, 0, 1], this.textMatrix);
        return tx;
    };
    CanvasDrawingContext.prototype.getTextPosition = function () {
        var fs = this.graphicsState.textState.fontSize;
        var fsh = fs * (this.graphicsState.textState.horizontalScaling / 100.0);
        var rise = this.graphicsState.textState.rise;
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
        var font_point = new geometry_1.Point(0, this.graphicsState.textState.fontSize);
        return font_point.transform(mat[0], mat[3], mat[1], mat[4]).y;
    };
    /** Tj
  
    drawGlyphs is called when processing a Tj ("showString") operation, and from
    drawTextArray, in turn.
  
    In the case of composite Fonts, each byte in `buffer` may not correspond to a
    single glyph, but for "simple" fonts, that is the case.
  
    */
    CanvasDrawingContext.prototype.showString = function (buffer) {
        // the Font instance handles most of the character code resolution
        var font = this.resources.getFont(this.graphicsState.textState.fontName);
        if (font === null) {
            // missing font -- will induce an error down the line pretty quickly
            throw new Error("Cannot find font \"" + this.graphicsState.textState.fontName + "\" in Resources: " + JSON.stringify(this.resources));
        }
        var origin = this.getTextPosition();
        var fontSize = this.getTextSize();
        var string = font.decodeString(buffer, this.skipMissingCharacters);
        var width_units = font.measureString(buffer);
        var nchars = string.length;
        var nspaces = util_1.countSpaces(string);
        // adjust the text matrix accordingly (but not the text line matrix)
        // see the `... TJ` documentation, as well as PDF32000_2008.pdf:9.4.4
        this.advanceTextMatrix(width_units, nchars, nspaces);
        // TODO: avoid the full getTextPosition() calculation, when all we need is the current x
        var width = this.getTextPosition().x - origin.x;
        var height = Math.ceil(fontSize) | 0;
        var size = new geometry_1.Size(width, height);
        this.canvas.drawText(string, origin, size, fontSize, font.bold, font.italic, this.graphicsState.textState.fontName);
    };
    /** TJ
  
    drawTextArray is called when processing a TJ ("showStrings") operation.
  
    For each item in `array`:
      If item is a number[], that indicates a string of character codes
      If item is a plain number, that indicates a spacing shift
    */
    CanvasDrawingContext.prototype.showStrings = function (array) {
        var _this = this;
        array.forEach(function (item) {
            // each item is either a string (character code array) or a number
            if (Buffer.isBuffer(item)) {
                // if it's a character array, convert it to a unicode string and render it
                _this.showString(item);
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
    __decorate([
        util_1.checkArguments([{ type: 'Buffer' }])
    ], CanvasDrawingContext.prototype, "showString", null);
    return CanvasDrawingContext;
})(RecursiveDrawingContext);
exports.CanvasDrawingContext = CanvasDrawingContext;
var TextDrawingContext = (function (_super) {
    __extends(TextDrawingContext, _super);
    function TextDrawingContext(operations, resources, skipMissingCharacters) {
        if (skipMissingCharacters === void 0) { skipMissingCharacters = false; }
        _super.call(this, resources);
        this.operations = operations;
        this.skipMissingCharacters = skipMissingCharacters;
    }
    TextDrawingContext.prototype.showString = function (buffer) {
        var font = this.resources.getFont(this.graphicsState.textState.fontName);
        if (font === null) {
            throw new Error("Cannot find font \"" + this.graphicsState.textState.fontName + "\" in Resources: " + JSON.stringify(this.resources));
        }
        var str = font.decodeString(buffer, this.skipMissingCharacters);
        this.operations.push({
            action: 'showString',
            argument: "(" + str + ")",
            // details:
            fontName: this.graphicsState.textState.fontName,
            characterByteLength: font.encoding.characterByteLength,
            buffer: buffer,
        });
    };
    TextDrawingContext.prototype.showStrings = function (array) {
        var _this = this;
        array.forEach(function (item) {
            // each item is either a string (character code array) or a number
            if (Buffer.isBuffer(item)) {
                // if it's a character array, convert it to a unicode string and render it
                _this.showString(item);
            }
            else {
                // negative numbers indicate forward (rightward) movement. if it's a
                // very negative number, it's like inserting a space. otherwise, it
                // only signifies a small manual spacing hack.
                var adjustment = item;
                _this.operations.push({
                    action: 'advanceTextMatrix',
                    argument: adjustment.toString(),
                });
            }
        });
    };
    return TextDrawingContext;
})(RecursiveDrawingContext);
exports.TextDrawingContext = TextDrawingContext;
