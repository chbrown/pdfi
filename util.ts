export function countSpaces(haystack: string): number {
  var matches = haystack.match(/ /g);
  return matches ? matches.length : 0;
}

export function clone(source: any, target: any = {}): any {
  for (var key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] === null || source[key] === undefined) {
        target[key] = source[key];
      }
      else if (source[key].clone) {
        target[key] = source[key].clone();
      }
      else if (Array.isArray(source[key])) {
        target[key] = source[key].slice();
      }
      else {
        target[key] = source[key];
      }
    }
  }
  return target;
}
