/// <reference path="type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');

import models = require('./models');
import graphics = require('./parsers/graphics');

function min(numbers: number[]): number {
  return Math.min.apply(null, numbers);
}
function max(numbers: number[]): number {
  return Math.max.apply(null, numbers);
}

/**
This works a lot like the CSS `transform: matrix(a, c, b, d, tx, ty)` syntax.
*/
function transform2d(x, y, a, c, b, d, tx, ty): models.Point {
  return [(a * x) + (b * y) + tx, (c * x) + (d * y) + ty];
}

/**

PointArray is an tuple of equal sized arrays, something like:

  [ [x1, x2, x3], [y1, y2, y3] ]

*/
type PointArray = [number[], number[]];
function rectanglesToPointArray(rectangles: Rectangle[]): PointArray {
  var xs = []
  var ys = [];
  rectangles.forEach(rectangle => {
    xs.push(rectangle.minX, rectangle.maxX);
    ys.push(rectangle.minY, rectangle.maxY);
  });
  return [xs, ys];
}
function pointsToPointArray(points: Point[]): PointArray {
  return [points.map(point => point.x), points.map(point => point.y)];
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


/**
This is much like the standard PDF rectangle, using two diagonally opposite
corners of a rectangle as its internal representation, but we are always assured
that they represent the corner nearest the origin first, and the opposite corner
last.
*/
export class Rectangle {
  constructor(public minX: number, public minY: number,
              public maxX: number, public maxY: number) { }

  static bounding(pointArray: PointArray): Rectangle {
    return new Rectangle(min(pointArray[0]), min(pointArray[1]),
                         max(pointArray[0]), max(pointArray[1]));
  }

  static fromPointSize(x: number, y: number, width: number, height: number): Rectangle {
    return new Rectangle(x, y, x + width, y + height);
  }

  get midX(): number {
    return (this.maxX - this.minX) / 2 + this.minX;
  }
  get midY(): number {
    return (this.maxY - this.minY) / 2 + this.minY;
  }

  /**
  I.e., width
  */
  get dX(): number {
    return this.maxX - this.minX;
  }
  /**
  I.e., height
  */
  get dY(): number {
    return this.maxY - this.minY;
  }


  /**
  Returns true if this fully contains the other rectangle.

  The calculation is inclusive; i.e., this.containsRectangle(this) === true
  */
  containsRectangle(other: Rectangle): boolean {
    return (this.minX <= other.minX) && (this.minY <= other.minY) &&
           (this.maxX >= other.maxX) && (this.maxY >= other.maxY);
  }

  /**
  Returns the a standard 4-tuple representation
  */
  toJSON(): models.Rectangle {
    return [this.minX, this.minY, this.maxX, this.maxY];
  }
  static fromJSON(value: models.Rectangle): Rectangle {
    return new Rectangle(Math.min(value[0], value[2]), Math.min(value[1], value[3]),
                         Math.max(value[0], value[2]), Math.max(value[1], value[3]));
  }
}

export class EmptyRectangle extends Rectangle {
  constructor() { super(0, 0, 0, 0) }
  containsRectangle(other: Rectangle): boolean {
    return false;
  }
  toJSON(): models.Rectangle {
    return null;
  }
}

export class TextSpan {
  constructor(public text: string,
              public box: Rectangle,
              public fontName: string,
              public fontSize: number) { }

  toJSON() {
    return {
      text: this.text,
      box: this.box,
      fontName: this.fontName,
      fontSize: this.fontSize,
    };
  }
}

export class Paragraph {
  constructor(public lines: string[] = []) { }

  getText(): string {
    // if a line ends with a hyphen, we remove the hyphen and join it to
    // the next line directly; otherwise, join them with a space
    return this.lines.map(line => {
      if (line.match(/-$/)) {
        // if line is hyphenated, return it without the hyphen.
        return line.slice(0, -1);
      }
      else {
        // otherwise, return it with a space on the end
        return line + ' ';
      }
    }).join('').trim();
  }

  toJSON() {
    return {
      lines: this.lines,
      text: this.getText(),
    };
  }

}

export class Section {
  public spans: TextSpan[] = [];
  constructor(public name: string, public box: Rectangle) { }

  /**
  This Section's spans should be in reading order

  `max_line_gap`: the maximum distance between lines before we consider the
  next line a new paragraph.
  */
  getParagraphs(max_line_gap = 5): Paragraph[] {
    var paragraphs: Paragraph[] = [];

    var current_paragraph: Paragraph = new Paragraph();
    var current_line = '';

    var flushLine = () => { current_paragraph.lines.push(current_line); current_line = ''; }
    var flushParagraph = () => { flushLine(); paragraphs.push(current_paragraph); current_paragraph = new Paragraph(); }

    // current_maxY is the current paragraph's bottom bound
    var last_box = new Rectangle(0, 0, 0, 0);
    // for (var i = 0, span; (span = sorted_spans[i]); i++) {
    this.spans.forEach(span => {
      // dY is the distance from current bottom of the paragraph to the top of
      // the next span (this may come out negative, if the span is on the same
      // line as the last one)
      var dY = span.box.minY - last_box.maxY;
      if (dY > max_line_gap) {
        // okay, the total gap between the two lines is big enough to indicate
        // a new paragraph
        flushParagraph();
      }
      else if (dY > 0) {
        // if the new span does not horizontally overlap with the previous one,
        // we consider it a new line
        flushLine();
      }
      else {
        // otherwise it's a span on the same line
        var dX = span.box.minX - last_box.maxX;
        // and if it's far enough away (horizontally) from the last box, we add a space
        if (dX > 1) {
          current_line += ' ';
        }
      }
      current_line += span.text;
      last_box = span.box;
    });
    // finish up
    flushParagraph();

    return paragraphs;
  }

  toJSON() {
    return {
      name: this.name,
      box: this.box,
      spans: this.spans,
      paragraphs: this.getParagraphs(),
    };
  }
}

export class Canvas {
  // Eventually, this will render out other elements, too
  public pageBox: Rectangle;
  public spans: TextSpan[] = [];

  constructor(MediaBox: models.Rectangle) {
    this.pageBox = Rectangle.fromJSON(MediaBox);
  }

  /**
  When we render a page, we specify a ContentStream as well as a Resources
  dictionary. That Resources dictionary may contain XObject streams that are
  embedded as `Do` operations in the main contents, as well as sub-Resources
  in those XObjects.
  */
  render(string_iterable: lexing.StringIterable, Resources: models.Resources): void {
    var context = new graphics.DrawingContext(Resources);
    context.render(string_iterable, this);
  }

  /**
  We define a header as the group of spans at the top separated from the rest
  of the text by at least `min_header_gap`, but which is at most
  `max_header_height` high.
  */
  getHeader(max_header_height = 50, min_header_gap = 10): Rectangle {
    // sort in ascending order. the sort occurs in-place but the map creates a
    // new array anyway (though it's shallow; the points are not copies)
    var spans = this.spans.slice().sort((a, b) => a.box.minY - b.box.minY);
    // var boxes = this.spans.map(span => span.box).sort((a, b) => a.minY - b.minY);
    // the header starts as a page-wide sliver at the top of the highest span box
    var header_minY = spans[0].box.minY;
    var header_maxY = header_minY;
    // now we read glom through the following points until we hit one that's far
    // enough away, only shifting header.maxY as needed.
    for (var i = 0, next_lower_span: TextSpan; (next_lower_span = spans[i]); i++) {
      var dY = next_lower_span.box.minY - header_maxY;
      if (dY > min_header_gap) {
        break;
      }
      // set the new lower bound to the bottom of the newly added box
      header_maxY = next_lower_span.box.maxY;
      // if we've surpassed how high we decided the header can get, give up
      if ((header_maxY - header_minY) > max_header_height) {
        // set the header back to the default sliver at the top of the page
        header_maxY = this.pageBox.minY;
        break;
      }
    }
    return new Rectangle(this.pageBox.minX, this.pageBox.minY, this.pageBox.maxX, header_maxY);
  }

  /**
  The footer can extend at most `max_footer_height` from the bottom of the page,
  and must have a gap of `min_footer_gap` between it and the rest of the text.
  */
  getFooter(max_footer_height = 50, min_footer_gap = 10): Rectangle {
    // sort in descending order -- lowest boxes first
    var spans = this.spans.slice().sort((a, b) => b.box.maxY - a.box.maxY);
    // var boxes = this.spans.map(span => span.box).sort((a, b) => b.maxY - a.maxY);
    // default the footer to a box as high as the lowest span on the page.
    var footer_minY = spans[0].box.minY;
    var footer_maxY = footer_minY;
    // now we read glom through each box from the bottom until we hit one that's far enough away
    // as we go through, we adjust ONLY footer.minY
    for (var i = 1, next_higher_span: TextSpan; (next_higher_span = spans[i]); i++) {
      // dY is the distance from the highest point on the current footer to the
      // bottom of the next highest rectangle on the page
      var dY = footer_minY - next_higher_span.box.maxY;
      if (dY > min_footer_gap) {
        // okay, the text above is too far away to merge into the footer, we're done
        break;
      }
      // set the new footer upper bound
      footer_minY = next_higher_span.box.minY;
      // if we've surpassed how high we decided the footer can get, give up
      if ((footer_maxY - footer_minY) > max_footer_height) {
        // set the footer back to the sliver at the bottom of the page
        footer_minY = this.pageBox.maxY;
        break;
      }
    }
    return new Rectangle(this.pageBox.minX, footer_minY, this.pageBox.maxX, this.pageBox.maxY);
  }

  getSections(): Section[] {
    var header = this.getHeader();
    var footer = this.getFooter();
    // Excluding the header and footer, find a vertical split between the spans,
    // and return an Array of Rectangles bounding each column.
    // For now, split into two columns down the middle of the page.
    var contents = new Rectangle(this.pageBox.minX, header.maxY, this.pageBox.maxX, footer.minY);
    var col1 = new Rectangle(contents.minX, contents.minY, contents.midX, contents.maxY);
    var col2 = new Rectangle(contents.midX, contents.minY, contents.maxX, contents.maxY);
    // okay, we've got the bounding boxes, now we need to find the spans they contain
    var sections = [
      new Section('header', header),
      new Section('footer', footer),
      new Section('col1', col1),
      new Section('col2', col2),
    ];
    var outside_section = new Section('outside', this.pageBox);

    // now loop through the spans and put them in the appropriate rectangles
    this.spans.forEach(span => {
      var outside = true;
      sections.forEach(section => {
        if (section.box.containsRectangle(span.box)) {
          outside = false;
          section.spans.push(span)
        }
      });
      if (outside) {
        outside_section.spans.push(span);
      }
    });
    sections.push(outside_section);

    return sections;
  }

  addSpan(text: string, x: number, y: number, width_units: number, fontName: string, fontSize: number) {
    // transform into origin at top left
    var canvas_position = transform2d(x, y, 1, 0, 0, -1, 0, this.pageBox.dY)
    var box = Rectangle.fromPointSize(canvas_position[0], canvas_position[1],
      fontSize * (width_units / 1000), Math.ceil(fontSize) | 0);
    var span = new TextSpan(text, box, fontName, fontSize);
    this.spans.push(span);
  }

  toJSON() {
    return {
      spans: this.spans,
      pageBox: this.pageBox,
      sections: this.getSections(),
    };
  }
}