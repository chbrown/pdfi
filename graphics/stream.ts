
import {logger} from '../logger';
import {Font} from '../font/index';
import {Resources} from '../models';
import {clone} from '../util';
import {parseContentStream} from '../parsers/index';

import {Point, Size, Mat3, mat3mul, mat3ident} from './geometry';

export class Color {
  clone(): Color { return new Color(); }
  toString(): string {
    return 'none';
  }
}

export class RGBColor extends Color {
  constructor(public r: number, public g: number, public b: number) { super() }
  clone(): RGBColor { return new RGBColor(this.r, this.g, this.b); }
  toString(): string {
    return `rgb(${this.r}, ${this.g}, ${this.b})`;
  }
}

export class GrayColor extends Color {
  constructor(public alpha: number) { super() }
  clone(): GrayColor { return new GrayColor(this.alpha); }
  toString(): string {
    return `rgb(${this.alpha}, ${this.alpha}, ${this.alpha})`;
  }
}

export class CMYKColor extends Color {
  constructor(public c: number, public m: number, public y: number, public k: number) { super() }
  clone(): CMYKColor { return new CMYKColor(this.c, this.m, this.y, this.k); }
  toString(): string {
    return `cmyk(${this.c}, ${this.m}, ${this.y}, ${this.k})`;
  }
}

// Rendering mode: see PDF32000_2008.pdf:9.3.6, Table 106
export enum RenderingMode {
  Fill = 0,
  Stroke = 1,
  FillThenStroke = 2,
  None = 3,
  FillClipping = 4,
  StrokeClipping = 5,
  FillThenStrokeClipping = 6,
  NoneClipping = 7,
}

// Line Cap Style: see PDF32000_2008.pdf:8.4.3.3, Table 54
export enum LineCapStyle {
  Butt = 0,
  Round = 1,
  ProjectingSquare = 2,
}

// Line Join Style: see PDF32000_2008.pdf:8.4.3.4, Table 55
export enum LineJoinStyle {
  Miter = 0,
  Round = 1,
  Bevel = 2,
}

export class TextState {
  charSpacing: number = 0;
  wordSpacing: number = 0;
  horizontalScaling: number = 100;
  leading: number = 0;
  fontName: string;
  fontSize: number;
  renderingMode: RenderingMode = RenderingMode.Fill;
  rise: number = 0;

  clone(): TextState {
    return clone(this, new TextState());
  }
}

/**
We need to be able to clone it since we need a copy when we process a
`pushGraphicsState` (`q`) command, and it'd be easier to clone if the variables
were in the constructor, but there are a lot of variables!
*/
export class GraphicsState {
  ctMatrix: Mat3 = mat3ident; // defaults to the identity matrix
  strokeColor: Color = new Color();
  fillColor: Color = new Color();
  lineWidth: number;
  lineCap: LineCapStyle;
  lineJoin: LineJoinStyle;
  miterLimit: number;
  dashArray: number[];
  dashPhase: number;
  renderingIntent: string; // not sure if it's actually this type?
  flatnessTolerance: number;

  textState: TextState = new TextState();

  /**
  clone() creates an blank new GraphicsState object and recursively copies all
  of `this`'s properties to it.
  */
  clone(): GraphicsState {
    return clone(this, new GraphicsState());
  }
}

/**
DrawingContext is kind of like a Canvas state, keeping track of where we are in
painting the canvas. It's an abstraction away from the content stream and the
rest of the PDF.

the textState persists across BT and ET markers, and can be modified anywhere
the textMatrix and textLineMatrix do not persist between distinct BT ... ET blocks

I don't think textState transfers to (or out of) "Do"-drawn XObjects.
E.g., P13-4028.pdf breaks if textState carries out of the drawn object.
*/
export abstract class DrawingContext {
  resourcesStack: Resources[];
  graphicsStateStack: GraphicsState[];
  /**
  textMatrix is a full 3x3 transformation matrix, even though the values at
  [2], [5], and [8] cannot be changed.
  */
  textMatrix: Mat3;
  /**
  textLineMatrix operates much like textMatrix; see the docs for textMatrix
  */
  textLineMatrix: Mat3;

