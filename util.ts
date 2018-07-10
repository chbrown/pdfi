export function clone(source: any, target: any = {}): any {
  for (const key in source) {
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
    const got = memoizedPropertyKey in this;
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
    const checkedFunction: T = function() {
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
    } as any
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
Returns the character codes represented by the given buffer, read
{characterByteLength} bytes at a time.
*/
export function readCharCodes(buffer: Buffer, characterByteLength: number = 1): number[] {
  const charCodes: number[] = [];
  for (let offset = 0, length = buffer.length; offset < length; offset += characterByteLength) {
    const charCode = buffer.readUIntBE(offset, characterByteLength);
    charCodes.push(charCode);
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

/**
Overwrite target with all indices that have defined values in source.
*/
export function mergeArray<T>(target: T[], source: T[]): T[] {
  source.forEach((item, i) => {
    if (item !== undefined) {
      target[i] = item;
    }
  });
  return target;
}

/**
Simpler special purpose version of something like https://github.com/substack/endian-toggle
*/
export function swapEndian(buffer: Buffer): Buffer {
  let byte: number;
  for (let i = 0, l = buffer.length - 1; i < l; i += 2) {
    byte = buffer[i];
    buffer[i] = buffer[i + 1];
    buffer[i + 1] = byte;
  }
  return buffer;
}

/**
If a line ends with a hyphen, we remove the hyphen and join it to
the next line directly; otherwise, join them with a space.

Render each Paragraph into a single string with any pre-existing EOL
markers converted to spaces, and any control characters stripped out.

bag_of_words is used to look at the whole document for indicators of
intentionally hyphenated words. It should be all lowercase, and is usually an
instance of Multiset.
*/
export function unwrapLines(lines: string[], bag_of_words: {get(token: string): number}): string {
  // each line in lines is guaranteed not to contain whitespace other than
  // SPACE, since they've all been run through flattenLine, so when we join
  // with newline characters here, we know that only newlines in the string
  // are the ones we've just added
  const joined = lines.join('\n');
  // now look for all occurrences of "-\n", capturing the words before and after
  const rejoined = joined.replace(/(\w+)-\n(\w+)/g, (_, left: string, right: string) => {
    // if line is hyphenated, and the word that is broken turns up in the corpus
    // more times WITH the hyphen than WITHOUT, return it WITH the hyphen
    const left_lower = left.toLowerCase();
    const right_lower = right.toLowerCase();
    const hyphenated = `${left}-${right}`;
    const nhyphenated = bag_of_words.get(`${left_lower}-${right_lower}`);
    const dehyphenated = `${left}${right}`;
    const ndehyphenated = bag_of_words.get(`${left_lower}${right_lower}`);
    if (nhyphenated > ndehyphenated) {
      return hyphenated
    }
    else if (ndehyphenated > nhyphenated) {
      return dehyphenated;
    }
    // otherwise, they're equal (both 0, usually), which is tougher
    // 1. if the second of the two parts is capitalized (Uppercase-Lowercase),
    //    it's probably a hyphenated name, so keep it hyphenated
    const capitalized = right[0] === right[0].toUpperCase();
    if (capitalized) {
      return hyphenated;
    }
    // TODO: what about Uppercase-lowercase? Can we assume anything?
    // 2. if the two parts are reasonable words in themselves, keep them
    //    hyphenated (it's probably something like "one-vs-all", or "bag-of-words")
    const common_parts = (bag_of_words.get(left_lower) + bag_of_words.get(right_lower)) > 2;
    if (common_parts) {
      return hyphenated;
    }
    // finally, default to dehyphenation, which is by far more common than
    // hyphenation (though it's more destructive of an assumption when wrong)
    return dehyphenated;
  });
  // the remaining line breaks are legimate breaks between words, so we simply
  // replace them with a plain SPACE
  return rejoined.replace(/\n/g, ' ');
}
