import {assign} from 'tarry';

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

export interface Size {
  width: number;
  height: number;
}

export interface Rectangle {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function makeRectangle(minX: number, minY: number, maxX: number, maxY: number): Rectangle {
  return {minX, minY, maxX, maxY};
}

/**
Measure the distance from this Rectangle to a different Rectangle, using the
nearest two corners. If there is any overlap in either the x-axis or y-axis
(including if two sides are exactly adjacent), it will return 0 for that
component. However, there is only true overlap if both components are 0.

Returns a tuple: [x_axis_distance, y_axis_distance]
*/
export function distanceToRectangle(from: Rectangle, to: Rectangle): [number, number] {
  // 1) measure x-axis displacement
  let dx = 0; // default to the overlap case
  if (to.maxX < from.minX) {
    // target Rectangle is completely disjoint to the left
    dx = from.minX - to.maxX;
  }
  else if (to.minX > from.maxX) {
    // target Rectangle is completely disjoint to the right
    dx = to.minX - from.maxX;
  }
  // 2) measure y-axis displacement
  let dy = 0;
  if (to.maxY < from.minY) {
    // target Rectangle is completely disjoint above
    dy = from.minY - to.maxY;
  }
  else if (to.minY > from.maxY) {
    // target Rectangle is completely disjoint below
    dy = to.minY - from.maxY;
  }
  // 3) return a tuple
  return [dx, dy];
}

/**
Find the Rectangle that contains both {source} and {target}.
*/
export function boundingRectangle(...rectangles: Rectangle[]): Rectangle {
  // super(Infinity, Infinity, -Infinity, -Infinity);
  return {
    minX: Math.min(...rectangles.map(({minX}) => minX)),
    minY: Math.min(...rectangles.map(({minY}) => minY)),
    maxX: Math.max(...rectangles.map(({maxX}) => maxX)),
    maxY: Math.max(...rectangles.map(({maxY}) => maxY)),
  };
}

export const emptyRectangle: Rectangle = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};

export function formatRectangle({minX, minY, maxX, maxY}: Rectangle, digits = 0): string {
  return `[${minX.toFixed(digits)}, ${minY.toFixed(digits)}, ${maxX.toFixed(digits)}, ${maxY.toFixed(digits)}]`;
}

/**
Returns true if {source} fully contains {target}.

The calculation is inclusive; i.e., source.containsRectangle(source) === true
*/
export function containsRectangle(source: Rectangle, target: Rectangle): boolean {
  return (source.minX <= target.minX) && (source.minY <= target.minY) &&
         (source.maxX >= target.maxX) && (source.maxY >= target.maxY);
}

export interface Container<T extends Rectangle> extends Rectangle {
  elements: T[];
}

/**
Add the given {elements} to the container's elements, creating a new container
with its bounds extended to contain the new elements if needed.

TODO: optimize this by using PointArray (plain `push()` incurs a lot of function calls).
*/
export function addElements<T extends Rectangle>(container: Container<T>, ...newElements: T[]): Container<T> {
  const elements = container.elements.concat(newElements);
  return assign(boundingRectangle(container, ...newElements), {elements});
}

/**
Combine the elements of {target} and {source} (target ++ source) and expand the
bounds to contain both. It's more efficient than addElements(target, source.elements),
since source already knows its bounding box.
*/
export function mergeContainer<T extends Rectangle>(target: Container<T>, source: Container<T>): Container<T> {
  const elements = target.elements.concat(source.elements);
  return assign(boundingRectangle(target, source), {elements});
}

export function makeContainer<T extends Rectangle>(): Container<T> {
  const {minX, minY, maxX, maxY} = emptyRectangle;
  return {elements: [], minX, minY, maxX, maxY};
}

/**
> Because a transformation matrix has only six elements that can be changed, in most cases in PDF it shall be specified as the six-element array [a b c d e f].

                 ⎡ a b 0 ⎤
[a b c d e f] => ⎢ c d 0 ⎥
                 ⎣ e f 1 ⎦

*/

export type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
Multiply two 3x3 matrices, returning a new 3x3 matrix representation.

See 8.3.4 for a shortcut for avoiding full matrix multiplications.
*/
export function mat3mul(A: Mat3, B: Mat3): Mat3 {
  return [
    (A[0] * B[0]) + (A[1] * B[3]) + (A[2] * B[6]), // [0] a
    (A[0] * B[1]) + (A[1] * B[4]) + (A[2] * B[7]), // [1] b
    (A[0] * B[2]) + (A[1] * B[5]) + (A[2] * B[8]), // [2] 0
    (A[3] * B[0]) + (A[4] * B[3]) + (A[5] * B[6]), // [3] c
    (A[3] * B[1]) + (A[4] * B[4]) + (A[5] * B[7]), // [4] d
    (A[3] * B[2]) + (A[4] * B[5]) + (A[5] * B[8]), // [5] 0
    (A[6] * B[0]) + (A[7] * B[3]) + (A[8] * B[6]), // [6] e
    (A[6] * B[1]) + (A[7] * B[4]) + (A[8] * B[7]), // [7] f
    (A[6] * B[2]) + (A[7] * B[5]) + (A[8] * B[8]), // [8] 1
  ];
}

/**
Add two 3x3 matrices, returning a new 3x3 matrix representation.
*/
export function mat3add(A: Mat3, B: Mat3): Mat3 {
  return [
    A[0] + B[0], A[1] + B[1], A[2] + B[2],
    A[3] + B[3], A[4] + B[4], A[5] + B[5],
    A[6] + B[6], A[7] + B[7], A[8] + B[8]
  ];
}

export const mat3ident: Mat3 = [1, 0, 0,
                                0, 1, 0,
                                0, 0, 1];