  constructor(resources: Resources, graphicsState: GraphicsState) {
    this.resourcesStack = [resources];
    this.graphicsStateStack = [graphicsState];
  }

  get graphicsState(): GraphicsState {
    return this.graphicsStateStack[this.graphicsStateStack.length - 1];
  }

  get resources(): Resources {
    return this.resourcesStack[this.resourcesStack.length - 1];
  }

  /**
  This is called from the various text drawing operations, like showString and showStrings.

  This function only works / is only correct for horizontal writing mode.

  It modifies {this.textMatrix}, and returns the amount of x translation.

  Reference: PDF32000_2008.pdf:9.4.4
  */
  protected advanceTextMatrix(width_units: number, chars: number, spaces: number): number {
    const {textState: {fontSize, charSpacing, wordSpacing, horizontalScaling}} = this.graphicsState;
    // width_units is positive, but we want to move forward, so tx should be positive too
    const tx = (((width_units / 1000) * fontSize) + (charSpacing * chars) + (wordSpacing * spaces)) *
               (horizontalScaling / 100.0);
    const [a, b, , c, d, , e, f] = this.textMatrix;
    this.textMatrix = [a, b, 0, c, d, 0, tx * a + e, tx * b + f, 1];
    return tx;
  }
  /**
  Compute the current drawing space text insertion point by combining
  {this.graphicsState} and {this.textMatrix}.

  In the specifications formulas, 'fs' is replaced by `fontSize` and 'fsh' is
  replaced by `fontSize * (horizontalScaling / 100.0)`.
  */
  protected getTextPosition(): Point {
    const {textState: {fontSize, horizontalScaling, rise}, ctMatrix} = this.graphicsState;
    // TODO: optimize this final matrix multiplication; we only need two of the
    // entries, and we discard the rest, so we don't need to calculate them in
    // the first place.
    const composedTransformation = mat3mul(this.textMatrix, ctMatrix);
    return {
      x: (rise * composedTransformation[3]) + (composedTransformation[6]),
      y: (rise * composedTransformation[4]) + (composedTransformation[7]),
    };
  }
  /**
  Compute the current font size by combining a limited number of properties from
  the {this.graphicsState} and {this.textMatrix} values.

  This only scales / skews the size of the font; it ignore the positions of the textMatrix / ctMatrix.
  */
  protected getTextSize(): number {
    const {textState: {fontSize}, ctMatrix} = this.graphicsState;
    const d = (this.textMatrix[3] * ctMatrix[1]) + (this.textMatrix[4] * ctMatrix[4]) + (this.textMatrix[5] * ctMatrix[7]);
    return (d * fontSize);
  }

  // ###########################################################################
  // content stream operators interpreters

