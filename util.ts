export function countSpaces(haystack: string): number {
  const matches = haystack.match(/ /g);
  return matches ? matches.length : 0;
}

export function clone(source: any, target: any = {}): any {
  for (let key in source) {
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
  const get = descriptor.get;
  const memoizedPropertyKey = `_memoized_${propertyKey}`;
  descriptor.get = function() {
    let got = memoizedPropertyKey in this;
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

function typeOf(object: any): string {
  if (object === undefined) {
    return 'undefined';
  }
  if (object === null) {
    return 'null';
  }
  if (object.constructor && object.constructor.name) {
    return object.constructor.name;
  }
  return typeof object;
}

export function checkArguments(argument_options: any[]) {
  return function<T extends Function>(target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<T>) {
    // target is the class, not the instance
    // descriptor.value has type T; this decorator should only be called on
    // normal functions, so T is a function
    const originalFn = descriptor.value;
    const checkedFunction: T = <any>function() {
      const errors: string[] = [];
      for (let i = 0; i < argument_options.length; i++) {
        const value_type = typeOf(arguments[i]);
        if (value_type !== argument_options[i].type) {
          errors.push(`Argument[${i}] actual (${value_type}) ≠ expected (${argument_options[i].type})`);
        }
      }
      if (errors.length > 0) {
        throw new TypeError(`Type mismatch: ${errors.join(', ')}`);
      }
      return originalFn.apply(this, arguments);
    }
    const wrapper = {};
    wrapper[propertyKey + '_checked'] = checkedFunction
    descriptor.value = wrapper[propertyKey + '_checked'];
    return descriptor;
  }
}

/**
Parse a string of hexadecimal characters by slicing off substrings that are
`byteLength`-long, and then using parseInt with a base of 16.

Returns an array of character codes, not a string.
*/
export function parseHexCodes(hexstring: string, byteLength: number): number[] {
  const charCodes: number[] = [];
  for (let i = 0; i < hexstring.length; i += byteLength) {
    const charHexadecimal = hexstring.slice(i, i + byteLength);
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

export class Multiset {
  public total = 0;
  public elements: {[index: string]: number} = {};

  constructor() { }

  add(element: string) {
    this.elements[element] = (this.elements[element] || 0) + 1;
    this.total++;
  }

  get(element: string): number {
    return this.elements[element] || 0;
  }
}
