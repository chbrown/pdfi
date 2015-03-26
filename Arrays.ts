/**
TODO: disallow mixing of arrays and non-arrays? (concat don't care)
*/
export function flatten<T>(arrays: T[][]): T[] {
  return Array.prototype.concat.apply([], arrays);
}

export function flatMap<T, R>(elements: T[], callback: (element: T, index: number, array: T[]) => R[], thisArg?: any): R[] {
  var arrays: R[][] = elements.map(callback, thisArg);
  return flatten(arrays);
}

export function sum(xs: number[]): number {
  // return xs.reduce((a, b) => a + b, 0);
  var sum = 0;
  for (var i = 0, l = xs.length; i < l; i++) {
    sum += xs[i];
  }
  return sum;
}

export function median(xs: number[]): number {
  xs.sort((a, b) => a - b);
  var middle = xs.length / 2;
  // if xs is even, average the two middle items
  if (xs.length % 2 === 0) {
    return (xs[middle - 1] + xs[middle]) / 2.0;
  }
  return xs[middle | 0];
}

export function mean(xs: number[]): number {
  return sum(xs) / xs.length;
}

export function min(xs: number[]): number {
  return Math.min.apply(null, xs);
}

export function max(xs: number[]): number {
  return Math.max.apply(null, xs);
}

export function mkString(charCodes: number[]): string {
  return String.fromCharCode.apply(null, charCodes);
}

/**
range(10, 4) => [0, 4, 8]
range(12, 4) => [0, 4, 8]
range( 0, 4) => []
*/
export function range(max: number, step: number = 1): number[] {
  var length = Math.ceil(max / step);
  var indices = new Array<number>(length);
  for (var i = 0; i < length; i++) {
    indices[i] = i * step;
  }
  return indices;
}

/**
groups([1, 2, 3, 4, 5], 1) => [[1], [2], [3], [4], [5]]
groups([1, 2, 3, 4, 5], 2) => [[1, 2], [3, 4], [5]]
groups([1, 2, 3, 4, 5], 3) => [[1, 2, 3], [4, 5]]
*/
export function groups<T>(elements: T[], size: number): T[][] {
  var groups: T[][] = [];
  var index = 0;
  var offset = 0;
  var length = elements.length;
  while (offset < length) {
    groups[index] = elements.slice(offset, offset + size);
    index++;
    offset += size;
  }
  return groups;
}
