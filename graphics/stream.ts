/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');
import chalk = require('chalk');
import lexing = require('lexing');

import font = require('../font/index');
import models = require('../models');
import parser_states = require('../parsers/states');

import document = require('./document');
import {Point, Size, Rectangle, Color, GrayColor, RGBColor, CMYKColor} from './models';

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
  // Compatibility
    // incomplete: BX, EX
};

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
function mat3mul(A: number[], B: number[]): number[] {
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
function mat3add(A: number[], B: number[]): number[] {
  return [
    A[0] + B[0], A[1] + B[1], A[2] + B[2],
    A[3] + B[3], A[4] + B[4], A[5] + B[5],
    A[6] + B[6], A[7] + B[7], A[8] + B[8]
  ];
}
var mat3ident = [1, 0, 0,
                 0, 1, 0,
                 0, 0, 1];

function countSpaces(text: string): number {
  var matches = text.match(/ /g);
  return matches ? matches.length : 0;
}

function clone(source: any, target: any = {}): any {
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
class GraphicsState {
  public ctMatrix: number[] = mat3ident; // defaults to the identity matrix
  public strokeColor: Color = new Color();
  public fillColor: Color = new Color();
  public lineWidth: number;
  public lineCap: LineCapStyle;
  public lineJoin: LineJoinStyle;
  public miterLimit: number;
  public dashArray: number[];
  public dashPhase: number;
  public renderingIntent: string; // not sure if it's actually this type?
  public flatnessTolerance: number;

  clone(): GraphicsState {
    return clone(this, new GraphicsState());
  }
}

class TextState {
  charSpacing: number = 0;
  wordSpacing: number = 0;
  horizontalScaling: number = 100;
  leading: number = 0;
  fontName: string;
  fontSize: number;
  renderingMode: RenderingMode = 0;
  rise: number = 0;
}

export class DrawingContext {
  canvas: document.DocumentCanvas;
  stateStack: GraphicsState[] = [];
  // the textState persists across BT and ET markers, and can be modified anywhere
  textState: TextState = new TextState();
  // the textMatrix and textLineMatrix do not persist between distinct BT ... ET blocks
  textMatrix: number[];
  textLineMatrix: number[];

  constructor(public Resources: models.Resources,
              public graphicsState: GraphicsState = new GraphicsState(),
              public depth = 0) { }

  /**
  When we render a page, we specify a ContentStream as well as a Resources
  dictionary. That Resources dictionary may contain XObject streams that are
  embedded as `Do` operations in the main contents, as well as sub-Resources
  in those XObjects.
  */
  static renderPage(page: models.Page): document.DocumentCanvas {
    var pageBox = new Rectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
    var canvas = new document.DocumentCanvas(pageBox);

    var contents_string = page.joinContents('\n');
    var contents_string_iterable = new lexing.StringIterator(contents_string);

    var context = new DrawingContext(page.Resources);
    context.render(contents_string_iterable, canvas);

    return canvas;
  }

  render(string_iterable: lexing.StringIterable, canvas: document.DocumentCanvas): void {
    this.canvas = canvas;

    var operations = new parser_states.CONTENT_STREAM(string_iterable, 1024).read();

    operations.forEach(operation => {
      var operator_alias = operator_aliases[operation.operator];
      var operationFunction = this[operator_alias];
      if (operationFunction) {
        operationFunction.apply(this, operation.operands);
      }
      else {
        logger.warn(`Ignoring unimplemented operator "${operation.operator}" [${operation.operands.join(', ')}]`);
      }
    });
  }

  private advanceTextMatrix(width_units: number, chars: number, spaces: number): number {
    // width_units is positive, but we want to move forward, so tx should be positive too
    var tx = (((width_units / 1000) * this.textState.fontSize) +
        (this.textState.charSpacing * chars) +
        (this.textState.wordSpacing * spaces)) *
      (this.textState.horizontalScaling / 100.0);
    this.textMatrix = mat3mul([  1, 0, 0,
                                 0, 1, 0,
                                tx, 0, 1], this.textMatrix);
    return tx;
  }

  private getTextPosition(): Point {
    var fs = this.textState.fontSize;
    var fsh = fs * (this.textState.horizontalScaling / 100.0);
    var rise = this.textState.rise;
    var base = [fsh,    0, 0,
                  0,   fs, 0,
                  0, rise, 1];

    // TODO: optimize this final matrix multiplication; we only need two of the
    // entries, and we discard the rest, so we don't need to calculate them in
    // the first place.
    var composedTransformation = mat3mul(this.textMatrix, this.graphicsState.ctMatrix);
    var textRenderingMatrix = mat3mul(base, composedTransformation);
    return new Point(textRenderingMatrix[6], textRenderingMatrix[7]);
  }

  private getTextSize(): number {
    // only scale / skew the size of the font; ignore the position of the textMatrix / ctMatrix
    var mat = mat3mul(this.textMatrix, this.graphicsState.ctMatrix);
    var font_point = new Point(0, this.textState.fontSize);
    return font_point.transform(mat[0], mat[3], mat[1], mat[4]).y;
  }

  private _cached_fonts: {[index: string]: font.Font} = {};

  /**
  Retrieve a Font instance from the Resources' Font dictionary.

  Returns null if the dictionary has no `name` key.

  Caches Fonts (which is pretty hot when rendering a page),
  even missing ones (as null).
  */
  private getFont(name: string): font.Font {
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
      }
    }
    return cached_font;
  }

  private _renderGlyphs(bytes: number[]) {
    var font = this.getFont(this.textState.fontName);
    // the Font instance handles most of the character code resolution
    if (font === null) {
      throw new Error(`Cannot find font "${this.textState.fontName}" in Resources`);
    }
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
    var size = new Size(width, height);

    this.canvas.addSpan(string, origin, size, fontSize, this.textState.fontName);
  }

  private _renderTextArray(array: Array<number[] | number>) {
    array.forEach(item => {
      // each item is either a string (character code array) or a number
      if (Array.isArray(item)) {
        // if it's a character array, convert it to a unicode string and render it
        var bytes = <number[]>item;
        this._renderGlyphs(bytes);
      }
      else if (typeof item === 'number') {
        // negative numbers indicate forward (rightward) movement. if it's a
        // very negative number, it's like inserting a space. otherwise, it
        // only signifies a small manual spacing hack.
        this.advanceTextMatrix(-item, 0, 0);
      }
      else {
        throw new Error(`Unknown TJ argument type: "${item}" (array: ${JSON.stringify(array)})`);
      }
    })
  }

  /**
  When the Do operator is applied to a form XObject, a conforming reader shall perform the following tasks:
  a) Saves the current graphics state, as if by invoking the q operator
  b) Concatenates the matrix from the form dictionary’s Matrix entry with the current transformation matrix (CTM)
  c) Clips according to the form dictionary’s BBox entry
  d) Paints the graphics objects specified in the form’s content stream
  e) Restores the saved graphics state, as if by invoking the Q operator
  Except as described above, the initial graphics state for the form shall be inherited from the graphics state that is in effect at the time Do is invoked.
  */
  private _drawObject(name: string) {
    // create a nested drawing context and use that
    var XObjectStream = this.Resources.getXObject(name);
    if (XObjectStream === undefined) {
      throw new Error(`Cannot draw undefined XObject: ${name}`);
    }

    if (this.depth > 3) {
      logger.warn(`Ignoring "${name} Do" command (embedded XObject is too deep; depth = ${this.depth + 1})`);
    }
    else if (XObjectStream.Subtype == 'Form') {
      logger.silly(`Drawing XObject: ${name}`);

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
      logger.silly(`Ignoring "${name} Do" command (embedded XObject has Subtype "${XObjectStream.Subtype}")`);
    }
  }

  // ---------------------------------------------------------------------------
  // Special graphics states (q, Q, cm)
  /**
  > `q`: Save the current graphics state on the graphics state stack (see 8.4.2).
  */
  pushGraphicsState() {
    this.stateStack.push(this.graphicsState.clone());
  }
  /**
  > `Q`: Restore the graphics state by removing the most recently saved state
  > from the stack and making it the current state (see 8.4.2).
  */
  popGraphicsState() {
    this.graphicsState = this.stateStack.pop();
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
    var newCTMatrix = mat3mul([a, b, 0,
                               c, d, 0,
                               e, f, 1], this.graphicsState.ctMatrix);
    // logger.info('ctMatrix = %j', newCTMatrix);
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
  */
  drawObject(name: string) {
    this._drawObject(name);
  }
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
  */
  setGraphicsStateParameters(dictName: string) {
    logger.warn(`Ignoring setGraphicsStateParameters(${dictName}) operation`);
  }
  // ---------------------------------------------------------------------------
  // Path construction (m, l, c, v, y, h, re) - see Table 59
  /**
  `x y m`
  */
  moveTo(x: number, y: number) {
    logger.silly(`Ignoring moveTo(${x}, ${y}) operation`);
  }
  /**
  `x y l`
  */
  appendLine(x: number, y: number) {
    logger.silly(`Ignoring appendLine(${x}, ${y}) operation`);
  }
  /**
  `x1 y1 x2 y2 x3 y3 c`
  */
  appendCurve123(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    logger.silly(`Ignoring appendCurve123(${x1}, ${y1}, ${x2}, ${y2}, ${x3}, ${y3}) operation`);
  }
  /**
  `x2 y2 x3 y3 v`
  */
  appendCurve23(x2: number, y2: number, x3: number, y3: number) {
    logger.silly(`Ignoring appendCurve23(${x2}, ${y2}, ${x3}, ${y3}) operation`);
  }
  /**
  `x1 y1 x3 y3 y`
  */
  appendCurve13(x1: number, y1: number, x3: number, y3: number) {
    logger.silly(`Ignoring appendCurve13(${x1}, ${y1}, ${x3}, ${y3}) operation`);
  }
  /**
  `h`
  */
  closePath() {
    logger.silly(`Ignoring closePath() operation`);
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
    logger.silly(`Ignoring appendRectangle(${x}, ${y}, ${width}, ${height}) operation`);
  }
  // ---------------------------------------------------------------------------
  // Path painting (S, s, f, F, f*, B, B*, b, b*, n) - see Table 60
  /**
  > `S`: Stroke the path.
  */
  stroke() {
    logger.silly(`Ignoring stroke() operation`);
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
    logger.silly(`Ignoring fill() operation`);
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
    logger.silly(`Ignoring fillEvenOdd() operation`);
  }
  /**
  > `B`: Fill and then stroke the path, using the nonzero winding number rule to determine the region to fill. This operator shall produce the same result as constructing two identical path objects, painting the first with f and the second with S.
  > NOTE The filling and stroking portions of the operation consult different values of several graphics state parameters, such as the current colour.
  */
  fillThenStroke() {
    logger.silly(`Ignoring fillAndStroke() operation`);
  }
  /**
  > `B*`: Fill and then stroke the path, using the even-odd rule to determine the region to fill. This operator shall produce the same result as B, except that the path is filled as if with f* instead of f.
  */
  fillThenStrokeEvenOdd() {
    logger.silly(`Ignoring fillAndStrokeEvenOdd() operation`);
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
    logger.silly(`Ignoring closePathNoop() operation`);
  }
  // ---------------------------------------------------------------------------
  //                           Color operators
  /**
  > `name CS`
  */
  setStrokeColorSpace(name: string) {
    logger.silly(`Ignoring setStrokeColorSpace(${name}) operation`);
  }
  /**
  > `name cs`: Same as CS but used for nonstroking operations.
  */
  setFillColorSpace(name: string) {
    logger.silly(`Ignoring setFillColorSpace(${name}) operation`);
  }
  /**
  > `c1 cn SC`
  */
  setStrokeColorSpace2(c1: number, cn: number) {
    logger.silly(`Ignoring setStrokeColorSpace2(${c1}, ${cn}) operation`);
  }
  /**
  > `c1 cn [name] SCN`
  */
  setStrokeColorSpace3(c1: number, cn: number, patternName?: string) {
    logger.silly(`Ignoring setStrokeColorSpace3(${c1}, ${cn}, ${patternName}) operation`);
  }
  /**
  > `c1 cn sc`: Same as SC but used for nonstroking operations.
  */
  setFillColorSpace2(c1: number, cn: number) {
    logger.silly(`Ignoring setFillColorSpace2(${c1}, ${cn}) operation`);
  }
  /**
  > `c1 cn [name] scn`: Same as SCN but used for nonstroking operations.
  */
  setFillColorSpace3(c1: number, cn: number, patternName?: string) {
    logger.silly(`Ignoring setFillColorSpace3(${c1}, ${cn}, ${patternName}) operation`);
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
  // Clipping Path Operators (W, W*)
  /**
  > `W`: Modify the current clipping path by intersecting it with the current path, using the nonzero winding number rule to determine which regions lie inside the clipping path.
  */
  clip() {
    logger.silly(`Ignoring clip() operation`);
  }
  /**
  > `W*`: Modify the current clipping path by intersecting it with the current path, using the even-odd rule to determine which regions lie inside the clipping path.
  */
  clipEvenOdd() {
    logger.silly(`Ignoring clipEvenOdd() operation`);
  }
  // ---------------------------------------------------------------------------
  // Text objects (BT, ET)
  /** `BT` */
  startTextBlock() {
    this.textMatrix = this.textLineMatrix = mat3ident;
  }
  /** `ET` */
  endTextBlock() {
    this.textMatrix = this.textLineMatrix = null;
  }
  // ---------------------------------------------------------------------------
  // Text state operators (Tc, Tw, Tz, TL, Tf, Tr, Ts) - see PDF32000_2008.pdf:9.3.1
  /**
  > `charSpace Tc`: Set the character spacing, Tc, to charSpace, which shall
  > be a number expressed in unscaled text space units. Character spacing shall
  > be used by the Tj, TJ, and ' operators. Initial value: 0.
  */
  setCharSpacing(charSpace: number) {
    this.textState.charSpacing = charSpace;
  }
  /**
  > `wordSpace Tw`: Set the word spacing, Tw, to wordSpace, which shall be a
  > number expressed in unscaled text space units. Word spacing shall be used
  > by the Tj, TJ, and ' operators. Initial value: 0.
  */
  setWordSpacing(wordSpace: number) {
    this.textState.wordSpacing = wordSpace;
  }
  /**
  > `scale Tz`: Set the horizontal scaling, Th, to (scale ÷ 100). scale shall
  > be a number specifying the percentage of the normal width. Initial value:
  > 100 (normal width).
  */
  setHorizontalScale(scale: number) { // a percentage
    this.textState.horizontalScaling = scale;
  }
  /**
  > `leading TL`: Set the text leading, Tl, to leading, which shall be a number
  > expressed in unscaled text space units. Text leading shall be used only by
  > the T*, ', and " operators. Initial value: 0.
  */
  setLeading(leading: number) {
    this.textState.leading = leading;
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
    this.textState.fontName = font;
    this.textState.fontSize = size;
  }
  /**
  > `render Tr`: Set the text rendering mode, Tmode, to render, which shall
  > be an integer. Initial value: 0.
  */
  setRenderingMode(render: RenderingMode) {
    this.textState.renderingMode = render;
  }
  /**
  > `rise Ts`: Set the text rise, Trise, to rise, which shall be a number expressed in unscaled text space units. Initial value: 0.
  */
  setRise(rise: number) {
    this.textState.rise = rise;
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
    var newTextMatrix = mat3mul([1, 0, 0,
                                 0, 1, 0,
                                 x, y, 1], this.textLineMatrix);
    this.textMatrix = this.textLineMatrix = newTextMatrix;
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
    var newTextMatrix = [a, b, 0,
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
    this.adjustCurrentPosition(0, -this.textState.leading);
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
  showString(string: number[]) {
    this._renderGlyphs(string);
  }
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
  showStrings(array: Array<number[] | number>) {
    this._renderTextArray(array);
  }
  /** COMPLETE (ALIAS)
  > `string '` Move to the next line and show a text string. This operator shall have
  > the same effect as the code `T* string Tj`
  */
  newLineAndShowString(string: number[]) {
    this.newLine(); // T*
    this.showString(string); // Tj
  }
  /** COMPLETE (ALIAS)
  > `wordSpace charSpace text "` Move to the next line and show a text string,
  > using `wordSpace` as the word spacing and `charSpace` as the character
  > spacing (setting the corresponding parameters in the text state).
  > `wordSpace` and `charSpace` shall be numbers expressed in unscaled text
  > space units. This operator shall have the same effect as this code:
  > `wordSpace Tw charSpace Tc text '`
  */
  newLineAndShowStringWithSpacing(wordSpace: number, charSpace: number, string: number[]) {
    this.setWordSpacing(wordSpace); // Tw
    this.setCharSpacing(charSpace); // Tc
    this.newLineAndShowString(string); // '
  }
  // ---------------------------------------------------------------------------
  // Marked content (BMC, BDC, EMC)
  /**
  > `tag BMC`: Begin a marked-content sequence terminated by a balancing EMC operator. tag shall be a name object indicating the role or significance of the sequence.
  */
  beginMarkedContent(tag: string) {
    logger.silly(`Ignoring beginMarkedContent(${tag}) operation`);
  }
  /**
  > `tag properties BDC`: Begin a marked-content sequence with an associated property list, terminated by a balancing EMC operator. tag shall be a name object indicating the role or significance of the sequence. properties shall be either an inline dictionary containing the property list or a name object associated with it in the Properties subdictionary of the current resource dictionary.
  */
  beginMarkedContentWithDictionary(tag: string, dictionary: any) {
    logger.silly(`Ignoring beginMarkedContentWithDictionary(${tag}, ${dictionary}) operation`);
  }
  /**
  > `EMC`: End a marked-content sequence begun by a BMC or BDC operator.
  */
  endMarkedContent() {
    logger.silly(`Ignoring endMarkedContent() operation`);
  }
}