  // ---------------------------------------------------------------------------
  // Special graphics states (q, Q, cm)
  /**
  > `q`: Save the current graphics state on the graphics state stack (see 8.4.2).
  */
  pushGraphicsState() {
    this.graphicsStateStack.push(this.graphicsState.clone());
  }
  /**
  > `Q`: Restore the graphics state by removing the most recently saved state
  > from the stack and making it the current state (see 8.4.2).
  */
  popGraphicsState() {
    this.graphicsStateStack.pop();
  }
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
  setCTM(a: number, b: number, c: number, d: number, e: number, f: number) {
    const newCTMatrix = mat3mul([a, b, 0,
                                 c, d, 0,
                                 e, f, 1], this.graphicsState.ctMatrix);
    this.graphicsState.ctMatrix = newCTMatrix;
  }
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
  abstract drawObject(name: string);
  // ---------------------------------------------------------------------------
  // General graphics state (w, J, j, M, d, ri, i, gs)
  /**
  > `lineWidth w`: Set the line width in the graphics state.
  */
  setLineWidth(lineWidth: number) {
    this.graphicsState.lineWidth = lineWidth;
  }
  /**
  > `lineCap J`: Set the line cap style in the graphics state.
  */
  setLineCap(lineCap: LineCapStyle) {
    this.graphicsState.lineCap = lineCap;
  }
  /**
  > `lineJoin j`: Set the line join style in the graphics state.
  */
  setLineJoin(lineJoin: LineJoinStyle) {
    this.graphicsState.lineJoin = lineJoin;
  }
  /**
  > `miterLimit M`: Set the miter limit in the graphics state.
  */
  setMiterLimit(miterLimit: number) {
    this.graphicsState.miterLimit = miterLimit;
  }
  /**
  > `dashArray dashPhase d`: Set the line dash pattern in the graphics state.
  */
  setDashPattern(dashArray: number[], dashPhase: number) {
    this.graphicsState.dashArray = dashArray;
    this.graphicsState.dashPhase = dashPhase;
  }
  /**
  > `intent ri`: Set the colour rendering intent in the graphics state.
  > (PDF 1.1)
  */
  setRenderingIntent(intent: string) {
    this.graphicsState.renderingIntent = intent;
  }
  /**
  > `flatness i`: Set the flatness tolerance in the graphics state. flatness is
  > a number in the range 0 to 100; a value of 0 shall specify the output
  > device's default flatness tolerance.
  */
  setFlatnessTolerance(flatness: number) {
    this.graphicsState.flatnessTolerance = flatness;
  }
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
  setGraphicsStateParameters(dictName: string) {
    const ExtGState = this.resources.getExtGState(dictName);
    Object.keys(ExtGState.object).filter(key => key !== 'Type').forEach(key => {
      const value = ExtGState.get(key);
      const valueJSON = JSON.stringify(value);
      logger.debug(`Ignoring setGraphicsStateParameters(${dictName}) operation: ${key} = ${valueJSON}`);
    });
  }
  // ---------------------------------------------------------------------------
  // Path construction (m, l, c, v, y, h, re) - see Table 59
  /**
  `x y m`
  */
  moveTo(x: number, y: number) {
    logger.debug(`Ignoring moveTo(${x}, ${y}) operation`);
  }
  /**
  `x y l`
  */
  appendLine(x: number, y: number) {
    logger.debug(`Ignoring appendLine(${x}, ${y}) operation`);
  }
  /**
  `x1 y1 x2 y2 x3 y3 c`
  */
  appendCurve123(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    logger.debug(`Ignoring appendCurve123(${x1}, ${y1}, ${x2}, ${y2}, ${x3}, ${y3}) operation`);
  }
  /**
  `x2 y2 x3 y3 v`
  */
  appendCurve23(x2: number, y2: number, x3: number, y3: number) {
    logger.debug(`Ignoring appendCurve23(${x2}, ${y2}, ${x3}, ${y3}) operation`);
  }
  /**
  `x1 y1 x3 y3 y`
  */
  appendCurve13(x1: number, y1: number, x3: number, y3: number) {
    logger.debug(`Ignoring appendCurve13(${x1}, ${y1}, ${x3}, ${y3}) operation`);
  }
  /**
  `h`
  */
  closePath() {
    logger.debug('Ignoring closePath() operation');
  }
  /**
  > `x y width height re`: Append a rectangle to the current path as a complete
  > subpath, with lower-left corner (x, y) and dimensions width and height in
  > user space. The operation `x y width height re` is equivalent to:
  >     x y m
  >     (x + width) y l
  >     (x + width) (y + height) l x (y + height) l
  >     h
  */
  appendRectangle(x: number, y: number, width: number, height: number) {
    logger.debug(`Ignoring appendRectangle(${x}, ${y}, ${width}, ${height}) operation`);
  }
  // ---------------------------------------------------------------------------
  // Path painting (S, s, f, F, f*, B, B*, b, b*, n) - see Table 60
  /**
  > `S`: Stroke the path.
  */
  stroke() {
    logger.debug('Ignoring stroke() operation');
  }
  /** ALIAS
  > `s`: Close and stroke the path. This operator shall have the same effect as the sequence h S.
  */
  closeAndStroke() {
    this.closePath();
    this.stroke();
  }
  /**
  > `f`: Fill the path, using the nonzero winding number rule to determine the region to fill. Any subpaths that are open shall be implicitly closed before being filled.
  */
  fill() {
    // this.closePath(); ?
    logger.debug('Ignoring fill() operation');
  }
  /** ALIAS
  > `F`: Equivalent to f; included only for compatibility. Although PDF reader applications shall be able to accept this operator, PDF writer applications should use f instead.
  */
  fillCompat() {
    this.fill();
  }
  /**
  > `f*`: Fill the path, using the even-odd rule to determine the region to fill.
  */
  fillEvenOdd() {
    logger.debug('Ignoring fillEvenOdd() operation');
  }
  /**
  > `B`: Fill and then stroke the path, using the nonzero winding number rule to determine the region to fill. This operator shall produce the same result as constructing two identical path objects, painting the first with f and the second with S.
  > NOTE The filling and stroking portions of the operation consult different values of several graphics state parameters, such as the current colour.
  */
  fillThenStroke() {
    logger.debug('Ignoring fillAndStroke() operation');
  }
  /**
  > `B*`: Fill and then stroke the path, using the even-odd rule to determine the region to fill. This operator shall produce the same result as B, except that the path is filled as if with f* instead of f.
  */
  fillThenStrokeEvenOdd() {
    logger.debug('Ignoring fillAndStrokeEvenOdd() operation');
  }
  /** ALIAS
  > `b`: Close, fill, and then stroke the path, using the nonzero winding number rule to determine the region to fill. This operator shall have the same effect as the sequence h B.
  */
  closeAndFillThenStroke() {
    this.closePath();
    this.fillThenStroke();
  }
  /** ALIAS
  > `b*`: Close, fill, and then stroke the path, using the even-odd rule to determine the region to fill. This operator shall have the same effect as the sequence h B*.
  */
  closeAndFillThenStrokeEvenOdd() {
    this.closePath();
    this.fillThenStrokeEvenOdd();
  }
  /**
  > `n`: End the path object without filling or stroking it. This operator shall be a path- painting no-op, used primarily for the side effect of changing the current clipping path.
  */
  closePathNoop() {
    logger.debug('Ignoring closePathNoop() operation');
  }
  // ---------------------------------------------------------------------------
  //                           Color operators
  /**
  > `name CS`
  */
  setStrokeColorSpace(name: string) {
    logger.debug(`Ignoring setStrokeColorSpace(${name}) operation`);
  }
  /**
  > `name cs`: Same as CS but used for nonstroking operations.
  */
  setFillColorSpace(name: string) {
    logger.debug(`Ignoring setFillColorSpace(${name}) operation`);
  }
  /**
  > `c1 cn SC`
  */
  setStrokeColorSpace2(c1: number, cn: number) {
    logger.debug(`Ignoring setStrokeColorSpace2(${c1}, ${cn}) operation`);
  }
  /**
  > `c1 cn [name] SCN`
  */
  setStrokeColorSpace3(c1: number, cn: number, patternName?: string) {
    logger.debug(`Ignoring setStrokeColorSpace3(${c1}, ${cn}, ${patternName}) operation`);
  }
  /**
  > `c1 cn sc`: Same as SC but used for nonstroking operations.
  */
  setFillColorSpace2(c1: number, cn: number) {
    logger.debug(`Ignoring setFillColorSpace2(${c1}, ${cn}) operation`);
  }
  /**
  > `c1 cn [name] scn`: Same as SCN but used for nonstroking operations.
  */
  setFillColorSpace3(c1: number, cn: number, patternName?: string) {
    logger.debug(`Ignoring setFillColorSpace3(${c1}, ${cn}, ${patternName}) operation`);
  }
  /**
  `gray G`: Set the stroking colour space to DeviceGray and set the gray level
  to use for stroking operations. `gray` shall be a number between 0.0 (black)
  and 1.0 (white).
  */
  setStrokeGray(gray: number) {
    this.graphicsState.strokeColor = new GrayColor(gray);
  }
  /**
  `gray g`: Same as G but used for nonstroking operations.
  */
  setFillGray(gray: number) {
    this.graphicsState.fillColor = new GrayColor(gray);
  }
  /**
  `r g b RG`: Set the stroking colour space to DeviceRGB (or the DefaultRGB colour space; see 8.6.5.6, "Default Colour Spaces") and set the colour to use for stroking operations. Each operand shall be a number between 0.0 (minimum intensity) and 1.0 (maximum intensity).
  */
  setStrokeColor(r: number, g: number, b: number) {
    this.graphicsState.strokeColor = new RGBColor(r, g, b);
  }
  /**
  `r g b rg`: Same as RG but used for nonstroking operations.
  */
  setFillColor(r: number, g: number, b: number) {
    this.graphicsState.fillColor = new RGBColor(r, g, b);
  }
  /**
  > `c m y k K`: Set the stroking colour space to DeviceCMYK (or the DefaultCMYK colour space) and set the colour to use for stroking operations. Each operand shall be a number between 0.0 (zero concentration) and 1.0 (maximum concentration).
  */
  setStrokeCMYK(c: number, m: number, y: number, k: number) {
    this.graphicsState.strokeColor = new CMYKColor(c, m, y, k);
  }
  /**
  > `c m y k k`: Same as K but used for nonstroking operations.
  */
  setFillCMYK(c: number, m: number, y: number, k: number) {
    this.graphicsState.fillColor = new CMYKColor(c, m, y, k);
  }
  // ---------------------------------------------------------------------------
  // Shading Pattern Operator (sh)
  /**
  > `name sh`: Paint the shape and colour shading described by a shading dictionary, subject to the current clipping path. The current colour in the graphics state is neither used nor altered. The effect is different from that of painting a path using a shading pattern as the current colour.
  > name is the name of a shading dictionary resource in the Shading subdictionary of the current resource dictionary. All coordinates in the shading dictionary are interpreted relative to the current user space. (By contrast, when a shading dictionary is used in a type 2 pattern, the coordinates are expressed in pattern space.) All colours are interpreted in the colour space identified by the shading dictionary’s ColorSpace entry. The Background entry, if present, is ignored.
  > This operator should be applied only to bounded or geometrically defined shadings. If applied to an unbounded shading, it paints the shading’s gradient fill across the entire clipping region, which may be time-consuming.
  */
  shadingPattern(name: string) {
    logger.debug(`Ignoring shadingPattern(${name}) operation`);
  }
  // ---------------------------------------------------------------------------
  // Inline Image Operators (BI, ID, EI)
  beginInlineImage() {
    logger.debug('Ignoring beginInlineImage() operation');
  }
  endInlineImage(...args: any[]) {
    logger.debug('Ignoring endInlineImage() operation');
  }
  // ---------------------------------------------------------------------------
  // Clipping Path Operators (W, W*)
  /**
  > `W`: Modify the current clipping path by intersecting it with the current path, using the nonzero winding number rule to determine which regions lie inside the clipping path.
  */
  clip() {
    logger.debug('Ignoring clip() operation');
  }
  /**
  > `W*`: Modify the current clipping path by intersecting it with the current path, using the even-odd rule to determine which regions lie inside the clipping path.
  */
  clipEvenOdd() {
    logger.debug('Ignoring clipEvenOdd() operation');
  }
  // ---------------------------------------------------------------------------
  // Text objects (BT, ET)
  /** `BT` */
  startTextBlock() {
    this.textMatrix = this.textLineMatrix = mat3ident;
  }
  /** `ET` */
  endTextBlock() {
    this.textMatrix = this.textLineMatrix = undefined;
  }
  // ---------------------------------------------------------------------------
  // Text state operators (Tc, Tw, Tz, TL, Tf, Tr, Ts) - see PDF32000_2008.pdf:9.3.1
  /**
  > `charSpace Tc`: Set the character spacing, Tc, to charSpace, which shall
  > be a number expressed in unscaled text space units. Character spacing shall
  > be used by the Tj, TJ, and ' operators. Initial value: 0.
  */
  setCharSpacing(charSpace: number) {
    this.graphicsState.textState.charSpacing = charSpace;
  }
  /**
  > `wordSpace Tw`: Set the word spacing, Tw, to wordSpace, which shall be a
  > number expressed in unscaled text space units. Word spacing shall be used
  > by the Tj, TJ, and ' operators. Initial value: 0.
  */
  setWordSpacing(wordSpace: number) {
    this.graphicsState.textState.wordSpacing = wordSpace;
  }
  /**
  > `scale Tz`: Set the horizontal scaling, Th, to (scale ÷ 100). scale shall
  > be a number specifying the percentage of the normal width. Initial value:
  > 100 (normal width).
  */
  setHorizontalScale(scale: number) { // a percentage
    this.graphicsState.textState.horizontalScaling = scale;
  }
  /**
  > `leading TL`: Set the text leading, Tl, to leading, which shall be a number
  > expressed in unscaled text space units. Text leading shall be used only by
  > the T*, ', and " operators. Initial value: 0.
  */
  setLeading(leading: number) {
    this.graphicsState.textState.leading = leading;
  }
  /**
  > `font size Tf`: Set the text font, Tf, to font and the text font size,
  > Tfs, to size. font shall be the name of a font resource in the Font
  > subdictionary of the current resource dictionary; size shall be a number
  > representing a scale factor. There is no initial value for either font or
  > size; they shall be specified explicitly by using Tf before any text is
  > shown.
  */
  setFont(font: string, size: number) {
    this.graphicsState.textState.fontName = font;
    this.graphicsState.textState.fontSize = size;
  }
  /**
  > `render Tr`: Set the text rendering mode, Tmode, to render, which shall
  > be an integer. Initial value: 0.
  */
  setRenderingMode(render: RenderingMode) {
    this.graphicsState.textState.renderingMode = render;
  }
  /**
  > `rise Ts`: Set the text rise, Trise, to rise, which shall be a number expressed in unscaled text space units. Initial value: 0.
  */
  setRise(rise: number) {
    this.graphicsState.textState.rise = rise;
  }
  // ---------------------------------------------------------------------------
  // Text positioning operators (Td, TD, Tm, T*)
  /**
  > `x y Td`: Move to the start of the next line, offset from the start of the
  > current line by (tx, ty). tx and ty shall denote numbers expressed in
  > unscaled text space units. More precisely, this operator shall perform
  > these assignments: Tm = Tlm = [ [1 0 0], [0 1 0], [x y 1] ] x Tlm
  */
  adjustCurrentPosition(x: number, y: number) {
    // y is usually 0, and never positive in normal text.
    const [a, b, , c, d, , e, f] = this.textLineMatrix;
    this.textMatrix = this.textLineMatrix = [a, b, 0,
                                             c, d, 0,
                                             (x * a) + (y * c) + e, (x * b) + (y * d) + f, 1];
  }
  /** COMPLETE (ALIAS)
  > `x y TD`: Move to the start of the next line, offset from the start of the
  > current line by (x, y). As a side effect, this operator shall set the
  > leading parameter in the text state. This operator shall have the same
  > effect as this code: `-ty TL tx ty Td`
  */
  adjustCurrentPositionWithLeading(x: number, y: number) {
    this.setLeading(-y); // TL
    this.adjustCurrentPosition(x, y); // Td
  }
  /**
  > `a b c d e f Tm`: Set the text matrix, Tm, and the text line matrix, Tlm:
  > Tm = Tlm = [ [a b 0], [c d 0], [e f 1] ]
  > The operands shall all be numbers, and the initial value for Tm and Tlm
  > shall be the identity matrix, [1 0 0 1 0 0]. Although the operands specify
  > a matrix, they shall be passed to Tm as six separate numbers, not as an
  > array. The matrix specified by the operands shall not be concatenated onto
  > the current text matrix, but shall replace it.
  */
  setTextMatrix(a: number, b: number, c: number, d: number, e: number, f: number) {
    // calling setTextMatrix(1, 0, 0, 1, 0, 0) sets it to the identity matrix
    // e and f mark the x and y coordinates of the current position
    const newTextMatrix: Mat3 = [a, b, 0,
                                 c, d, 0,
                                 e, f, 1];
    this.textMatrix = this.textLineMatrix = newTextMatrix;
  }
  /** COMPLETE (ALIAS)
  > `T*`: Move to the start of the next line. This operator has the same effect
  > as the code `0 -Tl Td` where Tl denotes the current leading parameter in the
  > text state. The negative of Tl is used here because Tl is the text leading
  > expressed as a positive number. Going to the next line entails decreasing
  > the y coordinate.
  */
  newLine() {
    this.adjustCurrentPosition(0, -this.graphicsState.textState.leading);
  }
  // ---------------------------------------------------------------------------
  // Text showing operators (Tj, TJ, ', ")
  /**
  > `string Tj`: Show a text string.

  `string` is a list of bytes (most often, character codes), each in the range
  [0, 256). Because parsing hex strings depends on the current font, we cannot
  resolve the bytes into character codes until rendered in the context of a
  textState.
  */
  abstract showString(buffer: Buffer);
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

