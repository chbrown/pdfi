var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var unorm = require('unorm');
var Arrays = require('./Arrays');
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
        var header_minY = (spans.length > 0) ? spans[0].minY : this.outerBounds.minY;
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
        var footer_minY = (spans.length > 0) ? spans[0].minY : this.outerBounds.minY;
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
    Canvas.prototype.getLineContainers = function () {
        var header = this.getHeader();
        var footer = this.getFooter();
        // Excluding the header and footer, find a vertical split between the spans,
        // and return an Array of Rectangles bounding each column.
        // For now, split into two columns down the middle of the page.
        var contents = new shapes.Rectangle(this.outerBounds.minX, header.maxY, this.outerBounds.maxX, footer.minY);
        var col1 = new shapes.Rectangle(contents.minX, contents.minY, contents.midX, contents.maxY);
        var col2 = new shapes.Rectangle(contents.midX, contents.minY, contents.maxX, contents.maxY);
        // okay, we've got the bounding boxes, now we need to find the spans they contain
        var named_page_sections = [
            new NamedPageSection('header', header),
            new NamedPageSection('footer', footer),
            new NamedPageSection('col1', col1),
            new NamedPageSection('col2', col2),
        ];
        var outside_page_section = new NamedPageSection('outside', this.outerBounds);
        // now loop through the spans and put them in the appropriate rectangles
        this.spans.forEach(function (span) {
            var outside = true;
            named_page_sections.forEach(function (section) {
                if (section.outerBounds.containsRectangle(span)) {
                    outside = false;
                    section.textSpans.push(span);
                }
            });
            if (outside) {
                outside_page_section.textSpans.push(span);
            }
        });
        named_page_sections.push(outside_page_section);
        return named_page_sections.map(function (named_page_section) {
            return NamedLineContainer.fromTextSpans(named_page_section.name, named_page_section.textSpans);
        });
    };
    Canvas.prototype.getPartialDocument = function (section_names) {
        var sections = this.getLineContainers().filter(function (section) { return section_names.indexOf(section.name) > -1; });
        var lines = Arrays.flatMap(sections, function (section) { return section.lines; });
        return new Document(lines);
    };
    Canvas.prototype.addSpan = function (string, origin, size, fontSize, fontName) {
        // transform into origin at top left
        var canvas_origin = origin.transform(1, 0, 0, -1, 0, this.outerBounds.dY);
        var span = new shapes.TextSpan(string, canvas_origin.x, canvas_origin.y, canvas_origin.x + size.width, canvas_origin.y + size.height, fontSize);
        // var rectangle_string = [span.minX, span.minY, span.maxX, span.maxY].map(x => x.toFixed(3)).join(',');
        span.details = "" + span.toString(2) + " fontSize=" + fontSize + " fontName=" + fontName;
        this.spans.push(span);
    };
    Canvas.prototype.toJSON = function () {
        return {
            // native properties
            spans: this.spans,
            outerBounds: this.outerBounds,
            // getters
            sections: this.getLineContainers(),
        };
    };
    return Canvas;
})();
exports.Canvas = Canvas;
var NamedLineContainer = (function (_super) {
    __extends(NamedLineContainer, _super);
    function NamedLineContainer(name) {
        _super.call(this, name);
    }
    Object.defineProperty(NamedLineContainer.prototype, "lines", {
        get: function () {
            return this.elements;
        },
        enumerable: true,
        configurable: true
    });
    /**
    Groups the container's elements (TextSpans) into an array of Line instances;
    one for each line of text in the PDF.
  
    A 'Section' (e.g., a column) of text can, by definition, be divided into
    discrete lines, so this is a reasonable place to do line processing.
  
    * `line_gap` is the the maximum distance between lines before we consider the
      next line a new paragraph.
    */
    NamedLineContainer.fromTextSpans = function (name, textSpans, line_gap) {
        if (line_gap === void 0) { line_gap = -5; }
        var namedLineContainer = new NamedLineContainer(name);
        var lines = [];
        var currentLine = new Line(namedLineContainer);
        textSpans.forEach(function (currentSpan) {
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
                currentLine = new Line(namedLineContainer);
            }
            // otherwise it's a span on the same line
            currentLine.push(currentSpan);
        });
        // finish up
        lines.push(currentLine);
        // call pushElements here so that the mass insertion can be optimized
        namedLineContainer.pushElements(lines);
        return namedLineContainer;
    };
    NamedLineContainer.prototype.toJSON = function () {
        return {
            // native properties
            name: this.name,
            elements: this.elements,
        };
    };
    return NamedLineContainer;
})(shapes.NamedContainer);
exports.NamedLineContainer = NamedLineContainer;
/**
This is for the first pass of collecting all of the TextSpans that lie inside
a bounding box.

We don't need to know the bounding rectangle of the TextSpans, so we don't
inherit from shapes.NamedContainer (which saves some time recalculating the spans).
*/
var NamedPageSection = (function () {
    function NamedPageSection(name, outerBounds, textSpans) {
        if (textSpans === void 0) { textSpans = []; }
        this.name = name;
        this.outerBounds = outerBounds;
        this.textSpans = textSpans;
    }
    return NamedPageSection;
})();
exports.NamedPageSection = NamedPageSection;
var Line = (function (_super) {
    __extends(Line, _super);
    function Line(container, elements) {
        if (elements === void 0) { elements = []; }
        _super.call(this, elements);
        this.container = container;
    }
    Object.defineProperty(Line.prototype, "textSpans", {
        get: function () {
            return this.elements;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Line.prototype, "leftOffset", {
        get: function () {
            return this.minX - this.container.minX;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Line.prototype, "containerMedianElementLeftOffset", {
        get: function () {
            return this.container.medianElementLeftOffset;
        },
        enumerable: true,
        configurable: true
    });
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
        }).join('').trim();
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
var Paragraph = (function (_super) {
    __extends(Paragraph, _super);
    function Paragraph() {
        _super.apply(this, arguments);
    }
    Paragraph.prototype.toString = function () {
        return joinLines(this.elements);
    };
    Paragraph.prototype.toJSON = function () {
        return {
            string: this.toString(),
        };
    };
    return Paragraph;
})(shapes.Container);
exports.Paragraph = Paragraph;
var Document = (function () {
    /**
    `lines` should be only the content of the document (not from the header / footer)
    */
    function Document(lines) {
        this.lines = lines;
        // Reduce all the PDF's pages to a single array of Lines. Each Line keeps
        // track of the container it belongs to, so that we can measure offsets
        // later.
        var fontSizes = Arrays.flatMap(this.lines, function (line) {
            return line.textSpans.map(function (textSpan) { return textSpan.fontSize; });
        });
        this.meanFontSize = Arrays.mean(fontSizes);
        // use the 75% quartile (Arrays.quantile() returns the endpoints, too) as the normalFontSize
        this.normalFontSize = Arrays.quantile(fontSizes, 4)[3];
    }
    Document.prototype.getSections = function () {
        var _this = this;
        var sections = [];
        var currentSection = new DocumentSection();
        this.lines.forEach(function (currentLine) {
            var line_fontSize = Arrays.mean(currentLine.textSpans.map(function (textSpan) { return textSpan.fontSize; }));
            // new sections can be distinguished by larger sizes
            if (line_fontSize > (_this.normalFontSize + 0.5)) {
                // only start a new section if the current section has some content
                if (currentSection.contentLines.length > 0) {
                    sections.push(currentSection);
                    currentSection = new DocumentSection();
                }
                currentSection.headerLines.push(currentLine);
            }
            else {
                currentSection.contentLines.push(currentLine);
            }
        });
        // flush final section
        sections.push(currentSection);
        return sections;
    };
    Document.prototype.toJSON = function () {
        return {
            // native properties
            lines: this.lines,
            normalFontSize: this.normalFontSize,
            meanFontSize: this.meanFontSize,
            // getters
            sections: this.getSections(),
        };
    };
    return Document;
})();
exports.Document = Document;
/**
Despite being an array, `headerLines` will most often be 1-long.
*/
var DocumentSection = (function () {
    function DocumentSection(headerLines, contentLines) {
        if (headerLines === void 0) { headerLines = []; }
        if (contentLines === void 0) { contentLines = []; }
        this.headerLines = headerLines;
        this.contentLines = contentLines;
    }
    Object.defineProperty(DocumentSection.prototype, "header", {
        get: function () {
            return this.headerLines.map(function (line) { return line.toString(); }).join('\n');
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DocumentSection.prototype, "content", {
        get: function () {
            return this.contentLines.map(function (line) { return line.toString(); }).join('\n');
        },
        enumerable: true,
        configurable: true
    });
    /**
    Paragraphs.
  
    Paragraphs are distinguished by an unusual first line. This initial line is
    unusual compared to preceding lines, as well as subsequent lines.
  
    If paragraphs are very short, it can be hard to distinguish which are the start
    lines and which are the end lines simply by shape, since paragraphs may have
    normal positive indentation, or have hanging indentation.
  
    Each Line keeps track of the container it belongs to, so that we can measure
    offsets later.
    */
    DocumentSection.prototype.getParagraphs = function (min_indent, min_gap) {
        if (min_indent === void 0) { min_indent = 8; }
        if (min_gap === void 0) { min_gap = 5; }
        // offsets will all be non-negative
        // var leftOffsets = this.contentLines.map(line => line.minX - line.container.minX);
        // var medianLeftOffset = Arrays.median(leftOffsets);
        var paragraphs = [];
        var currentParagraph = new Paragraph();
        // we can't use currentParagraph.maxY because paragraphs may span multiple columns
        var previousLine = null;
        this.contentLines.forEach(function (currentLine) {
            // new paragraphs can be distinguished by left offset
            var diff_offsetX = Math.abs(currentLine.containerMedianElementLeftOffset - currentLine.leftOffset);
            // or by vertical gaps
            var dY = -1000;
            if (previousLine) {
                dY = currentLine.minY - previousLine.maxY;
            }
            if (currentParagraph.length > 0 && ((diff_offsetX > min_indent) || (dY > min_gap))) {
                paragraphs.push(currentParagraph);
                currentParagraph = new Paragraph();
            }
            currentParagraph.push(currentLine);
            previousLine = currentLine;
        });
        // finish up
        paragraphs.push(currentParagraph);
        return paragraphs;
    };
    DocumentSection.prototype.toJSON = function () {
        return {
            // native properties
            headerLines: this.headerLines,
            contentLines: this.contentLines,
            // getters
            header: this.header,
            content: this.content,
            // getters
            paragraphs: this.getParagraphs(),
        };
    };
    return DocumentSection;
})();
exports.DocumentSection = DocumentSection;
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
    // TODO: reduce combining characters without this space->tab hack
    // replace spaces temporarily
    var protected_line = visible_line.replace(/ /g, '\t');
    // replace spaces temporarily
    var normalized_protected_line = unorm.nfkc(protected_line);
    // collapse out the spaces generated for the combining characters
    var collapsed_line = normalized_protected_line.replace(/ /g, '');
    // change the space substitutes back into spaces
    var normalized_line = collapsed_line.replace(/\t/g, ' ');
    // and replacing the combining character pairs with precombined characters where possible
    var canonical_line = unorm.nfc(normalized_line);
    return canonical_line;
}
exports.joinLines = joinLines;
