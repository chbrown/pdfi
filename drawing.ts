/// <reference path="type_declarations/index.d.ts" />
import lexing = require('lexing');

import models = require('./models');
import graphics = require('./parsers/graphics');

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

  static toPointArray(points: Point[]): PointArray {
    return [points.map(point => point.x), points.map(point => point.y)];
  }
}

export class Rectangle {
  constructor(public x: number, public y: number,
              public width: number, public height: number) { }

  static bounding(pointArray: PointArray): Rectangle {
    var min_x = Math.min.apply(null, pointArray[0]);
    var min_y = Math.min.apply(null, pointArray[1]);
    var max_x = Math.max.apply(null, pointArray[0]);
    var max_y = Math.max.apply(null, pointArray[1]);
    return new Rectangle(min_x, min_y, max_x - min_x, max_y - min_y);
  }

  toJSON(): models.Rectangle {
    return [this.x, this.y, this.x + this.width, this.y + this.height];
  }

  static toPointArray(rectangles: Rectangle[]): PointArray {
    var xs = []
    var ys = [];
    rectangles.forEach(rectangle => {
      xs.push(rectangle.x, rectangle.x + rectangle.width);
      ys.push(rectangle.y, rectangle.y + rectangle.height);
    });
    return [xs, ys];
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

export class Canvas {
  // Eventually, this will render out other elements, too
  private spans: TextSpan[] = [];

  constructor(public MediaBox: models.Rectangle) { }

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

  getBounds(): Rectangle {
    var pointArray = Rectangle.toPointArray(this.spans.map(span => span.box));
    return Rectangle.bounding(pointArray);
  }

  /**
  We define a header as the group of spans at the top separated from the rest
  of the text by at least `min_header_gap`, but which is at most
  `max_header_height` high.
  */
  getHeader(max_header_height = 40, min_header_gap = 20): Rectangle {
    var boxes = this.spans.map(span => span.box);
    // sort occurs in place but `points` is a new array anyway (though it's
    // shallow; the points are not copies)
    // sorts in ascending order.
    boxes.sort((a, b) => a.y - b.y);
    var header_min_y = boxes[0].y;
    // now we read glom through the following points until we hit one that's too far
    var header_max_y = header_min_y;
    var box_i = 1;
    for (; box_i < boxes.length; box_i++) {
      var dy = boxes[box_i].y - header_max_y;
      if (dy > min_header_gap) {
        break;
      }
      header_max_y = boxes[box_i].y;
      // if we've surpassed how high we decided the header can get, give up
      if (header_max_y - header_min_y > max_header_height) {
        return null;
      }
    }

    var pointArray = Rectangle.toPointArray(boxes.slice(0, box_i));
    return Rectangle.bounding(pointArray);
  }

  getFooter(max_footer_height = 40, min_footer_gap = 20): Rectangle {
    // var sorted_spans =
    var boxes = this.spans.map(span => span.box);
    // sort in descending order
    boxes.sort((a, b) => b.y - a.y);
    var footer_max_y = boxes[0].y;
    // now we read glom through the following points until we hit one that's too far
    var footer_min_y = footer_max_y;
    var box_i = 1;
    for (; box_i < boxes.length; box_i++) {
      // dy is the distance from the point that's slightly higher on the page to
      // the currently determined top of the footer
      var dy = footer_min_y - boxes[box_i].y;
      if (dy > min_footer_gap) {
        break;
      }
      footer_min_y = boxes[box_i].y;
      // if we've surpassed how high we decided the footer can get, give up
      if (footer_max_y - footer_min_y > max_footer_height) {
        return null;
      }
    }

    var pointArray = Rectangle.toPointArray(boxes.slice(0, box_i));
    return Rectangle.bounding(pointArray);
  }

  addSpan(text: string, x: number, y: number, width_units: number, fontName: string, fontSize: number) {
    // transform into origin at top left
    var canvas_position = transform2d(x, y, 1, 0, 0, -1, 0, this.MediaBox[3])
    var box = new Rectangle(canvas_position[0], canvas_position[1],
      fontSize * (width_units / 1000), Math.ceil(fontSize) | 0);
    var span = new TextSpan(text, box, fontName, fontSize);
    this.spans.push(span);
  }

  toJSON() {
    return {
      MediaBox: this.MediaBox,
      spans: this.spans,
      bounds: this.getBounds(),
      header: this.getHeader(),
      footer: this.getFooter(),
    };
  }
}
