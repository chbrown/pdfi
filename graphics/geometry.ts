export interface Point {
  x: number;
  y: number;
}

/**
This works a lot like the CSS `transform: matrix(a, c, b, d, tx, ty)` syntax.

Returns a new Point object.
*/
export function transformPoint(point: Point,
                               a: number, c: number,
                               b: number, d: number,
                               tx: number = 0, ty: number = 0): Point {
  return {
    x: (a * point.x) + (b * point.y) + tx,
    y: (c * point.x) + (d * point.y) + ty,
  };
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

/**
> Because a transformation matrix has only six elements that can be changed, in most cases in PDF it shall be specified as the six-element array [a b c d e f].

                 ⎡ a b 0 ⎤
[a b c d e f] => ⎢ c d 0 ⎥
                 ⎣ e f 1 ⎦

*/

/**
Multiply two 3x3 matrices, returning a new 3x3 matrix representation.

See 8.3.4 for a shortcut for avoiding full matrix multiplications.
*/
export function mat3mul(A: number[], B: number[]): number[] {
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

/**
Add two 3x3 matrices, returning a new 3x3 matrix representation.
*/
export function mat3add(A: number[], B: number[]): number[] {
  return [
    A[0] + B[0], A[1] + B[1], A[2] + B[2],
    A[3] + B[3], A[4] + B[4], A[5] + B[5],
    A[6] + B[6], A[7] + B[7], A[8] + B[8]
  ];
}

export const mat3ident = [1, 0, 0,
                          0, 1, 0,
                          0, 0, 1];
