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

/**
Search the codebase for @util.memoize or @memoize for usage examples.
*/
export function memoize<T>(target: Object,
                           propertyKey: string,
                           descriptor: TypedPropertyDescriptor<T>) {
  var get = descriptor.get;
  var memoizedPropertyKey = `_memoized_${propertyKey}`;
  descriptor.get = function() {
    var got = memoizedPropertyKey in this;
    // `got` will be true if this memoize has been called before, even if
    // the result at the time was `undefined`.
    // I.e., after calling `obj['myProp'] = undefined`, `'myProp' in obj`
    // will be true.
    if (!got) {
      this[memoizedPropertyKey] = get.call(this);
    }
    return this[memoizedPropertyKey];
  }
  return descriptor;
}

/**
Parse a string of hexadecimal characters by slicing off substrings that are
`byteLength`-long, and then using parseInt with a base of 16.

Returns an array of character codes, not a string.
*/
export function parseHexCodes(hexstring: string, byteLength: number): number[] {
  var charCodes: number[] = [];
  for (var i = 0; i < hexstring.length; i += byteLength) {
    var charHexadecimal = hexstring.slice(i, i + byteLength);
    charCodes.push(parseInt(charHexadecimal, 16));
  }
  return charCodes;
}

/**
Create a string from the given character code array using String.fromCharCode.
Each character code should be at most 16 bits, i.e., less than 65536.
*/
export function makeString(charCodes: number[]): string {
  return String.fromCharCode.apply(null, charCodes);
}
