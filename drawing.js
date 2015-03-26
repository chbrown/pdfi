var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var unorm = require('unorm');
var shapes = require('./shapes');
var Canvas = (function () {
    function Canvas(outerBounds) {
        this.outerBounds = outerBounds;
        // Eventually, this will render out other elements, too
        this.spans = [];
    }
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
        var spans = this.spans.slice().sort(function (a, b) { return a.minY - b.minY; });
        // var boxes = this.spans.map(span => span.box).sort((a, b) => a.minY - b.minY);
        // the header starts as a page-wide sliver at the top of the highest span box
        var header_minY = spans[0].minY;
        var header_maxY = header_minY;
        for (var i = 0, next_lower_span; (next_lower_span = spans[i]); i++) {
            var dY = next_lower_span.minY - header_maxY;
            if (dY > min_header_gap) {
                break;
            }
            // set the new lower bound to the bottom of the newly added box
            header_maxY = next_lower_span.maxY;
            // if we've surpassed how high we decided the header can get, give up
            if ((header_maxY - header_minY) > max_header_height) {
                // set the header back to the default sliver at the top of the page
                header_maxY = this.outerBounds.minY;
                break;
            }
        }
        return new shapes.Rectangle(this.outerBounds.minX, this.outerBounds.minY, this.outerBounds.maxX, header_maxY);
    };
    /**
    The footer can extend at most `max_footer_height` from the bottom of the page,
    and must have a gap of `min_footer_gap` between it and the rest of the text.
    */
    Canvas.prototype.getFooter = function (max_footer_height, min_footer_gap) {
        if (max_footer_height === void 0) { max_footer_height = 50; }
        if (min_footer_gap === void 0) { min_footer_gap = 10; }
        // sort in descending order -- lowest boxes first
        var spans = this.spans.slice().sort(function (a, b) { return b.maxY - a.maxY; });
        // var boxes = this.spans.map(span => span.box).sort((a, b) => b.maxY - a.maxY);
        // default the footer to a box as high as the lowest span on the page.
        var footer_minY = spans[0].minY;
        var footer_maxY = footer_minY;
        for (var i = 1, next_higher_span; (next_higher_span = spans[i]); i++) {
            // dY is the distance from the highest point on the current footer to the
            // bottom of the next highest rectangle on the page
            var dY = footer_minY - next_higher_span.maxY;
            if (dY > min_footer_gap) {
                break;
            }
            // set the new footer upper bound
            footer_minY = next_higher_span.minY;
            // if we've surpassed how high we decided the footer can get, give up
            if ((footer_maxY - footer_minY) > max_footer_height) {
                // set the footer back to the sliver at the bottom of the page
                footer_minY = this.outerBounds.maxY;
                break;
            }
        }
        return new shapes.Rectangle(this.outerBounds.minX, footer_minY, this.outerBounds.maxX, this.outerBounds.maxY);
    };
    /**
    The spans collected in each section should be in reading order (we're
    currently assuming that the natural order is proper reading order).
    */
    Canvas.prototype.getSections = function () {
        var header = this.getHeader();
        var footer = this.getFooter();
        // Excluding the header and footer, find a vertical split between the spans,
        // and return an Array of Rectangles bounding each column.
        // For now, split into two columns down the middle of the page.
        var contents = new shapes.Rectangle(this.outerBounds.minX, header.maxY, this.outerBounds.maxX, footer.minY);
        var col1 = new shapes.Rectangle(contents.minX, contents.minY, contents.midX, contents.maxY);
        var col2 = new shapes.Rectangle(contents.midX, contents.minY, contents.maxX, contents.maxY);
        // okay, we've got the bounding boxes, now we need to find the spans they contain
        var sections = [
            new TextSection('header', header),
            new TextSection('footer', footer),
            new TextSection('col1', col1),
            new TextSection('col2', col2),
        ];
        var outside_section = new TextSection('outside', this.outerBounds);
        // now loop through the spans and put them in the appropriate rectangles
        this.spans.forEach(function (span) {
            var outside = true;
            sections.forEach(function (section) {
                if (section.outerBounds.containsRectangle(span)) {
                    outside = false;
                    section.push(span);
                }
            });
            if (outside) {
                outside_section.push(span);
            }
        });
        sections.push(outside_section);
        return sections;
    };
    Canvas.prototype.addSpan = function (string, origin, size, fontSize, fontName) {
        // transform into origin at top left
        var canvas_origin = origin.transform(1, 0, 0, -1, 0, this.outerBounds.dY);
        var span = new shapes.TextSpan(string, canvas_origin.x, canvas_origin.y, canvas_origin.x + size.width, canvas_origin.y + size.height, fontSize);
        var rectangle_string = [span.minX, span.minY, span.maxX, span.maxY].map(function (x) { return x.toFixed(3); }).join(',');
        span.details = "" + rectangle_string + " fontSize=" + fontSize + " fontName=" + fontName;
        this.spans.push(span);
    };
    Canvas.prototype.toJSON = function () {
        return {
            // native properties
            spans: this.spans,
            outerBounds: this.outerBounds,
            // getters
            sections: this.getSections(),
        };
    };
    return Canvas;
})();
exports.Canvas = Canvas;
/**
Could also be called "NamedTextContainer"
*/
var TextSection = (function (_super) {
    __extends(TextSection, _super);
    function TextSection(name, outerBounds) {
        _super.call(this, name);
        this.outerBounds = outerBounds;
    }
    /**
    Returns an array of Line instances; one for each line of text in the PDF.
    A 'Section' (e.g., a column) of text can, by definition, be divided into
    discrete lines, so this is a reasonable place to do line processing.
  
    `max_line_gap`: the maximum distance between lines before we consider the
        next line a new paragraph.
    */
    TextSection.prototype.getLines = function (line_gap) {
        var _this = this;
        if (line_gap === void 0) { line_gap = -5; }
        var lines = [];
        var currentLine = new Line(this);
        // var lastSpan: TextSpan = null;
        this.elements.forEach(function (currentSpan) {
            var dY = -1000;
            if (currentLine.length > 0) {
                // dY is the distance from bottom of the current (active) line to the
                // top of the next span (this should come out negative if the span is
                // on the same line as the last one)
                dY = currentSpan.minY - currentLine.maxY;
            }
            if (dY > line_gap) {
                // if the new span does not vertically overlap with the previous one
                // at all, we consider it a new line
                lines.push(currentLine);
                // lastLine = currentLine;
                currentLine = new Line(_this);
            }
            // otherwise it's a span on the same line
            currentLine.push(currentSpan);
        });
        // finish up
        lines.push(currentLine);
        return lines;
    };
    TextSection.prototype.toJSON = function () {
        return {
            // native properties
            name: this.name,
            elements: this.elements,
            outerBounds: this.outerBounds,
            // getters
            lines: this.getLines(),
        };
    };
    return TextSection;
})(shapes.NamedContainer);
exports.TextSection = TextSection;
var Line = (function (_super) {
    __extends(Line, _super);
    function Line(container, elements) {
        if (elements === void 0) { elements = []; }
        _super.call(this, elements);
        this.container = container;
    }
    Line.prototype.toString = function (min_space_width) {
        if (min_space_width === void 0) { min_space_width = 1; }
        var previousSpan = null;
        return this.elements.map(function (currentSpan) {
            // presumably all the spans have approximately the same Y values
            // dX measures the distance between the right bound of the previous span
            // and the left bound of the current one. It may be negative.
            var dX = -1000;
            if (previousSpan) {
                dX = currentSpan.minX - previousSpan.maxX;
            }
            // save the previous span for future reference
            previousSpan = currentSpan;
            // if it's far enough away (horizontally) from the last box, we add a space
            return (dX > min_space_width) ? (' ' + currentSpan.string) : currentSpan.string;
        }).join('');
    };
    Line.prototype.toJSON = function () {
        return {
            // native properties
            maxX: this.maxX,
            maxY: this.maxY,
            minX: this.minX,
            minY: this.minY,
            // elements: this.elements, // exclude shapes.Container#elements for the sake of brevity
            // container: this.container, // exclude Line#container to avoid circularity
            // methods
            string: this.toString(),
        };
    };
    return Line;
})(shapes.Container);
exports.Line = Line;
/**
If a line ends with a hyphen, we remove the hyphen and join it to
the next line directly; otherwise, join them with a space.

Render each Paragraph into a single string with any pre-existing EOL
markers converted to spaces, and any control characters stripped out.
*/
function joinLines(lines) {
    var strings = lines.map(function (line) {
        var string = line.toString();
        if (string.match(/-$/)) {
            // if line is hyphenated, return it without the hyphen.
            // TODO: be smarter about this.
            return string.slice(0, -1);
        }
        else {
            // otherwise, return it with a space on the end
            return string + ' ';
        }
    });
    // prepare line string
    var line = strings.join('').replace(/(\r\n|\r|\n|\t)/g, ' ').trim();
    // remove all character codes 0 through 31 (space is 32)
    var visible_line = line.replace(/[\x00-\x1F]/g, '');
    var normalized_line = unorm.nfkc(visible_line);
    return normalized_line;
}
exports.joinLines = joinLines;
