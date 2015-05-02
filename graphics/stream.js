/// <reference path="../type_declarations/index.d.ts" />
var logger = require('loge');
var lexing = require('lexing');
var font = require('../font/index');
var parser_states = require('../parsers/states');
var color_1 = require('./color');
var math_1 = require('./math');
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
    // Marked content
    // incomplete: MP, DP
    'BMC': 'beginMarkedContent',
    'BDC': 'beginMarkedContentWithDictionary',
    'EMC': 'endMarkedContent',
};
var ContentStreamReader = (function () {
    function ContentStreamReader(Resources, depth) {
        if (depth === void 0) { depth = 0; }
        this.Resources = Resources;
        this.depth = depth;
        this._cached_fonts = {};
    }
    /**
    Retrieve a Font instance from the Resources' Font dictionary.
  
    Returns null if the dictionary has no `name` key.
  
    Caches Fonts (which is pretty hot when rendering a page),
    even missing ones (as null).
    */
    ContentStreamReader.prototype.getFont = function () {
        var name = this.context.textState.fontName;
        var cached_font = this._cached_fonts[name];
        if (cached_font === undefined) {
            var Font_model = this.Resources.getFontModel(name);
            if (Font_model.object !== undefined) {
                var TypedFont_model = font.Font.fromModel(Font_model);
                TypedFont_model.Name = name;
                cached_font = this._cached_fonts[name] = TypedFont_model;
            }
            else {
                cached_font = this._cached_fonts[name] = null;
                // missing font -- will induce an error down the line pretty quickly
                throw new Error("Cannot find font \"" + name + "\" in Resources");
            }
        }
        return cached_font;
    };
    ContentStreamReader.prototype.render = function (string_iterable, context) {
        var _this = this;
        this.context = context;
        var operations = new parser_states.CONTENT_STREAM(string_iterable, 1024).read();
        operations.forEach(function (operation) {
            var operator_alias = operator_aliases[operation.operator];
            var operationFunction = _this[operator_alias];
            if (operationFunction) {
                operationFunction.apply(_this, operation.operands);
            }
            else {
                logger.warn("Ignoring unimplemented operator \"" + operation.operator + "\" [" + operation.operands.join(', ') + "]");
            }
        });
    };
    // ---------------------------------------------------------------------------
    // Special graphics states (q, Q, cm)
    /**
    > `q`: Save the current graphics state on the graphics state stack (see 8.4.2).
    */
    ContentStreamReader.prototype.pushGraphicsState = function () {
        this.context.stateStack.push(this.context.graphicsState.clone());
    };
    /**
    > `Q`: Restore the graphics state by removing the most recently saved state
    > from the stack and making it the current state (see 8.4.2).
    */
    ContentStreamReader.prototype.popGraphicsState = function () {
        this.context.graphicsState = this.context.stateStack.pop();
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
    ContentStreamReader.prototype.setCTM = function (a, b, c, d, e, f) {
        var newCTMatrix = math_1.mat3mul([a, b, 0,
            c, d, 0,
            e, f, 1], this.context.graphicsState.ctMatrix);
        // logger.info('ctMatrix = %j', newCTMatrix);
        this.context.graphicsState.ctMatrix = newCTMatrix;
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
    ContentStreamReader.prototype.drawObject = function (name) {
        var XObjectStream = this.Resources.getXObject(name);
        if (XObjectStream === undefined) {
            throw new Error("Cannot draw undefined XObject: " + name);
        }
        var object_depth = this.depth + 1;
        if (object_depth >= 5) {
            logger.warn("Ignoring \"" + name + " Do\" command; embedded XObject is too deep; depth = " + object_depth);
            return;
        }
        if (XObjectStream.Subtype !== 'Form') {
            logger.silly("Ignoring \"" + name + " Do\" command; embedded XObject has Subtype \"" + XObjectStream.Subtype + "\"");
            return;
        }
        logger.silly("Drawing XObject: " + name);
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
        var stream_string = XObjectStream.buffer.toString('binary');
        var stream_string_iterable = new lexing.StringIterator(stream_string);
        // var stream_string_iterable = lexing.StringIterator.fromBuffer(XObjectStream.buffer, 'binary');
        var reader = new ContentStreamReader(XObjectStream.Resources, this.depth + 1);
        reader.render(stream_string_iterable, this.context);
        // e) pop the graphics state
        this.popGraphicsState();
    };
    // ---------------------------------------------------------------------------
    // General graphics state (w, J, j, M, d, ri, i, gs)
    /**
    > `lineWidth w`: Set the line width in the graphics state.
    */
    ContentStreamReader.prototype.setLineWidth = function (lineWidth) {
        this.context.graphicsState.lineWidth = lineWidth;
    };
    /**
    > `lineCap J`: Set the line cap style in the graphics state.
    */
    ContentStreamReader.prototype.setLineCap = function (lineCap) {
        this.context.graphicsState.lineCap = lineCap;
    };
    /**
    > `lineJoin j`: Set the line join style in the graphics state.
    */
    ContentStreamReader.prototype.setLineJoin = function (lineJoin) {
        this.context.graphicsState.lineJoin = lineJoin;
    };
    /**
    > `miterLimit M`: Set the miter limit in the graphics state.
    */
    ContentStreamReader.prototype.setMiterLimit = function (miterLimit) {
        this.context.graphicsState.miterLimit = miterLimit;
    };
    /**
    > `dashArray dashPhase d`: Set the line dash pattern in the graphics state.
    */
    ContentStreamReader.prototype.setDashPattern = function (dashArray, dashPhase) {
        this.context.graphicsState.dashArray = dashArray;
        this.context.graphicsState.dashPhase = dashPhase;
    };
    /**
    > `intent ri`: Set the colour rendering intent in the graphics state.
    > (PDF 1.1)
    */
    ContentStreamReader.prototype.setRenderingIntent = function (intent) {
        this.context.graphicsState.renderingIntent = intent;
    };
    /**
    > `flatness i`: Set the flatness tolerance in the graphics state. flatness is
    > a number in the range 0 to 100; a value of 0 shall specify the output
    > device's default flatness tolerance.
    */
    ContentStreamReader.prototype.setFlatnessTolerance = function (flatness) {
        this.context.graphicsState.flatnessTolerance = flatness;
    };
    /**
    > `dictName gs`: Set the specified parameters in the graphics state.
    > `dictName` shall be the name of a graphics state parameter dictionary in
    > the ExtGState subdictionary of the current resource dictionary (see the
    > next sub-clause). (PDF 1.2)
    */
    ContentStreamReader.prototype.setGraphicsStateParameters = function (dictName) {
        logger.warn("Ignoring setGraphicsStateParameters(" + dictName + ") operation");
    };
    // ---------------------------------------------------------------------------
    // Path construction (m, l, c, v, y, h, re) - see Table 59
    /**
    `x y m`
    */
    ContentStreamReader.prototype.moveTo = function (x, y) {
        logger.silly("Ignoring moveTo(" + x + ", " + y + ") operation");
    };
    /**
    `x y l`
    */
    ContentStreamReader.prototype.appendLine = function (x, y) {
        logger.silly("Ignoring appendLine(" + x + ", " + y + ") operation");
    };
    /**
    `x1 y1 x2 y2 x3 y3 c`
    */
    ContentStreamReader.prototype.appendCurve123 = function (x1, y1, x2, y2, x3, y3) {
        logger.silly("Ignoring appendCurve123(" + x1 + ", " + y1 + ", " + x2 + ", " + y2 + ", " + x3 + ", " + y3 + ") operation");
    };
    /**
    `x2 y2 x3 y3 v`
    */
    ContentStreamReader.prototype.appendCurve23 = function (x2, y2, x3, y3) {
        logger.silly("Ignoring appendCurve23(" + x2 + ", " + y2 + ", " + x3 + ", " + y3 + ") operation");
    };
    /**
    `x1 y1 x3 y3 y`
    */
    ContentStreamReader.prototype.appendCurve13 = function (x1, y1, x3, y3) {
        logger.silly("Ignoring appendCurve13(" + x1 + ", " + y1 + ", " + x3 + ", " + y3 + ") operation");
    };
    /**
    `h`
    */
    ContentStreamReader.prototype.closePath = function () {
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
    ContentStreamReader.prototype.appendRectangle = function (x, y, width, height) {
        logger.silly("Ignoring appendRectangle(" + x + ", " + y + ", " + width + ", " + height + ") operation");
    };
    // ---------------------------------------------------------------------------
    // Path painting (S, s, f, F, f*, B, B*, b, b*, n) - see Table 60
    /**
    > `S`: Stroke the path.
    */
    ContentStreamReader.prototype.stroke = function () {
        logger.silly("Ignoring stroke() operation");
    };
    /** ALIAS
    > `s`: Close and stroke the path. This operator shall have the same effect as the sequence h S.
    */
    ContentStreamReader.prototype.closeAndStroke = function () {
        this.closePath();
        this.stroke();
    };
    /**
    > `f`: Fill the path, using the nonzero winding number rule to determine the region to fill. Any subpaths that are open shall be implicitly closed before being filled.
    */
    ContentStreamReader.prototype.fill = function () {
        // this.closePath(); ?
        logger.silly("Ignoring fill() operation");
    };
    /** ALIAS
    > `F`: Equivalent to f; included only for compatibility. Although PDF reader applications shall be able to accept this operator, PDF writer applications should use f instead.
    */
    ContentStreamReader.prototype.fillCompat = function () {
        this.fill();
    };
    /**
    > `f*`: Fill the path, using the even-odd rule to determine the region to fill.
    */
    ContentStreamReader.prototype.fillEvenOdd = function () {
        logger.silly("Ignoring fillEvenOdd() operation");
    };
    /**
    > `B`: Fill and then stroke the path, using the nonzero winding number rule to determine the region to fill. This operator shall produce the same result as constructing two identical path objects, painting the first with f and the second with S.
    > NOTE The filling and stroking portions of the operation consult different values of several graphics state parameters, such as the current colour.
    */
    ContentStreamReader.prototype.fillThenStroke = function () {
        logger.silly("Ignoring fillAndStroke() operation");
    };
    /**
    > `B*`: Fill and then stroke the path, using the even-odd rule to determine the region to fill. This operator shall produce the same result as B, except that the path is filled as if with f* instead of f.
    */
    ContentStreamReader.prototype.fillThenStrokeEvenOdd = function () {
        logger.silly("Ignoring fillAndStrokeEvenOdd() operation");
    };
    /** ALIAS
    > `b`: Close, fill, and then stroke the path, using the nonzero winding number rule to determine the region to fill. This operator shall have the same effect as the sequence h B.
    */
    ContentStreamReader.prototype.closeAndFillThenStroke = function () {
        this.closePath();
        this.fillThenStroke();
    };
    /** ALIAS
    > `b*`: Close, fill, and then stroke the path, using the even-odd rule to determine the region to fill. This operator shall have the same effect as the sequence h B*.
    */
    ContentStreamReader.prototype.closeAndFillThenStrokeEvenOdd = function () {
        this.closePath();
        this.fillThenStrokeEvenOdd();
    };
    /**
    > `n`: End the path object without filling or stroking it. This operator shall be a path- painting no-op, used primarily for the side effect of changing the current clipping path.
    */
    ContentStreamReader.prototype.closePathNoop = function () {
        logger.silly("Ignoring closePathNoop() operation");
    };
    // ---------------------------------------------------------------------------
    //                           Color operators
    /**
    > `name CS`
    */
    ContentStreamReader.prototype.setStrokeColorSpace = function (name) {
        logger.silly("Ignoring setStrokeColorSpace(" + name + ") operation");
    };
    /**
    > `name cs`: Same as CS but used for nonstroking operations.
    */
    ContentStreamReader.prototype.setFillColorSpace = function (name) {
        logger.silly("Ignoring setFillColorSpace(" + name + ") operation");
    };
    /**
    > `c1 cn SC`
    */
    ContentStreamReader.prototype.setStrokeColorSpace2 = function (c1, cn) {
        logger.silly("Ignoring setStrokeColorSpace2(" + c1 + ", " + cn + ") operation");
    };
    /**
    > `c1 cn [name] SCN`
    */
    ContentStreamReader.prototype.setStrokeColorSpace3 = function (c1, cn, patternName) {
        logger.silly("Ignoring setStrokeColorSpace3(" + c1 + ", " + cn + ", " + patternName + ") operation");
    };
    /**
    > `c1 cn sc`: Same as SC but used for nonstroking operations.
    */
    ContentStreamReader.prototype.setFillColorSpace2 = function (c1, cn) {
        logger.silly("Ignoring setFillColorSpace2(" + c1 + ", " + cn + ") operation");
    };
    /**
    > `c1 cn [name] scn`: Same as SCN but used for nonstroking operations.
    */
    ContentStreamReader.prototype.setFillColorSpace3 = function (c1, cn, patternName) {
        logger.silly("Ignoring setFillColorSpace3(" + c1 + ", " + cn + ", " + patternName + ") operation");
    };
    /**
    `gray G`: Set the stroking colour space to DeviceGray and set the gray level
    to use for stroking operations. `gray` shall be a number between 0.0 (black)
    and 1.0 (white).
    */
    ContentStreamReader.prototype.setStrokeGray = function (gray) {
        this.context.graphicsState.strokeColor = new color_1.GrayColor(gray);
    };
    /**
    `gray g`: Same as G but used for nonstroking operations.
    */
    ContentStreamReader.prototype.setFillGray = function (gray) {
        this.context.graphicsState.fillColor = new color_1.GrayColor(gray);
    };
    /**
    `r g b RG`: Set the stroking colour space to DeviceRGB (or the DefaultRGB colour space; see 8.6.5.6, "Default Colour Spaces") and set the colour to use for stroking operations. Each operand shall be a number between 0.0 (minimum intensity) and 1.0 (maximum intensity).
    */
    ContentStreamReader.prototype.setStrokeColor = function (r, g, b) {
        this.context.graphicsState.strokeColor = new color_1.RGBColor(r, g, b);
    };
    /**
    `r g b rg`: Same as RG but used for nonstroking operations.
    */
    ContentStreamReader.prototype.setFillColor = function (r, g, b) {
        this.context.graphicsState.fillColor = new color_1.RGBColor(r, g, b);
    };
    /**
    > `c m y k K`: Set the stroking colour space to DeviceCMYK (or the DefaultCMYK colour space) and set the colour to use for stroking operations. Each operand shall be a number between 0.0 (zero concentration) and 1.0 (maximum concentration).
    */
    ContentStreamReader.prototype.setStrokeCMYK = function (c, m, y, k) {
        this.context.graphicsState.strokeColor = new color_1.CMYKColor(c, m, y, k);
    };
    /**
    > `c m y k k`: Same as K but used for nonstroking operations.
    */
    ContentStreamReader.prototype.setFillCMYK = function (c, m, y, k) {
        this.context.graphicsState.fillColor = new color_1.CMYKColor(c, m, y, k);
    };
    // ---------------------------------------------------------------------------
    // Clipping Path Operators (W, W*)
    /**
    > `W`: Modify the current clipping path by intersecting it with the current path, using the nonzero winding number rule to determine which regions lie inside the clipping path.
    */
    ContentStreamReader.prototype.clip = function () {
        logger.silly("Ignoring clip() operation");
    };
    /**
    > `W*`: Modify the current clipping path by intersecting it with the current path, using the even-odd rule to determine which regions lie inside the clipping path.
    */
    ContentStreamReader.prototype.clipEvenOdd = function () {
        logger.silly("Ignoring clipEvenOdd() operation");
    };
    // ---------------------------------------------------------------------------
    // Text objects (BT, ET)
    /** `BT` */
    ContentStreamReader.prototype.startTextBlock = function () {
        this.context.textMatrix = this.context.textLineMatrix = math_1.mat3ident;
    };
    /** `ET` */
    ContentStreamReader.prototype.endTextBlock = function () {
        this.context.textMatrix = this.context.textLineMatrix = null;
    };
    // ---------------------------------------------------------------------------
    // Text state operators (Tc, Tw, Tz, TL, Tf, Tr, Ts) - see PDF32000_2008.pdf:9.3.1
    /**
    > `charSpace Tc`: Set the character spacing, Tc, to charSpace, which shall
    > be a number expressed in unscaled text space units. Character spacing shall
    > be used by the Tj, TJ, and ' operators. Initial value: 0.
    */
    ContentStreamReader.prototype.setCharSpacing = function (charSpace) {
        this.context.textState.charSpacing = charSpace;
    };
    /**
    > `wordSpace Tw`: Set the word spacing, Tw, to wordSpace, which shall be a
    > number expressed in unscaled text space units. Word spacing shall be used
    > by the Tj, TJ, and ' operators. Initial value: 0.
    */
    ContentStreamReader.prototype.setWordSpacing = function (wordSpace) {
        this.context.textState.wordSpacing = wordSpace;
    };
    /**
    > `scale Tz`: Set the horizontal scaling, Th, to (scale ÷ 100). scale shall
    > be a number specifying the percentage of the normal width. Initial value:
    > 100 (normal width).
    */
    ContentStreamReader.prototype.setHorizontalScale = function (scale) {
        this.context.textState.horizontalScaling = scale;
    };
    /**
    > `leading TL`: Set the text leading, Tl, to leading, which shall be a number
    > expressed in unscaled text space units. Text leading shall be used only by
    > the T*, ', and " operators. Initial value: 0.
    */
    ContentStreamReader.prototype.setLeading = function (leading) {
        this.context.textState.leading = leading;
    };
    /**
    > `font size Tf`: Set the text font, Tf, to font and the text font size,
    > Tfs, to size. font shall be the name of a font resource in the Font
    > subdictionary of the current resource dictionary; size shall be a number
    > representing a scale factor. There is no initial value for either font or
    > size; they shall be specified explicitly by using Tf before any text is
    > shown.
    */
    ContentStreamReader.prototype.setFont = function (font, size) {
        this.context.textState.fontName = font;
        this.context.textState.fontSize = size;
    };
    /**
    > `render Tr`: Set the text rendering mode, Tmode, to render, which shall
    > be an integer. Initial value: 0.
    */
    ContentStreamReader.prototype.setRenderingMode = function (render) {
        this.context.textState.renderingMode = render;
    };
    /**
    > `rise Ts`: Set the text rise, Trise, to rise, which shall be a number expressed in unscaled text space units. Initial value: 0.
    */
    ContentStreamReader.prototype.setRise = function (rise) {
        this.context.textState.rise = rise;
    };
    // ---------------------------------------------------------------------------
    // Text positioning operators (Td, TD, Tm, T*)
    /**
    > `x y Td`: Move to the start of the next line, offset from the start of the
    > current line by (tx, ty). tx and ty shall denote numbers expressed in
    > unscaled text space units. More precisely, this operator shall perform
    > these assignments: Tm = Tlm = [ [1 0 0], [0 1 0], [x y 1] ] x Tlm
    */
    ContentStreamReader.prototype.adjustCurrentPosition = function (x, y) {
        // y is usually 0, and never positive in normal text.
        var newTextMatrix = math_1.mat3mul([1, 0, 0,
            0, 1, 0,
            x, y, 1], this.context.textLineMatrix);
        this.context.textMatrix = this.context.textLineMatrix = newTextMatrix;
    };
    /** COMPLETE (ALIAS)
    > `x y TD`: Move to the start of the next line, offset from the start of the
    > current line by (x, y). As a side effect, this operator shall set the
    > leading parameter in the text state. This operator shall have the same
    > effect as this code: `-ty TL tx ty Td`
    */
    ContentStreamReader.prototype.adjustCurrentPositionWithLeading = function (x, y) {
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
    ContentStreamReader.prototype.setTextMatrix = function (a, b, c, d, e, f) {
        // calling setTextMatrix(1, 0, 0, 1, 0, 0) sets it to the identity matrix
        // e and f mark the x and y coordinates of the current position
        var newTextMatrix = [a, b, 0,
            c, d, 0,
            e, f, 1];
        this.context.textMatrix = this.context.textLineMatrix = newTextMatrix;
    };
    /** COMPLETE (ALIAS)
    > `T*`: Move to the start of the next line. This operator has the same effect
    > as the code `0 -Tl Td` where Tl denotes the current leading parameter in the
    > text state. The negative of Tl is used here because Tl is the text leading
    > expressed as a positive number. Going to the next line entails decreasing
    > the y coordinate.
    */
    ContentStreamReader.prototype.newLine = function () {
        this.adjustCurrentPosition(0, -this.context.textState.leading);
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
    ContentStreamReader.prototype.showString = function (string) {
        this.context.drawGlyphs(string, this.getFont());
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
    ContentStreamReader.prototype.showStrings = function (array) {
        this.context.drawTextArray(array, this.getFont());
    };
    /** COMPLETE (ALIAS)
    > `string '` Move to the next line and show a text string. This operator shall have
    > the same effect as the code `T* string Tj`
    */
    ContentStreamReader.prototype.newLineAndShowString = function (string) {
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
    ContentStreamReader.prototype.newLineAndShowStringWithSpacing = function (wordSpace, charSpace, string) {
        this.setWordSpacing(wordSpace); // Tw
        this.setCharSpacing(charSpace); // Tc
        this.newLineAndShowString(string); // '
    };
    // ---------------------------------------------------------------------------
    // Marked content (BMC, BDC, EMC)
    /**
    > `tag BMC`: Begin a marked-content sequence terminated by a balancing EMC operator. tag shall be a name object indicating the role or significance of the sequence.
    */
    ContentStreamReader.prototype.beginMarkedContent = function (tag) {
        logger.silly("Ignoring beginMarkedContent(" + tag + ") operation");
    };
    /**
    > `tag properties BDC`: Begin a marked-content sequence with an associated property list, terminated by a balancing EMC operator. tag shall be a name object indicating the role or significance of the sequence. properties shall be either an inline dictionary containing the property list or a name object associated with it in the Properties subdictionary of the current resource dictionary.
    */
    ContentStreamReader.prototype.beginMarkedContentWithDictionary = function (tag, dictionary) {
        logger.silly("Ignoring beginMarkedContentWithDictionary(" + tag + ", " + dictionary + ") operation");
    };
    /**
    > `EMC`: End a marked-content sequence begun by a BMC or BDC operator.
    */
    ContentStreamReader.prototype.endMarkedContent = function () {
        logger.silly("Ignoring endMarkedContent() operation");
    };
    return ContentStreamReader;
})();
exports.ContentStreamReader = ContentStreamReader;
