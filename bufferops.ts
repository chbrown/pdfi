/// <reference path="type_declarations/index.d.ts" />

/**
Returns true iff `haystack`, starting at fromIndex, matches `needle`.

    haystack[fromIndex:haystack.length] == needle[:needle.length]
*/
export function compare(haystack: Buffer, needle: Buffer,
                        fromIndex: number = 0): boolean {
  if ((fromIndex + needle.length) > haystack.length) return false;
  for (var i = 0; i < needle.length; i++) {
    if (needle[i] !== haystack[fromIndex + i]) {
      return false;
    }
  }
  return true;
}

/**
Returns the index (within `haystack`) of the first character of the first
occurrence of `needle` after haystack_offset.

Returns null if haystack does not contain needle.
*/
export function indexOf(haystack: Buffer, needle: Buffer,
                        fromIndex: number = 0): number {
  for (var i = fromIndex; i < haystack.length; i++) {
    if (compare(haystack, needle, i)) {
      return i;
    }
  }
  return null;
}

/**
Returns the index (within `haystack`) of the first character of the last
occurrence of `needle` before haystack_offset.

Returns null if haystack does not contain needle.
*/
export function lastIndexOf(haystack: Buffer, needle: Buffer,
                            fromIndex: number = haystack.length): number {
  for (var i = fromIndex; i > -1; i--) {
    if (compare(haystack, needle, i)) {
      return i;
    }
  }
  return null;
}

/**
Returns true iff the designated slices of left and right are equal.

    left[left_offset:left_length] == right[right_offset:right_length]
*/
export function equalTo(left: Buffer, right: Buffer,
                        left_offset: number = 0,
                        left_end: number = left.length - left_offset,
                        right_offset: number = 0,
                        right_end: number = right.length - right_offset): boolean {
  var left_length = left_end - left_offset;
  // return false immediately if they are different lengths
  if (left_length !== right_end - right_offset) return false;
  // check each character
  for (var i = 0; i < left_length; i++) {
    if (left[left_offset + i] !== right[right_offset + i]) {
      return false;
    }
  }
  return true;
}
