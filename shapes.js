var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
function min(numbers) {
    return Math.min.apply(null, numbers);
}
function max(numbers) {
    return Math.max.apply(null, numbers);
}
var Point = (function () {
    function Point(x, y) {
        this.x = x;
        this.y = y;
    }
    Point.prototype.clone = function () {
        return new Point(this.x, this.y);
    };
    /**
    This works a lot like the CSS `transform: matrix(a, c, b, d, tx, ty)` syntax.
  
    Returns a new Point.
    */
    Point.prototype.transform = function (a, c, b, d, tx, ty) {
        if (tx === void 0) { tx = 0; }
        if (ty === void 0) { ty = 0; }
        return new Point((a * this.x) + (b * this.y) + tx, (c * this.x) + (d * this.y) + ty);
    };
    return Point;
})();
exports.Point = Point;
var Size = (function () {
    function Size(width, height) {
        this.width = width;
        this.height = height;
    }
    return Size;
})();
exports.Size = Size;
/**
This is much like the standard PDF rectangle, using two diagonally opposite
corners of a rectangle as its internal representation, but we are always assured
that they represent the corner nearest the origin first (as minX/minY), and the
opposite corner last (as maxX/maxY).
*/
var Rectangle = (function () {
    function Rectangle(minX, minY, maxX, maxY) {
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
    }
    Object.defineProperty(Rectangle.prototype, "midX", {
        get: function () {
            return (this.maxX - this.minX) / 2 + this.minX;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "midY", {
        get: function () {
            return (this.maxY - this.minY) / 2 + this.minY;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "dX", {
        /**
        I.e., width
        */
        get: function () {
            return this.maxX - this.minX;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "dY", {
        /**
        I.e., height
        */
        get: function () {
            return this.maxY - this.minY;
        },
        enumerable: true,
        configurable: true
    });
    /**
    Returns true if this fully contains the other rectangle.
  
    The calculation is inclusive; i.e., this.containsRectangle(this) === true
    */
    Rectangle.prototype.containsRectangle = function (other) {
        return (this.minX <= other.minX) && (this.minY <= other.minY) && (this.maxX >= other.maxX) && (this.maxY >= other.maxY);
    };
    return Rectangle;
})();
exports.Rectangle = Rectangle;
var Container = (function (_super) {
    __extends(Container, _super);
    function Container(elements) {
        var _this = this;
        if (elements === void 0) { elements = []; }
        _super.call(this, Infinity, Infinity, -Infinity, -Infinity);
        this.elements = [];
        elements.forEach(function (element) { return _this.push(element); });
    }
    Object.defineProperty(Container.prototype, "length", {
        get: function () {
            return this.elements.length;
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
    return Container;
})(Rectangle);
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
})(Rectangle);
exports.TextSpan = TextSpan;
