/// <reference path="../type_declarations/index.d.ts" />
import {Font} from '../font/index';

import {Canvas} from './canvas';
import {Point, Size} from './geometry';
import {Color} from './color';
import {mat3mul, mat3ident} from './math';
// this module should not import ./stream, which is a consumer of this module.

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
  renderingMode: RenderingMode = RenderingMode.Fill;
  rise: number = 0;
}

/**
DrawingContext is kind of like a Canvas state, keeping track of where we are in
painting the canvas. It's an abstraction away from the content stream and the
rest of the PDF. We

the textState persists across BT and ET markers, and can be modified anywhere
the textMatrix and textLineMatrix do not persist between distinct BT ... ET blocks
*/
export class DrawingContext {
  graphicsState: GraphicsState = new GraphicsState();
  stateStack: GraphicsState[] = [];
  textState: TextState = new TextState();
  textMatrix: number[];
  textLineMatrix: number[];

  constructor() { }

  drawGlyphs(bytes: number[], font: Font) {
    throw new Error('Abstract class');
  }

  drawTextArray(array: Array<number[] | number>, font: Font) {
    throw new Error('Abstract class');
  }
}

export class CanvasDrawingContext extends DrawingContext {
  constructor(public canvas: Canvas) { super() }

  /**
  advanceTextMatrix is only called from the various text drawing
  */
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

  /**
  drawGlyphs is called when processing a Tj ("showString") operation, and from
  drawTextArray, in turn.

  For each item in `array`:
    If item is a number[], that indicates a string of character codes
    If item is a plain number, that indicates a spacing shift
  */
  drawGlyphs(bytes: number[], font: Font) {
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
    var size = new Size(width, height);

    this.canvas.addSpan(string, origin, size, fontSize, font.bold, font.italic, this.textState.fontName);
  }

  /**
  drawTextArray is called when processing a TJ ("showStrings") operation.

  For each item in `array`:
    If item is a number[], that indicates a string of character codes
    If item is a plain number, that indicates a spacing shift
  */
  drawTextArray(array: Array<number[] | number>, font: Font) {
    array.forEach(item => {
      // each item is either a string (character code array) or a number
      if (Array.isArray(item)) {
        // if it's a character array, convert it to a unicode string and render it
        var bytes = <number[]>item;
        this.drawGlyphs(bytes, font);
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
}

export class TextDrawingContext extends DrawingContext {
  constructor(public spans: any[]) { super() }

  drawGlyphs(bytes: number[], font: Font) {
    var str = font.decodeString(bytes);
    this.spans.push({operator: 'Tj', font: this.textState.fontName, text: str});
  }

  drawTextArray(array: Array<number[] | number>, font: Font) {
    var str = array.map(item => {
      // each item is either a string (character code array) or a number
      if (Array.isArray(item)) {
        // if it's a character array, convert it to a unicode string and render it
        var bytes = <number[]>item;
        return font.decodeString(bytes);
      }
      else if (typeof item === 'number') {
        // negative numbers indicate forward (rightward) movement. if it's a
        // very negative number, it's like inserting a space. otherwise, it
        // only signifies a small manual spacing hack.
        return (item < -100) ? ' ' : '';
      }
      else {
        throw new Error(`Unknown TJ argument type: "${item}" (array: ${JSON.stringify(array)})`);
      }
    }).join('');
    this.spans.push({operator: 'TJ', font: this.textState.fontName, text: str});
  }
}
