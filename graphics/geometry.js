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
    Rectangle.prototype.toString = function (digits) {
        if (digits === void 0) { digits = 0; }
        // var size_string = `(${this.dX.toFixed(digits)}x${this.dY.toFixed(digits)})`;
        // return `${point_string} ${size_string}`;
        // [span.minX, span.minY, span.maxX, span.maxY].map(x => x.toFixed(3)).join(',');
        return "[" + this.minX.toFixed(digits) + ", " + this.minY.toFixed(digits) + ", " + this.maxX.toFixed(digits) + ", " + this.maxY.toFixed(digits) + "]";
    };
    /**
    Returns true if this fully contains the other rectangle.
  
    The calculation is inclusive; i.e., this.containsRectangle(this) === true
    */
    Rectangle.prototype.containsRectangle = function (other) {
        return (this.minX <= other.minX) && (this.minY <= other.minY) &&
            (this.maxX >= other.maxX) && (this.maxY >= other.maxY);
    };
    return Rectangle;
})();
exports.Rectangle = Rectangle;
