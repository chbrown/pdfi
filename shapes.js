function min(numbers) {
    return Math.min.apply(null, numbers);
}
function max(numbers) {
    return Math.max.apply(null, numbers);
}
function rectanglesToPointArray(rectangles) {
    var xs = [];
    var ys = [];
    rectangles.forEach(function (rectangle) {
        xs.push(rectangle.minX, rectangle.maxX);
        ys.push(rectangle.minY, rectangle.maxY);
    });
    return [xs, ys];
}
function pointsToPointArray(points) {
    return [points.map(function (point) { return point.x; }), points.map(function (point) { return point.y; })];
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
A PDF Rectangle is a 4-tuple [x1, y1, x2, y2], where [x1, y1] and [x2, y2] are
points in any two diagonally opposite corners, usually lower-left to
upper-right.

From the spec:

> **rectangle**
> a specific array object used to describe locations on a page and bounding
> boxes for a variety of objects and written as an array of four numbers giving
> the coordinates of a pair of diagonally opposite corners, typically in the
> form `[ llx lly urx ury ]` specifying the lower-left x, lower-left y,
> upper-right x, and upper-right y coordinates of the rectangle, in that order
*/
// export type RectangleTuple = [number, number, number, number]
/**
This is much like the standard PDF rectangle, using two diagonally opposite
corners of a rectangle as its internal representation, but we are always assured
that they represent the corner nearest the origin first, and the opposite corner
last.
*/
var Rectangle = (function () {
    function Rectangle(minX, minY, maxX, maxY) {
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
    }
    Rectangle.bounding = function (pointArray) {
        return new Rectangle(min(pointArray[0]), min(pointArray[1]), max(pointArray[0]), max(pointArray[1]));
    };
    Rectangle.fromPointSize = function (point, size) {
        return new Rectangle(point.x, point.y, point.x + size.width, point.y + size.height);
    };
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
    Rectangle.prototype.toJSON = function () {
        return {
            x: this.minX,
            y: this.minY,
            width: this.dX,
            height: this.dY,
        };
    };
    return Rectangle;
})();
exports.Rectangle = Rectangle;
var TextSpan = (function () {
    function TextSpan(string, bounds, fontSize, details) {
        this.string = string;
        this.bounds = bounds;
        this.fontSize = fontSize;
        this.details = details;
    }
    TextSpan.prototype.toJSON = function () {
        return {
            string: this.string,
            x: this.bounds.minX,
            y: this.bounds.minY,
            width: this.bounds.dX,
            height: this.bounds.dY,
            fontSize: this.fontSize,
            details: this.details,
        };
    };
    return TextSpan;
})();
exports.TextSpan = TextSpan;
