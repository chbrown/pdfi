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
