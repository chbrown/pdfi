import Arrays = require('./Arrays');

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

export class Container<T extends Rectangle> extends Rectangle {
  protected elements: T[] = [];
  constructor(elements: T[] = []) {
    super(Infinity, Infinity, -Infinity, -Infinity);
    this.pushElements(elements);
  }

  get length(): number {
    return this.elements.length;
  }

  private _medianElementLeftOffset: number;
  /**
  Returns the median distance between this container's left (inner) bound and
  the left bound of its elements.

  This is useful when we want to determine whether a given line is atypical
  within its specific container.

  Cached as `this._medianElementLeftOffset`.
  */
  get medianElementLeftOffset(): number {
    if (this._medianElementLeftOffset === undefined) {
      // leftOffsets will all be non-negative by definition; `this.minX` is the
      // the minimum minX of all of its elements. In other words:
      // `element.minX >= this.minX` for each `element` in `this.elements`
      var leftOffsets = this.elements.map(element => element.minX - this.minX);
      this._medianElementLeftOffset = Arrays.median(leftOffsets);
    }
    return this._medianElementLeftOffset;
  }

  /**
  Add the given `element`, and extend to contain its Rectangle (if needed).

  This is a mutating method.
  */
  push(element: T): void {
    this.elements.push(element);

    this.minX = Math.min(this.minX, element.minX);
    this.minY = Math.min(this.minY, element.minY);
    this.maxX = Math.max(this.maxX, element.maxX);
    this.maxY = Math.max(this.maxY, element.maxY);
  }
  /**
  TODO: optimize this by using PointArray (plain `push()` incurs a lot of function calls).
  */
  pushElements(elements: T[]): void {
    elements.forEach(element => this.push(element));
  }
}

export class NamedContainer<T extends Rectangle> extends Container<T> {
  constructor(public name: string, elements: T[] = []) { super(elements) }
}

export class TextSpan extends Rectangle {
  constructor(public string: string,
              minX: number,
              minY: number,
              maxX: number,
              maxY: number,
              public fontSize: number,
              public details?: any) {
    super(minX, minY, maxX, maxY);
  }
}