  For each item in `array`:
    If item is a Buffer, that indicates a string of character codes
    If item is a plain number, that indicates a spacing shift
  */
  showStrings(array: Array<Buffer | number>) {
    array.forEach(item => {
      // each item is either a string (character code array) or a number
      if (Buffer.isBuffer(item)) {
        // if it's a character array, convert it to a unicode string and render it
        this.showString(item);
      }
      else { // if (typeof item === 'number')
        // negative numbers indicate forward (rightward) movement. if it's a
        // very negative number, it's like inserting a space. otherwise, it
        // only signifies a small manual spacing hack.
        this.advanceTextMatrix(-item, 0, 0);
      }
    })
  }
  /** COMPLETE (ALIAS)
  > `string '` Move to the next line and show a text string. This operator shall have
  > the same effect as the code `T* string Tj`
  */
  newLineAndShowString(buffer: Buffer) {
    this.newLine(); // T*
    this.showString(buffer); // Tj
  }
  /** COMPLETE (ALIAS)
  > `wordSpace charSpace text "` Move to the next line and show a text string,
  > using `wordSpace` as the word spacing and `charSpace` as the character
  > spacing (setting the corresponding parameters in the text state).
  > `wordSpace` and `charSpace` shall be numbers expressed in unscaled text
  > space units. This operator shall have the same effect as this code:
  > `wordSpace Tw charSpace Tc text '`
  */
  newLineAndShowStringWithSpacing(wordSpace: number, charSpace: number, buffer: Buffer) {
    this.setWordSpacing(wordSpace); // Tw
    this.setCharSpacing(charSpace); // Tc
    this.newLineAndShowString(buffer); // '
  }
  // ---------------------------------------------------------------------------
  // Marked content (BMC, BDC, EMC)
  /**
  > `tag BMC`: Begin a marked-content sequence terminated by a balancing EMC operator. tag shall be a name object indicating the role or significance of the sequence.
  */
  beginMarkedContent(tag: string) {
    logger.debug(`Ignoring beginMarkedContent(${tag}) operation`);
  }
  /**
  > `tag properties BDC`: Begin a marked-content sequence with an associated property list, terminated by a balancing EMC operator. tag shall be a name object indicating the role or significance of the sequence. properties shall be either an inline dictionary containing the property list or a name object associated with it in the Properties subdictionary of the current resource dictionary.
  */
  beginMarkedContentWithDictionary(tag: string, dictionary: any) {
    logger.debug(`Ignoring beginMarkedContentWithDictionary(${tag}, %j) operation`, dictionary);
  }
  /**
  > `EMC`: End a marked-content sequence begun by a BMC or BDC operator.
  */
  endMarkedContent() {
    logger.debug('Ignoring endMarkedContent() operation');
  }
}

