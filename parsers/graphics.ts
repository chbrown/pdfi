/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');
import chalk = require('chalk');
import lexing = require('lexing');
import StackOperationParser = require('./StackOperationParser');
import pdfdom = require('../pdfdom');

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
};

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

export class Point {
  constructor(public x: number, public y: number) { }
  clone(): Point {
    return new Point(this.x, this.y);
  }
  set(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  move(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }
}

function dot(a: number[], b: number[]) {
  if (a.length !== b.length) {
    throw new Error('Cannot compute dot product of vectors of inequal length');
  }
  var sum = 0;
  for (var i = 0, l = a.length; i < l; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

class Matrix3 {
  constructor(public rows: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { }
  clone(): Matrix3 {
    return new Matrix3(this.rows.map(row => row.slice()));
  }

  // accessors
  row(index: number): number[] {
    return this.rows[index];
  }
  col(index: number): number[] {
    return this.rows.map(row => row[index]);
  }

  /**
  returns a new Matrix3

  See 8.3.4 for a shortcut for avoiding full matrix multiplications.
  */
  multiply(right: Matrix3): Matrix3 {
    // matrices are stored as matrix[row_index][col_index]
    var product = new Matrix3();
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        product.rows[i][j] = dot(this.row(i), right.col(j));
      }
    }
    return product;
  }
}

/**
We need to be able to clone it since we need a copy when we process a
`pushGraphicsState` (`q`) command, and it'd be easier to clone if the variables
were in the constructor, but there are a lot of variables!
*/
class GraphicsState {
  public ctMatrix: Matrix3 = new Matrix3(); // defaults to the identity matrix
  public strokeColor: Color = new Color();
  public fillColor: Color = new Color();
  public lineWidth: number;
  public lineCap: pdfdom.LineCapStyle;
  public lineJoin: pdfdom.LineJoinStyle;
  public miterLimit: number;
  public dashArray: number[];
  public dashPhase: number;
  public renderingIntent: string; // not sure if it's actually this type?
  public flatnessTolerance: number;

  clone(): GraphicsState {
    var copy = new GraphicsState();
    for (var key in this) {
      if (this.hasOwnProperty(key)) {
        copy[key] = this[key].clone ? this[key].clone() : this[key];
      }
    }
    return copy;
  }

  // getPosition(): Point {
  //   var x = this.ctMatrix.rows[2][0];
  //   var y = this.ctMatrix.rows[2][1];
  //   return new Point(x, y);
  // }
}

class TextState {
  charSpacing: number = 0;
  wordSpacing: number = 0;
  horizontalScaling: number = 100;
  leading: number = 0;
  fontName: string;
  fontSize: number;
  renderingMode: pdfdom.RenderingMode = 0;
  rise: number = 0;

  textMatrix: Matrix3 = new Matrix3();
  textLineMatrix: Matrix3 = new Matrix3();

  constructor(public graphicsState: GraphicsState) { }

  getPosition(): Point {
    var fs = this.fontSize;
    var fsh = fs * (this.horizontalScaling / 100.0);
    var rise = this.rise;
    var base = new Matrix3([[fsh, 0, 0], [0, fs, 0], [0, rise, 1]]);

    // var textRenderingMatrix = base.multiply(this.textMatrix);
    var textRenderingMatrix = base.multiply(this.textMatrix).multiply(this.graphicsState.ctMatrix);
    var x = textRenderingMatrix.rows[2][0];
    var y = textRenderingMatrix.rows[2][1];
    return new Point(x, y);
  }
}

export class TextSpan {
  constructor(public position: Point, public text: string, public size: number) { }
}

export class Canvas {
  // Eventually, this will render out other elements, too
  spans: TextSpan[] = [];

  stateStack: GraphicsState[] = [];
  graphicsState: GraphicsState = new GraphicsState();
  textState: TextState = null;

  constructor(public XObject: pdfdom.XObject = {}) { }

  renderStringIterable(string_iterable: lexing.StringIterable): void {
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
        logger.warn(`Ignoring unimplemented operator "${token.name}" [${token.value.join(', ')}]`);
      }
    }
  }
  renderString(str: string): void {
    var string_iterable = new lexing.StringIterator(str);
    this.renderStringIterable(string_iterable);
  }
  renderStream(stream: pdfdom.Stream): void {
    var stream_string = stream.buffer.toString('ascii');
    this.renderString(stream_string);
  }

  private _drawText(text: string) {
    var position = this.textState.getPosition();
    var span = new TextSpan(position, text, this.textState.fontSize);
    this.spans.push(span);
  }

  private _drawObject(name: string) {
    var XObject = this.XObject[name];
    if (XObject === undefined) {
      throw new Error(`Cannot draw undefined XObject: ${name}`);
    }
    this.renderStream(XObject);
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
    var base = new Matrix3([[a, b, 0], [c, d, 0], [e, f, 1]]);
    this.graphicsState.ctMatrix = base.multiply(this.graphicsState.ctMatrix);
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
  setLineCap(lineCap: pdfdom.LineCapStyle) {
    this.graphicsState.lineCap = lineCap;
  }
  /**
  > `lineJoin j`: Set the line join style in the graphics state.
  */
  setLineJoin(lineJoin: pdfdom.LineJoinStyle) {
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
  //                           Color operators
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

  // ---------------------------------------------------------------------------
  // Text objects (BT, ET)
  /** `BT` */
  startTextBlock() {
    // intialize state
    this.textState = new TextState(this.graphicsState);
  }
  /** `ET` */
  endTextBlock() {
    // remove textState, so that any operations that require it will fail
    this.textState = null;
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
  setRenderingMode(render: pdfdom.RenderingMode) {
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
    var base = new Matrix3([[1, 0, 0], [0, 1, 0], [x, y, 1]]);
    this.textState.textMatrix = this.textState.textLineMatrix = base.multiply(this.textState.textLineMatrix);
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
    var base = new Matrix3([[a, b, 0], [c, d, 0], [e, f, 1]]);
    this.textState.textMatrix = this.textState.textLineMatrix = base;
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
  */
  showString(text: string) {
    this._drawText(text);
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
  > to the left or down by the given amount. Figure 46 shows an example of the
  > effect of passing offsets to TJ.

  In other words:
  - large negative numbers equate to spaces
  - small positive amounts equate to kerning hacks
  */
  showStrings(array: Array<string | number>) {
    var text = array.map(item => {
      var item_type = typeof item;
      if (item_type === 'string') {
        return item;
      }
      else if (item_type === 'number') {
        return (item < -100) ? ' ' : '';
      }
      else {
        throw new Error(`Unknown TJ argument type: ${item_type} (${item})`);
      }
    }).join('');
    this._drawText(text);
  }
  /** COMPLETE (ALIAS)
  > `string '` Move to the next line and show a text string. This operator shall have
  > the same effect as the code `T* string Tj`
  */
  newLineAndShowString(text: string) {
    this.newLine(); // T*
    this.showString(text); // Tj
  }
  /** COMPLETE (ALIAS)
  > `wordSpace charSpace text "` Move to the next line and show a text string,
  > using `wordSpace` as the word spacing and `charSpace` as the character
  > spacing (setting the corresponding parameters in the text state).
  > `wordSpace` and `charSpace` shall be numbers expressed in unscaled text
  > space units. This operator shall have the same effect as this code:
  > `wordSpace Tw charSpace Tc text '`
  */
  newLineAndShowStringWithSpacing(wordSpace: number, charSpace: number, text: string) {
    this.setWordSpacing(wordSpace); // Tw
    this.setCharSpacing(charSpace); // Tc
    this.newLineAndShowString(text); // '
  }
}
