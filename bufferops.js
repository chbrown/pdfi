/// <reference path="type_declarations/index.d.ts" />
/** bufferops#compare(haystack: Buffer, needle: Buffer, ...): boolean
 *
 * returns true if haystack starts with needle, i.e.:
 *
 *     haystack[haystack_offset:haystack_length] == needle[:needle_length]
 *
 * Effectively bufferops#startsWith if only haystack and needle are given.
 */
function compare(haystack, needle, haystack_offset, haystack_length, needle_length) {
    if (haystack_offset === void 0) { haystack_offset = 0; }
    if (haystack_length === void 0) { haystack_length = haystack.length; }
    if (needle_length === void 0) { needle_length = needle.length; }
    if ((haystack_offset + needle_length) > haystack_length)
        return false;
    for (var i = 0; i < needle_length; i++) {
        if (needle[i] !== haystack[haystack_offset + i]) {
            return false;
        }
    }
    return true;
}
exports.compare = compare;
/** bufferops#indexOf(haystack: Buffer, needle: Buffer, ...): number

Returns the index (within `haystack`) of the first character of the first
occurrence of `needle` after haystack_offset.

Returns null if haystack does not contain needle.
*/
function indexOf(haystack, needle, haystack_offset, haystack_length, needle_length) {
    if (haystack_offset === void 0) { haystack_offset = 0; }
    if (haystack_length === void 0) { haystack_length = haystack.length; }
    if (needle_length === void 0) { needle_length = needle.length; }
    for (var i = haystack_offset; i < haystack_length; i++) {
        if (compare(haystack, needle, i, haystack_length, needle_length)) {
            return i;
        }
    }
    return null;
}
exports.indexOf = indexOf;
/** bufferops#equalTo(left: Buffer, right: Buffer, ...): boolean

Returns true iff the designated slices of left and right are equal.

    left[left_offset:left_length] == right[right_offset:right_length]
*/
function equalTo(left, right, left_offset, left_end, right_offset, right_end) {
    if (left_offset === void 0) { left_offset = 0; }
    if (left_end === void 0) { left_end = left.length - left_offset; }
    if (right_offset === void 0) { right_offset = 0; }
    if (right_end === void 0) { right_end = right.length - right_offset; }
    var left_length = left_end - left_offset;
    // return false immediately if they are different lengths
    if (left_length !== right_end - right_offset)
        return false;
    for (var i = 0; i < left_length; i++) {
        if (left[left_offset + i] !== right[right_offset + i]) {
            return false;
        }
    }
    return true;
}
exports.equalTo = equalTo;
