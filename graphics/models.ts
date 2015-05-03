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
    other.elements.forEach(element => this.push(element));
    this.expandToContain(other);
  }
}

export class TextSpan extends Rectangle {
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
}

export class ContainedElement<T extends Rectangle> extends Rectangle {
  constructor(public element: T, container: Container<T>) {
    super(element.minX, element.minY, element.maxX, element.maxY)
  }
}
