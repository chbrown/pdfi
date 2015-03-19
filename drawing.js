var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var graphics = require('./parsers/graphics');
function min(numbers) {
    return Math.min.apply(null, numbers);
}
function max(numbers) {
    return Math.max.apply(null, numbers);
}
/**
This works a lot like the CSS `transform: matrix(a, c, b, d, tx, ty)` syntax.
*/
function transform2d(x, y, a, c, b, d, tx, ty) {
    return [(a * x) + (b * y) + tx, (c * x) + (d * y) + ty];
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
    Point.prototype.set = function (x, y) {
        this.x = x;
        this.y = y;
    };
    Point.prototype.move = function (dx, dy) {
        this.x += dx;
        this.y += dy;
    };
    return Point;
})();
exports.Point = Point;
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
    Rectangle.fromPointSize = function (x, y, width, height) {
        return new Rectangle(x, y, x + width, y + height);
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
    /**
    Returns the a standard 4-tuple representation
    */
    Rectangle.prototype.toJSON = function () {
        return [this.minX, this.minY, this.maxX, this.maxY];
    };
    Rectangle.fromJSON = function (value) {
        return new Rectangle(Math.min(value[0], value[2]), Math.min(value[1], value[3]), Math.max(value[0], value[2]), Math.max(value[1], value[3]));
    };
    return Rectangle;
})();
exports.Rectangle = Rectangle;
var EmptyRectangle = (function (_super) {
    __extends(EmptyRectangle, _super);
    function EmptyRectangle() {
        _super.call(this, 0, 0, 0, 0);
    }
    EmptyRectangle.prototype.containsRectangle = function (other) {
        return false;
    };
    EmptyRectangle.prototype.toJSON = function () {
        return null;
    };
    return EmptyRectangle;
})(Rectangle);
exports.EmptyRectangle = EmptyRectangle;
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
var Paragraph = (function () {
    function Paragraph(lines) {
        if (lines === void 0) { lines = []; }
        this.lines = lines;
    }
    Paragraph.prototype.getText = function () {
        return this.lines.map(function (line) {
            if (line.match(/-$/)) {
                // if line is hyphenated, return it without the hyphen.
                return line.slice(0, -1);
            }
            else {
                // otherwise, return it with a space on the end
                return line + ' ';
            }
        }).join('').trim();
    };
    Paragraph.prototype.toJSON = function () {
        return {
            lines: this.lines,
            text: this.getText(),
        };
    };
    return Paragraph;
})();
exports.Paragraph = Paragraph;
var Section = (function () {
    // public paragraphs: Paragraph[];
    function Section(name, box) {
        this.name = name;
        this.box = box;
        this.spans = [];
    }
    Section.prototype.getText = function () {
        return this.spans.map(function (span) { return span.text; }).join(' ');
    };
    /**
    This Section's spans should be in reading order
  
    `max_line_gap`: the maximum distance between lines before we consider the
    next line a new paragraph.
    */
    Section.prototype.getParagraphs = function (max_line_gap) {
        if (max_line_gap === void 0) { max_line_gap = 5; }
        var paragraphs = [];
        var current_paragraph = new Paragraph();
        var current_line = '';
        var flushLine = function () {
            current_paragraph.lines.push(current_line);
            current_line = '';
        };
        var flushParagraph = function () {
            flushLine();
            paragraphs.push(current_paragraph);
            current_paragraph = new Paragraph();
        };
        // current_maxY is the current paragraph's bottom bound
        var current_maxY = 0;
        // for (var i = 0, span; (span = sorted_spans[i]); i++) {
        this.spans.forEach(function (span) {
            // dY is the distance from current bottom of the paragraph to the top of
            // the next span (this may come out negative, if the span is on the same
            // line as the last one)
            var dY = span.box.minY - current_maxY;
            if (dY > max_line_gap) {
                // okay, the total gap between the two lines is big enough to indicate
                // a new paragraph
                flushParagraph();
            }
            else if (dY > 0) {
                // if the new span does not horizontally overlap with the previous one,
                // we consider it a new line
                flushLine();
            }
            else {
                current_line += ' ';
            }
            current_line += span.text;
            current_maxY = span.box.maxY;
        });
        // finish up
        flushParagraph();
        return paragraphs;
    };
    Section.prototype.toJSON = function () {
        return {
            name: this.name,
            box: this.box,
            spans: this.spans,
            paragraphs: this.getParagraphs(),
            text: this.getText(),
        };
    };
    return Section;
})();
exports.Section = Section;
var Canvas = (function () {
    function Canvas(MediaBox) {
        this.spans = [];
        this.pageBox = Rectangle.fromJSON(MediaBox);
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
    /**
    We define a header as the group of spans at the top separated from the rest
    of the text by at least `min_header_gap`, but which is at most
    `max_header_height` high.
    */
    Canvas.prototype.getHeader = function (max_header_height, min_header_gap) {
        if (max_header_height === void 0) { max_header_height = 50; }
        if (min_header_gap === void 0) { min_header_gap = 10; }
        // sort in ascending order. the sort occurs in-place but the map creates a
        // new array anyway (though it's shallow; the points are not copies)
        var spans = this.spans.slice().sort(function (a, b) { return a.box.minY - b.box.minY; });
        // var boxes = this.spans.map(span => span.box).sort((a, b) => a.minY - b.minY);
        // the header starts as a page-wide sliver at the top of the highest span box
        var header_minY = spans[0].box.minY;
        var header_maxY = header_minY;
        for (var i = 0, next_lower_span; (next_lower_span = spans[i]); i++) {
            var dY = next_lower_span.box.minY - header_maxY;
            if (dY > min_header_gap) {
                break;
            }
            // set the new lower bound to the bottom of the newly added box
            header_maxY = next_lower_span.box.maxY;
            // if we've surpassed how high we decided the header can get, give up
            if ((header_maxY - header_minY) > max_header_height) {
                // set the header back to the default sliver at the top of the page
                header_maxY = this.pageBox.minY;
                break;
            }
        }
        return new Rectangle(this.pageBox.minX, this.pageBox.minY, this.pageBox.maxX, header_maxY);
    };
    /**
    The footer can extend at most `max_footer_height` from the bottom of the page,
    and must have a gap of `min_footer_gap` between it and the rest of the text.
    */
    Canvas.prototype.getFooter = function (max_footer_height, min_footer_gap) {
        if (max_footer_height === void 0) { max_footer_height = 50; }
        if (min_footer_gap === void 0) { min_footer_gap = 10; }
        // sort in descending order -- lowest boxes first
        var spans = this.spans.slice().sort(function (a, b) { return b.box.maxY - a.box.maxY; });
        // var boxes = this.spans.map(span => span.box).sort((a, b) => b.maxY - a.maxY);
        // default the footer to a box as high as the lowest span on the page.
        var footer_minY = spans[0].box.minY;
        var footer_maxY = footer_minY;
        for (var i = 1, next_higher_span; (next_higher_span = spans[i]); i++) {
            // dY is the distance from the highest point on the current footer to the
            // bottom of the next highest rectangle on the page
            var dY = footer_minY - next_higher_span.box.maxY;
            if (dY > min_footer_gap) {
                break;
            }
            // set the new footer upper bound
            footer_minY = next_higher_span.box.minY;
            // if we've surpassed how high we decided the footer can get, give up
            if ((footer_maxY - footer_minY) > max_footer_height) {
                // set the footer back to the sliver at the bottom of the page
                footer_minY = this.pageBox.maxY;
                break;
            }
        }
        return new Rectangle(this.pageBox.minX, footer_minY, this.pageBox.maxX, this.pageBox.maxY);
    };
    Canvas.prototype.getSections = function () {
        var header = this.getHeader();
        var footer = this.getFooter();
        // Excluding the header and footer, find a vertical split between the spans,
        // and return an Array of Rectangles bounding each column.
        // For now, split into two columns down the middle of the page.
        var contents = new Rectangle(this.pageBox.minX, header.maxY, this.pageBox.maxX, footer.minY);
        var col1 = new Rectangle(contents.minX, contents.minY, contents.midX, contents.maxY);
        var col2 = new Rectangle(contents.midX, contents.minY, contents.maxX, contents.maxY);
        // okay, we've got the bounding boxes, now we need to find the spans they contain
        var sections = [
            new Section('header', header),
            new Section('footer', footer),
            new Section('col1', col1),
            new Section('col2', col2),
        ];
        var outside_section = new Section('outside', this.pageBox);
        // now loop through the spans and put them in the appropriate rectangles
        this.spans.forEach(function (span) {
            var outside = true;
            sections.forEach(function (section) {
                if (section.box.containsRectangle(span.box)) {
                    outside = false;
                    section.spans.push(span);
                }
            });
            if (outside) {
                outside_section.spans.push(span);
            }
        });
        sections.push(outside_section);
        return sections;
    };
    Canvas.prototype.addSpan = function (text, x, y, width_units, fontName, fontSize) {
        // transform into origin at top left
        var canvas_position = transform2d(x, y, 1, 0, 0, -1, 0, this.pageBox.dY);
        var box = Rectangle.fromPointSize(canvas_position[0], canvas_position[1], fontSize * (width_units / 1000), Math.ceil(fontSize) | 0);
        var span = new TextSpan(text, box, fontName, fontSize);
        this.spans.push(span);
    };
    Canvas.prototype.toJSON = function () {
        return {
            spans: this.spans,
            pageBox: this.pageBox,
            sections: this.getSections(),
        };
    };
    return Canvas;
})();
exports.Canvas = Canvas;
