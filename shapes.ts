function min(numbers: number[]): number {
  return Math.min.apply(null, numbers);
}
function max(numbers: number[]): number {
  return Math.max.apply(null, numbers);
}

/**

PointArray is an tuple of equal sized arrays, i.e.:

  [ [x1, x2, x3, ..., xN], [y1, y2, y3, ..., yN] ]

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
  /**
  This works a lot like the CSS `transform: matrix(a, c, b, d, tx, ty)` syntax.

  Returns a new Point.
  */
  transform(a: number, c: number,
            b: number, d: number,
            tx: number = 0, ty: number = 0): Point {
    return new Point((a * this.x) + (b * this.y) + tx, (c * this.x) + (d * this.y) + ty);
  }
}
export class Size {
  constructor(public width: number, public height: number) { }
}

/**
A PDF Rectangle is a 4-tuple [x1, y1, x2, y2], where [x1, y1] and [x2, y2] are
points in any two diagonally opposite corners, usually lower-left to
upper-right.

From the spec:

> **rectangle**
> a specific array object used to describe locations on a page and bounding
> boxes for a variety of objects and written as an array of four numbers giving
> the coordinates of a pair of diagonally opposite corners, typically in the
> form `[ llx lly urx ury ]` specifying the lower-left x, lower-left y,
> upper-right x, and upper-right y coordinates of the rectangle, in that order
*/
// export type RectangleTuple = [number, number, number, number]

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

  static fromPointSize(point: Point, size: Size): Rectangle {
    return new Rectangle(point.x, point.y, point.x + size.width, point.y + size.height);
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

  toJSON() {
    return {
      x: this.minX,
      y: this.minY,
      width: this.dX,
      height: this.dY,
    };
  }
}

export class TextSpan {
  constructor(public string: string,
              public bounds: Rectangle,
              public fontSize: number,
              public details?: any) { }

  toJSON() {
    return {
      string: this.string,
      x: this.bounds.minX,
      y: this.bounds.minY,
      width: this.bounds.dX,
      height: this.bounds.dY,
      fontSize: this.fontSize,
      details: this.details,
    };
  }
}
