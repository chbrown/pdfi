function countSpaces(haystack) {
    var matches = haystack.match(/ /g);
    return matches ? matches.length : 0;
}
exports.countSpaces = countSpaces;
function clone(source, target) {
    if (target === void 0) { target = {}; }
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
exports.clone = clone;
/**
More naive than, say, object-assign's shim, but simpler.
*/
function assign(target) {
    if (target === void 0) { target = {}; }
    var sources = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        sources[_i - 1] = arguments[_i];
    }
    sources.forEach(function (source) {
        Object.keys(source).forEach(function (key) {
            target[key] = source[key];
        });
    });
    return target;
}
exports.assign = assign;
/**
Search the codebase for @util.memoize or @memoize for usage examples.
*/
function memoize(target, propertyKey, descriptor) {
    var get = descriptor.get;
    var memoizedPropertyKey = "_memoized_" + propertyKey;
    descriptor.get = function () {
        var got = memoizedPropertyKey in this;
        // `got` will be true if this memoize has been called before, even if
        // the result at the time was `undefined`.
        // I.e., after calling `obj['myProp'] = undefined`, `'myProp' in obj`
        // will be true.
        if (!got) {
            this[memoizedPropertyKey] = get.call(this);
        }
        return this[memoizedPropertyKey];
    };
    return descriptor;
}
exports.memoize = memoize;
function typeOf(object) {
    if (object === undefined) {
        return 'undefined';
    }
    if (object === null) {
        return 'null';
    }
    if (object.constructor.name) {
        return object.constructor.name;
    }
    return typeof object;
}
function checkArguments(argument_options) {
    return function (target, propertyKey, descriptor) {
        // target is the class, not the instance
        // descriptor.value has type T; this decorator should only be called on
        // normal functions, so T is a function
        var originalFn = descriptor.value;
        var checkedFunction = function () {
            var errors = [];
            for (var i = 0; i < argument_options.length; i++) {
                var value_type = typeOf(arguments[i]);
                if (value_type !== argument_options[i].type) {
                    errors.push("Argument[" + i + "] actual (" + value_type + ") \u2260 expected (" + argument_options[i].type + ")");
                }
            }
            if (errors.length > 0) {
                throw new TypeError("Type mismatch: " + errors.join(', '));
            }
            return originalFn.apply(this, arguments);
        };
        var wrapper = {};
        wrapper[propertyKey + '_checked'] = checkedFunction;
        descriptor.value = wrapper[propertyKey + '_checked'];
        return descriptor;
    };
}
exports.checkArguments = checkArguments;
/**
Parse a string of hexadecimal characters by slicing off substrings that are
`byteLength`-long, and then using parseInt with a base of 16.

Returns an array of character codes, not a string.
*/
function parseHexCodes(hexstring, byteLength) {
    var charCodes = [];
    for (var i = 0; i < hexstring.length; i += byteLength) {
        var charHexadecimal = hexstring.slice(i, i + byteLength);
        charCodes.push(parseInt(charHexadecimal, 16));
    }
    return charCodes;
}
exports.parseHexCodes = parseHexCodes;
/**
Create a string from the given character code array using String.fromCharCode.
Each character code should be at most 16 bits, i.e., less than 65536.
*/
function makeString(charCodes) {
    return String.fromCharCode.apply(null, charCodes);
}
exports.makeString = makeString;
var Multiset = (function () {
    function Multiset() {
        this.total = 0;
        this.elements = {};
    }
    Multiset.prototype.add = function (element) {
        this.elements[element] = (this.elements[element] || 0) + 1;
        this.total++;
    };
    Multiset.prototype.get = function (element) {
        return this.elements[element] || 0;
    };
    return Multiset;
})();
exports.Multiset = Multiset;
