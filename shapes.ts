function min(numbers: number[]): number {
  return Math.min.apply(null, numbers);
}
function max(numbers: number[]): number {
  return Math.max.apply(null, numbers);
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
    elements.forEach(element => this.push(element));
  }

  get length(): number {
    return this.elements.length;
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
