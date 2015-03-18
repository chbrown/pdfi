var graphics = require('./parsers/graphics');
/**
This works a lot like the CSS `transform: matrix(a, c, b, d, tx, ty)` syntax.
*/
function transform2d(x, y, a, c, b, d, tx, ty) {
    return [(a * x) + (b * y) + tx, (c * x) + (d * y) + ty];
}
var Point = (function () {
    function Point(x, y) {
        this.x = x;
        this.y = y;
    }
    Point.prototype.clone = function () {
        return new Point(this.x, this.y);
    };
    Point.prototype.set = function (x, y) {
        this.x = x;
        this.y = y;
    };
    Point.prototype.move = function (dx, dy) {
        this.x += dx;
        this.y += dy;
    };
    Point.toPointArray = function (points) {
        return [points.map(function (point) { return point.x; }), points.map(function (point) { return point.y; })];
    };
    return Point;
})();
exports.Point = Point;
var Rectangle = (function () {
    function Rectangle(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
    Rectangle.bounding = function (pointArray) {
        var min_x = Math.min.apply(null, pointArray[0]);
        var min_y = Math.min.apply(null, pointArray[1]);
        var max_x = Math.max.apply(null, pointArray[0]);
        var max_y = Math.max.apply(null, pointArray[1]);
        return new Rectangle(min_x, min_y, max_x - min_x, max_y - min_y);
    };
    Rectangle.prototype.toJSON = function () {
        return [this.x, this.y, this.x + this.width, this.y + this.height];
    };
    Rectangle.toPointArray = function (rectangles) {
        var xs = [];
        var ys = [];
        rectangles.forEach(function (rectangle) {
            xs.push(rectangle.x, rectangle.x + rectangle.width);
            ys.push(rectangle.y, rectangle.y + rectangle.height);
        });
        return [xs, ys];
    };
    return Rectangle;
})();
exports.Rectangle = Rectangle;
var TextSpan = (function () {
    function TextSpan(text, box, fontName, fontSize) {
        this.text = text;
        this.box = box;
        this.fontName = fontName;
        this.fontSize = fontSize;
    }
    TextSpan.prototype.toJSON = function () {
        return {
            text: this.text,
            box: this.box,
            fontName: this.fontName,
            fontSize: this.fontSize,
        };
    };
    return TextSpan;
})();
exports.TextSpan = TextSpan;
var Canvas = (function () {
    function Canvas(MediaBox) {
        this.MediaBox = MediaBox;
        // Eventually, this will render out other elements, too
        this.spans = [];
    }
    /**
    When we render a page, we specify a ContentStream as well as a Resources
    dictionary. That Resources dictionary may contain XObject streams that are
    embedded as `Do` operations in the main contents, as well as sub-Resources
    in those XObjects.
    */
    Canvas.prototype.render = function (string_iterable, Resources) {
        var context = new graphics.DrawingContext(Resources);
        context.render(string_iterable, this);
    };
    Canvas.prototype.getBounds = function () {
        var pointArray = Rectangle.toPointArray(this.spans.map(function (span) { return span.box; }));
        return Rectangle.bounding(pointArray);
    };
    /**
    We define a header as the group of spans at the top separated from the rest
    of the text by at least `min_header_gap`, but which is at most
    `max_header_height` high.
    */
    Canvas.prototype.getHeader = function (max_header_height, min_header_gap) {
        if (max_header_height === void 0) { max_header_height = 40; }
        if (min_header_gap === void 0) { min_header_gap = 20; }
        var boxes = this.spans.map(function (span) { return span.box; });
        // sort occurs in place but `points` is a new array anyway (though it's
        // shallow; the points are not copies)
        // sorts in ascending order.
        boxes.sort(function (a, b) { return a.y - b.y; });
        var header_min_y = boxes[0].y;
        // now we read glom through the following points until we hit one that's too far
        var header_max_y = header_min_y;
        var box_i = 1;
        for (; box_i < boxes.length; box_i++) {
            var dy = boxes[box_i].y - header_max_y;
            if (dy > min_header_gap) {
                break;
            }
            header_max_y = boxes[box_i].y;
            // if we've surpassed how high we decided the header can get, give up
            if (header_max_y - header_min_y > max_header_height) {
                return null;
            }
        }
        var pointArray = Rectangle.toPointArray(boxes.slice(0, box_i));
        return Rectangle.bounding(pointArray);
    };
    Canvas.prototype.getFooter = function (max_footer_height, min_footer_gap) {
        if (max_footer_height === void 0) { max_footer_height = 40; }
        if (min_footer_gap === void 0) { min_footer_gap = 20; }
        // var sorted_spans =
        var boxes = this.spans.map(function (span) { return span.box; });
        // sort in descending order
        boxes.sort(function (a, b) { return b.y - a.y; });
        var footer_max_y = boxes[0].y;
        // now we read glom through the following points until we hit one that's too far
        var footer_min_y = footer_max_y;
        var box_i = 1;
        for (; box_i < boxes.length; box_i++) {
            // dy is the distance from the point that's slightly higher on the page to
            // the currently determined top of the footer
            var dy = footer_min_y - boxes[box_i].y;
            if (dy > min_footer_gap) {
                break;
            }
            footer_min_y = boxes[box_i].y;
            // if we've surpassed how high we decided the footer can get, give up
            if (footer_max_y - footer_min_y > max_footer_height) {
                return null;
            }
        }
        var pointArray = Rectangle.toPointArray(boxes.slice(0, box_i));
        return Rectangle.bounding(pointArray);
    };
    Canvas.prototype.addSpan = function (text, x, y, width_units, fontName, fontSize) {
        // transform into origin at top left
        var canvas_position = transform2d(x, y, 1, 0, 0, -1, 0, this.MediaBox[3]);
        var box = new Rectangle(canvas_position[0], canvas_position[1], fontSize * (width_units / 1000), Math.ceil(fontSize) | 0);
        var span = new TextSpan(text, box, fontName, fontSize);
        this.spans.push(span);
    };
    Canvas.prototype.toJSON = function () {
        return {
            MediaBox: this.MediaBox,
            spans: this.spans,
            bounds: this.getBounds(),
            header: this.getHeader(),
            footer: this.getFooter(),
        };
    };
    return Canvas;
})();
exports.Canvas = Canvas;
