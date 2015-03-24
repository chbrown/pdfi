var shapes = require('./shapes');
var Paragraph = (function () {
    function Paragraph(lines) {
        if (lines === void 0) { lines = []; }
        this.lines = lines;
    }
    Paragraph.prototype.getText = function () {
        // if a line ends with a hyphen, we remove the hyphen and join it to
        // the next line directly; otherwise, join them with a space
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
    function Section(name, bounds) {
        this.name = name;
        this.bounds = bounds;
        this.spans = [];
    }
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
        var last_bounds = new shapes.Rectangle(0, 0, 0, 0);
        // for (var i = 0, span; (span = sorted_spans[i]); i++) {
        this.spans.forEach(function (span) {
            // dY is the distance from current bottom of the paragraph to the top of
            // the next span (this may come out negative, if the span is on the same
            // line as the last one)
            var dY = span.bounds.minY - last_bounds.maxY;
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
                // otherwise it's a span on the same line
                var dX = span.bounds.minX - last_bounds.maxX;
                // and if it's far enough away (horizontally) from the last box, we add a space
                if (dX > 1) {
                    current_line += ' ';
                }
            }
            current_line += span.string;
            last_bounds = span.bounds;
        });
        // finish up
        flushParagraph();
        return paragraphs;
    };
    Section.prototype.toJSON = function () {
        return {
            name: this.name,
            bounds: this.bounds,
            spans: this.spans,
            paragraphs: this.getParagraphs(),
        };
    };
    return Section;
})();
exports.Section = Section;
var Canvas = (function () {
    function Canvas(bounds) {
        this.bounds = bounds;
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
        var spans = this.spans.slice().sort(function (a, b) { return a.bounds.minY - b.bounds.minY; });
        // var boxes = this.spans.map(span => span.box).sort((a, b) => a.minY - b.minY);
        // the header starts as a page-wide sliver at the top of the highest span box
        var header_minY = spans[0].bounds.minY;
        var header_maxY = header_minY;
        for (var i = 0, next_lower_span; (next_lower_span = spans[i]); i++) {
            var dY = next_lower_span.bounds.minY - header_maxY;
            if (dY > min_header_gap) {
                break;
            }
            // set the new lower bound to the bottom of the newly added box
            header_maxY = next_lower_span.bounds.maxY;
            // if we've surpassed how high we decided the header can get, give up
            if ((header_maxY - header_minY) > max_header_height) {
                // set the header back to the default sliver at the top of the page
                header_maxY = this.bounds.minY;
                break;
            }
        }
        return new shapes.Rectangle(this.bounds.minX, this.bounds.minY, this.bounds.maxX, header_maxY);
    };
    /**
    The footer can extend at most `max_footer_height` from the bottom of the page,
    and must have a gap of `min_footer_gap` between it and the rest of the text.
    */
    Canvas.prototype.getFooter = function (max_footer_height, min_footer_gap) {
        if (max_footer_height === void 0) { max_footer_height = 50; }
        if (min_footer_gap === void 0) { min_footer_gap = 10; }
        // sort in descending order -- lowest boxes first
        var spans = this.spans.slice().sort(function (a, b) { return b.bounds.maxY - a.bounds.maxY; });
        // var boxes = this.spans.map(span => span.box).sort((a, b) => b.maxY - a.maxY);
        // default the footer to a box as high as the lowest span on the page.
        var footer_minY = spans[0].bounds.minY;
        var footer_maxY = footer_minY;
        for (var i = 1, next_higher_span; (next_higher_span = spans[i]); i++) {
            // dY is the distance from the highest point on the current footer to the
            // bottom of the next highest rectangle on the page
            var dY = footer_minY - next_higher_span.bounds.maxY;
            if (dY > min_footer_gap) {
                break;
            }
            // set the new footer upper bound
            footer_minY = next_higher_span.bounds.minY;
            // if we've surpassed how high we decided the footer can get, give up
            if ((footer_maxY - footer_minY) > max_footer_height) {
                // set the footer back to the sliver at the bottom of the page
                footer_minY = this.bounds.maxY;
                break;
            }
        }
        return new shapes.Rectangle(this.bounds.minX, footer_minY, this.bounds.maxX, this.bounds.maxY);
    };
    Canvas.prototype.getSections = function () {
        var header = this.getHeader();
        var footer = this.getFooter();
        // Excluding the header and footer, find a vertical split between the spans,
        // and return an Array of Rectangles bounding each column.
        // For now, split into two columns down the middle of the page.
        var contents = new shapes.Rectangle(this.bounds.minX, header.maxY, this.bounds.maxX, footer.minY);
        var col1 = new shapes.Rectangle(contents.minX, contents.minY, contents.midX, contents.maxY);
        var col2 = new shapes.Rectangle(contents.midX, contents.minY, contents.maxX, contents.maxY);
        // okay, we've got the bounding boxes, now we need to find the spans they contain
        var sections = [
            new Section('header', header),
            new Section('footer', footer),
            new Section('col1', col1),
            new Section('col2', col2),
        ];
        var outside_section = new Section('outside', this.bounds);
        // now loop through the spans and put them in the appropriate rectangles
        this.spans.forEach(function (span) {
            var outside = true;
            sections.forEach(function (section) {
                if (section.bounds.containsRectangle(span.bounds)) {
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
    Canvas.prototype.addSpan = function (string, origin, size, fontSize) {
        // fontName: string,
        // transform into origin at top left
        var canvas_origin = origin.transform(1, 0, 0, -1, 0, this.bounds.dY);
        var bounds = shapes.Rectangle.fromPointSize(canvas_origin, size);
        var details = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].map(function (x) { return x.toFixed(3); }).join(',');
        var span = new shapes.TextSpan(string, bounds, fontSize, details);
        this.spans.push(span);
    };
    Canvas.prototype.toJSON = function () {
        return {
            spans: this.spans,
            bounds: this.bounds,
            sections: this.getSections(),
        };
    };
    return Canvas;
})();
exports.Canvas = Canvas;
