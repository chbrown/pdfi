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
This is much like the standard PDF rectangle, using two diagonally opposite
corners of a rectangle as its internal representation, but we are always assured
that they represent the corner nearest the origin first (as minX/minY), and the
opposite corner last (as maxX/maxY).
*/
export class Rectangle {
  constructor(public minX: number, public minY: number,
              public maxX: number, public maxY: number) { }

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

  toString(digits = 0): string {
    // var size_string = `(${this.dX.toFixed(digits)}x${this.dY.toFixed(digits)})`;
    // return `${point_string} ${size_string}`;
    // [span.minX, span.minY, span.maxX, span.maxY].map(x => x.toFixed(3)).join(',');
    return `[${this.minX.toFixed(digits)}, ${this.minY.toFixed(digits)}, ${this.maxX.toFixed(digits)}, ${this.maxY.toFixed(digits)}]`;
  }

  /**
  Returns true if this fully contains the other rectangle.

  The calculation is inclusive; i.e., this.containsRectangle(this) === true
  */
  containsRectangle(other: Rectangle): boolean {
    return (this.minX <= other.minX) && (this.minY <= other.minY) &&
           (this.maxX >= other.maxX) && (this.maxY >= other.maxY);
  }
}
