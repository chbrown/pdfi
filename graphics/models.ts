import {Point, Size, Rectangle} from './geometry';

export class Container<T extends Rectangle> extends Rectangle {
  protected elements: T[] = [];
  constructor(elements: T[] = []) {
    super(Infinity, Infinity, -Infinity, -Infinity);
    this.pushElements(elements);
  }

  get length(): number {
    return this.elements.length;
  }
  getElements(): T[] {
    return this.elements;
  }

  /**
  Add the given `element`, and extend to contain its Rectangle (if needed).

  This is a mutating method.
  */
  push(element: T): void {
    this.elements.push(element);
    this.expandToContain(element);
  }
  /**
  TODO: optimize this by using PointArray (plain `push()` incurs a lot of function calls).

  This is a mutating method.
  */
  pushElements(elements: T[]): void {
    elements.forEach(element => this.push(element));
  }

  /**
  Add all elements from `other` and expand the current bounds to contain `other`.

  This is a mutating method.
  */
  merge(other: Container<T>): void {
    other.elements.forEach(element => this.elements.push(element));
    this.expandToContain(other);
  }
}

export class TextSpan extends Rectangle {
  layoutContainer: Rectangle;
  constructor(public string: string,
              minX: number,
              minY: number,
              maxX: number,
              maxY: number,
              public fontSize: number,
              public fontBold: boolean,
              public fontItalic: boolean,
              public details?: any) {
    super(minX, minY, maxX, maxY);
  }

  toJSON() {
    return {
      string: this.string,
      minX: this.minX,
      minY: this.minY,
      maxX: this.maxX,
      maxY: this.maxY,
      fontSize: this.fontSize,
      fontBold: this.fontBold,
      fontItalic: this.fontItalic,
      details: this.details,
    }
  }
}

/**
Canvas is used as the target of a series of content stream drawing operations.
The origin (0, 0) is located at the top left.

outerBounds is usually set by the Page's MediaBox rectangle. It does not depend
on the elements contained by the page.
*/
export class Canvas extends Container<TextSpan> {
  constructor(public outerBounds: Rectangle) { super() }

  drawText(string: string, origin: Point, size: Size,
           fontSize: number, fontBold: boolean, fontItalic: boolean, fontName: string) {
    // transform into origin at top left
    var canvas_origin = origin.transform(1, 0, 0, -1, 0, this.outerBounds.dY)
    var span = new TextSpan(string,
                            canvas_origin.x,
                            canvas_origin.y,
                            canvas_origin.x + size.width,
                            canvas_origin.y + size.height,
                            fontSize,
                            fontBold,
                            fontItalic);
    // span.details is an option for debugging
    span.details = `${span.toString(0)} fontName=${fontName}`;
    this.push(span);
  }

  toJSON() {
    return {
      textSpans: this.elements,
      outerBounds: this.outerBounds,
    }
  }
}

/**
A Layout usually represents a single PDF page.
*/
export interface Layout {
  /** The rectangle bounding the entire page, will usually have an origin at 0,0 */
  outerBounds: Rectangle;
  /** The textSpans on the page as originally ordered. There is no structure. */
  textSpans: TextSpan[];
  /** The textSpans on the page in their autodetected layout containers. The
  containers may overlap but should not subsume any others. */
  containers: Container<TextSpan>[];
}
