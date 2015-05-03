/// <reference path="type_declarations/index.d.ts" />
/**
Returns true iff `haystack`, starting at fromIndex, matches `needle`.

    haystack[fromIndex:haystack.length] == needle[:needle.length]
*/
function compare(haystack, needle, fromIndex) {
    if (fromIndex === void 0) { fromIndex = 0; }
    if ((fromIndex + needle.length) > haystack.length)
        return false;
    for (var i = 0; i < needle.length; i++) {
        if (needle[i] !== haystack[fromIndex + i]) {
            return false;
        }
    }
    return true;
}
exports.compare = compare;
/**
Returns the index (within `haystack`) of the first character of the first
occurrence of `needle` after haystack_offset.

Returns null if haystack does not contain needle.
*/
function indexOf(haystack, needle, fromIndex) {
    if (fromIndex === void 0) { fromIndex = 0; }
    for (var i = fromIndex; i < haystack.length; i++) {
        if (compare(haystack, needle, i)) {
            return i;
        }
    }
    return null;
}
exports.indexOf = indexOf;
/**
Returns the index (within `haystack`) of the first character of the last
occurrence of `needle` before haystack_offset.

Returns null if haystack does not contain needle.
*/
function lastIndexOf(haystack, needle, fromIndex) {
    if (fromIndex === void 0) { fromIndex = haystack.length; }
    for (var i = fromIndex; i > -1; i--) {
        if (compare(haystack, needle, i)) {
            return i;
        }
    }
    return null;
}
exports.lastIndexOf = lastIndexOf;
/**
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
    // check each character
    for (var i = 0; i < left_length; i++) {
        if (left[left_offset + i] !== right[right_offset + i]) {
            return false;
        }
    }
    return true;
}
exports.equalTo = equalTo;