/**
Add Resources tracking and drawObject support.
*/
export abstract class RecursiveDrawingContext extends DrawingContext {
  constructor(resources: Resources, public depth = 0) {
    super(resources, new GraphicsState());
  }

  applyOperation(operator: string, operands: any[]) {
    // logger.debug('applyOperation "%s": %j', operator, operands);
    const func = this[operator];
    if (func) {
      func.apply(this, operands);
    }
    else {
      logger.warning(`Ignoring unrecognized operator "${operator}" [${operands.join(', ')}]`);
    }
  }

  applyContentStream(content_stream_buffer: Buffer) {
    // read the operations and apply them
    const operations = parseContentStream(content_stream_buffer);
    operations.forEach(operation => this.applyOperation(operation.alias, operation.operands)) ;
  }

  /** Do */
  drawObject(name: string) {
    const XObjectStream = this.resources.getXObject(name);
    if (XObjectStream === undefined) {
      throw new Error(`Cannot draw undefined XObject: ${name}`);
    }

    if (XObjectStream.Subtype !== 'Form') {
      logger.debug(`Ignoring "${name} Do" command; embedded XObject has unsupported Subtype "${XObjectStream.Subtype}"`);
      return;
    }

    const object_depth = this.depth + 1;
    if (object_depth >= 5) {
      logger.warning(`Ignoring "${name} Do" command; embedded XObject is too deep; depth = ${object_depth}`);
      return;
    }

    logger.debug(`drawObject: rendering "${name}" at depth=${object_depth}`);

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
    // if the XObject itself has no resources, simply supply it with the current
    // resources (so that we can still pop it off in a bit either way)
    const nextResources = XObjectStream.Resources || this.resources;
    this.resourcesStack.push(nextResources);
    this.depth++;

    this.applyContentStream(XObjectStream.buffer);

    this.depth--;
    this.resourcesStack.pop();
    // e) pop the graphics state
    this.popGraphicsState();

    logger.debug(`drawObject: finished drawing "${name}"`);
  }
}

