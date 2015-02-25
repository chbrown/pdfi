/// <reference path="type_declarations/index.d.ts" />

/** bufferops#compare(haystack: Buffer, needle: Buffer, ...): boolean
 *
 * returns true if haystack starts with needle, i.e.:
 *
 *     haystack[haystack_offset:haystack_length] == needle[:needle_length]
 *
 * Effectively bufferops#startsWith if only haystack and needle are given.
 */
export function compare(haystack: Buffer,
                        needle: Buffer,
                        haystack_offset: number = 0,
                        haystack_length: number = haystack.length,
                        needle_length: number = needle.length) {
  if ((haystack_offset + needle_length) > haystack_length) return false;
  for (var i = 0; i < needle_length; i++) {
    if (needle[i] !== haystack[haystack_offset + i]) {
      return false;
    }
  }
  return true;
}

/** bufferops#indexOf(haystack: Buffer, needle: Buffer, ...): number

Returns the index (within `haystack`) of the first character of the first
occurrence of `needle` after haystack_offset.

Returns null if haystack does not contain needle.
*/
export function indexOf(haystack: Buffer,
                        needle: Buffer,
                        haystack_offset: number = 0,
                        haystack_length: number = haystack.length,
                        needle_length: number = needle.length) {
  for (var i = haystack_offset; i < haystack_length; i++) {
    if (compare(haystack, needle, i, haystack_length, needle_length)) {
      return i;
    }
  }
  return null;
}

/** bufferops#equalTo(left: Buffer, right: Buffer, ...): boolean

Returns true iff the designated slices of left and right are equal.

    left[left_offset:left_length] == right[right_offset:right_length]
*/
export function equalTo(left: Buffer, right: Buffer,
                        left_offset: number = 0,
                        left_end: number = left.length - left_offset,
                        right_offset: number = 0,
                        right_end: number = right.length - right_offset) {
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
