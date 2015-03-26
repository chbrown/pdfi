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
