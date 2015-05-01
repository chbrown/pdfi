var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Arrays_1 = require('../Arrays');
var geometry_1 = require('./geometry');
var Container = (function (_super) {
    __extends(Container, _super);
    function Container(elements) {
        if (elements === void 0) { elements = []; }
        _super.call(this, Infinity, Infinity, -Infinity, -Infinity);
        this.elements = [];
        this.pushElements(elements);
    }
    Object.defineProperty(Container.prototype, "length", {
        get: function () {
            return this.elements.length;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Container.prototype, "medianElementLeftOffset", {
        /**
        Returns the median distance between this container's left (inner) bound and
        the left bound of its elements.
      
        This is useful when we want to determine whether a given line is atypical
        within its specific container.
      
        Cached as `this._medianElementLeftOffset`.
        */
        get: function () {
            var _this = this;
            if (this._medianElementLeftOffset === undefined) {
                // leftOffsets will all be non-negative by definition; `this.minX` is the
                // the minimum minX of all of its elements. In other words:
                // `element.minX >= this.minX` for each `element` in `this.elements`
                var leftOffsets = this.elements.map(function (element) { return element.minX - _this.minX; });
                this._medianElementLeftOffset = Arrays_1.median(leftOffsets);
            }
            return this._medianElementLeftOffset;
        },
        enumerable: true,
        configurable: true
    });
    /**
    Add the given `element`, and extend to contain its Rectangle (if needed).
  
    This is a mutating method.
    */
    Container.prototype.push = function (element) {
        this.elements.push(element);
        this.minX = Math.min(this.minX, element.minX);
        this.minY = Math.min(this.minY, element.minY);
        this.maxX = Math.max(this.maxX, element.maxX);
        this.maxY = Math.max(this.maxY, element.maxY);
    };
    /**
    TODO: optimize this by using PointArray (plain `push()` incurs a lot of function calls).
    */
    Container.prototype.pushElements = function (elements) {
        var _this = this;
        elements.forEach(function (element) { return _this.push(element); });
    };
    return Container;
})(geometry_1.Rectangle);
exports.Container = Container;
var NamedContainer = (function (_super) {
    __extends(NamedContainer, _super);
    function NamedContainer(name, elements) {
        if (elements === void 0) { elements = []; }
        _super.call(this, elements);
        this.name = name;
    }
    return NamedContainer;
})(Container);
exports.NamedContainer = NamedContainer;
var TextSpan = (function (_super) {
    __extends(TextSpan, _super);
    function TextSpan(string, minX, minY, maxX, maxY, fontSize, details) {
        _super.call(this, minX, minY, maxX, maxY);
        this.string = string;
        this.fontSize = fontSize;
        this.details = details;
    }
    return TextSpan;
})(geometry_1.Rectangle);
exports.TextSpan = TextSpan;