/**
fontSize is equivalent to height.
*/
export interface TextAtom extends Point, Size {
  fontName: string;
  font: Font;
  buffer: Buffer;
  // if text weren't a necessary side effect of measurement, it wouldn't be included here
  text: string;
}
export class TextAtomDrawingContext extends RecursiveDrawingContext {
  constructor(public textAtoms: TextAtom[], resources: Resources, depth = 0) {
    super(resources, depth);
  }
  /** Tj

  showString is called when processing a Tj ("showString") operation, and from
  showStrings, in turn.

  In the case of composite Fonts, each byte in `buffer` may not correspond to a
  single glyph, but for "simple" fonts, that is the case.
  */
  showString(buffer: Buffer) {
    const {fontName} = this.graphicsState.textState;
    // the Font instance handles most of the character code resolution
    const font = this.resources.getFont(fontName);
    if (!font) {
      // missing font -- will induce an error down the line pretty quickly
      throw new Error(`Cannot find font "${fontName}" in Resources: ${JSON.stringify(this.resources)}`);
    }
    const {x, y} = this.getTextPosition();
    const height = this.getTextSize();
    const width_units = font.measure(buffer);
    const text = font.decodeString(buffer, true);
    const nchars = text.length;
    // it's not actually clear from 9.3.3 Word Spacing whether we count SPACE (0x20 = 32)
    // codes that show up in the byte space or the glyph space
    const nspaces = (text.match(/ /g) || []).length;
    // adjust the text matrix accordingly (but not the text line matrix)
    // see the `... TJ` documentation, as well as PDF32000_2008.pdf:9.4.4
    this.advanceTextMatrix(width_units, nchars, nspaces);
    // TODO: avoid the full getTextPosition() calculation, when all we need is the current x
    const width = this.getTextPosition().x - x;
    this.textAtoms.push({x, y, width, height, fontName, font, buffer, text});
  }
}
