function pushAll(array, items) {
    return Array.prototype.push.apply(array, items);
}
exports.pushAll = pushAll;
/**
TODO: disallow mixing of arrays and non-arrays? (concat don't care)
*/
function flatten(arrays) {
    return Array.prototype.concat.apply([], arrays);
}
exports.flatten = flatten;
function flatMap(elements, callback, thisArg) {
    var arrays = elements.map(callback, thisArg);
    return flatten(arrays);
}
exports.flatMap = flatMap;
function sum(xs) {
    // return xs.reduce((a, b) => a + b, 0);
    var sum = 0;
    for (var i = 0, l = xs.length; i < l; i++) {
        sum += xs[i];
    }
    return sum;
}
exports.sum = sum;
function median(xs) {
    xs.sort(function (a, b) { return a - b; });
    var middle = xs.length / 2;
    // if xs is even, average the two middle items
    if (xs.length % 2 === 0) {
        return (xs[middle - 1] + xs[middle]) / 2.0;
    }
    return xs[middle | 0];
}
exports.median = median;
/**
Returns an array of numbers that is (q + 1)-long (it includes the endpoints).
*/
function quantile(xs, q, sort) {
    if (sort === void 0) { sort = true; }
    var length = xs.length;
    var step = length / q;
    var quantile = [];
    if (sort) {
        xs.sort(function (a, b) { return a - b; });
    }
    for (var sample = 0; sample < length; sample += step) {
        quantile.push(xs[sample | 0]);
    }
    quantile.push(xs[length - 1]);
    return quantile;
}
exports.quantile = quantile;
/**
Return the mean of an array of numbers by calling sum() and dividing by the
length. No special accomodation is made for NaN's.
*/
function mean(xs) {
    return sum(xs) / xs.length;
}
exports.mean = mean;
/**
Return the minimum of an array of numbers using Math.min.
*/
function min(xs) {
    return Math.min.apply(null, xs);
}
exports.min = min;
/**
Return the maximum of an array of numbers using Math.max.
*/
function max(xs) {
    return Math.max.apply(null, xs);
}
exports.max = max;
/**
range(10, 4) => [0, 4, 8]
range(12, 4) => [0, 4, 8]
range( 0, 4) => []
*/
function range(max, step) {
    if (step === void 0) { step = 1; }
    var length = Math.ceil(max / step);
    var indices = new Array(length);
    for (var i = 0; i < length; i++) {
        indices[i] = i * step;
    }
    return indices;
}
exports.range = range;
/**
groups([1, 2, 3, 4, 5], 1) => [[1], [2], [3], [4], [5]]
groups([1, 2, 3, 4, 5], 2) => [[1, 2], [3, 4], [5]]
groups([1, 2, 3, 4, 5], 3) => [[1, 2, 3], [4, 5]]
*/
function groups(elements, size) {
    var groups = [];
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
exports.groups = groups;
