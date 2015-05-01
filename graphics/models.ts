import {median} from '../Arrays';
import {Rectangle} from './geometry';

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
      this._medianElementLeftOffset = median(leftOffsets);
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

export class CMYKColor extends Color {
  constructor(public c: number, public m: number, public y: number, public k: number) { super() }
  clone(): CMYKColor { return new CMYKColor(this.c, this.m, this.y, this.k); }
  toString(): string {
    return `cmyk(${this.c}, ${this.m}, ${this.y}, ${this.k})`;
  }
}
