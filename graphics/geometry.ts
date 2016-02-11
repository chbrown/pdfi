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
    // const size_string = `(${this.dX.toFixed(digits)}x${this.dY.toFixed(digits)})`;
    // return `${point_string} ${size_string}`;
    // [span.minX, span.minY, span.maxX, span.maxY].map(x => x.toFixed(3)).join(',');
    return `[${this.minX.toFixed(digits)}, ${this.minY.toFixed(digits)}, ${this.maxX.toFixed(digits)}, ${this.maxY.toFixed(digits)}]`;
  }

  /**
  Measure the distance from this Rectangle to a different Rectangle, using the
  nearest two corners. If there is any overlap in either the x-axis or y-axis
  (including if two sides are exactly adjacent), it will return 0 for that
  component. However, there is only true overlap if both components are 0.

  Returns a tuple: [x_axis_distance, y_axis_distance]
  */
  distance(other: Rectangle): [number, number] {
    // 1) measure x-axis displacement
    let dx = 0; // default to the overlap case
    if (other.maxX < this.minX) {
      // other Rectangle is completely disjoint to the left
      dx = this.minX - other.maxX;
    }
    else if (other.minX > this.maxX) {
      // other Rectangle is completely disjoint to the right
      dx = other.minX - this.maxX;
    }
    // 2) measure y-axis displacement
    let dy = 0;
    if (other.maxY < this.minY) {
      // other Rectangle is completely disjoint above
      dy = this.minY - other.maxY;
    }
    else if (other.minY > this.maxY) {
      // other Rectangle is completely disjoint below
      dy = other.minY - this.maxY;
    }
    // 3) return a tuple
    return [dx, dy];
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
  Adjust the bounds to contain `other`.

  This is a mutating method.
  */
  protected expandToContain(other: Rectangle): void {
    this.minX = Math.min(this.minX, other.minX);
    this.minY = Math.min(this.minY, other.minY);
    this.maxX = Math.max(this.maxX, other.maxX);
    this.maxY = Math.max(this.maxY, other.maxY);
  }
}
