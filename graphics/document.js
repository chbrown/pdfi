var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var unorm = require('unorm');
var Arrays = require('../Arrays');
var models_1 = require('./models');
var geometry_1 = require('./geometry');
var canvas_1 = require('./canvas');
/**
We can't throw out empty spans entirely, but we can keep them from affecting
the bounds.
*/
var TextSpanContainer = (function (_super) {
    __extends(TextSpanContainer, _super);
    function TextSpanContainer() {
        _super.apply(this, arguments);
    }
    TextSpanContainer.prototype.push = function (element) {
        this.elements.push(element);
        // if (element.string.match(/\S/)) {
        if (element.string.trim().length > 0) {
            this.expandToContain(element);
        }
    };
    return TextSpanContainer;
})(models_1.Container);
exports.TextSpanContainer = TextSpanContainer;
/**
Group contiguous elements into containers. Rough first pass.

Reasonable (?) defaults are:
  threshold_dx = 20
  threshold_dy = 5
*/
function groupContiguousTextSpans(elements, threshold_dx, threshold_dy) {
    var containers = [];
    var currentContainer;
    elements.forEach(function (element) {
        var _a = currentContainer ? currentContainer.distance(element) : [Infinity, Infinity], dx = _a[0], dy = _a[1];
        // large dx / dy indicate that the current element is far from the
        // currentContainer, meaning we should initialize a new container
        if (dx > threshold_dx || dy > threshold_dy) {
            // flush current container
            if (currentContainer) {
                containers.push(currentContainer);
            }
            currentContainer = new TextSpanContainer();
        }
        // TextSpan's optional `layoutContainer` field gets set here
        element.layoutContainer = currentContainer;
        currentContainer.push(element);
    });
    // flush final container if it exists --- if this.spans is empty,
    // currentContainer will still be undefined
    if (currentContainer) {
        containers.push(currentContainer);
    }
    return containers;
}
/**
Exhaustively merge proximal containers.

Mutates `containers` in-place.
*/
function mergeAdjoiningContainers(containers, threshold_dx, threshold_dy) {
    var mergedContainers = [];
    while (containers.length > 0) {
        var currentContainer = containers.shift();
        do {
            var initialLength = containers.length;
            // only look at subsequent containers (distance is transitive)
            containers = containers.filter(function (otherContainer) {
                var _a = currentContainer.distance(otherContainer), dx = _a[0], dy = _a[1];
                if (dx < threshold_dx && dy < threshold_dy) {
                    // okay, other container is close enough, merge it
                    currentContainer.merge(otherContainer);
                    // remove otherContainer from containers by returning false
                    return false;
                }
                return true;
            });
        } while (containers.length < initialLength);
        mergedContainers.push(currentContainer);
    }
    return mergedContainers;
}
/**
Returns the median distance between this container's left (inner) bound and
the left bound of its elements.

This is useful when we want to determine whether a given line is atypical
within its specific container.
*/
function medianLeftOffset(container, elements) {
    var leftOffsets = elements.map(function (element) { return element.minX - container.minX; });
    return Arrays.median(leftOffsets);
}
/**
The given textSpans should all have approximately the same Y value.
*/
function flattenLine(textSpans, spaceWidth) {
    if (spaceWidth === void 0) { spaceWidth = 1; }
    var previousTextSpan;
    return textSpans.map(function (currentTextSpan) {
        // dX measures the distance between the right bound of the previous span
        // and the left bound of the current one. It may be negative.
        var dX = previousTextSpan ? (currentTextSpan.minX - previousTextSpan.maxX) : -Infinity;
        // save the previous span for future reference
        previousTextSpan = currentTextSpan;
        // if it's far enough away (horizontally) from the last box, we add a space
        return (dX > spaceWidth) ? (' ' + currentTextSpan.string) : currentTextSpan.string;
    }).join('').trim();
}
/**
Modifiers modify the character after them.
Combiners modify the character before them.
*/
var modifier_to_combiner = {
    "\u02C7": "\u030C",
    "\u02DB": "\u0328",
    "\u02CA": "\u0301",
    "\u02CB": "\u0300",
    "\u02C6": "\u0302",
};
/**
These are all the unicode characters where:
* the category of Modifier_Symbol
* the character code is less than 1000
* they have decompositions.

I think these are the ones that we can assume are supposed to combine with the
following character.
*/
var decomposable_modifiers = {
    '\u00A8': '\u0308',
    '\u00AF': '\u0304',
    '\u00B4': '\u0301',
    '\u00B8': '\u0327',
    '\u02D8': '\u0306',
    '\u02D9': '\u0307',
    '\u02DA': '\u030A',
    '\u02DB': '\u0328',
    '\u02DC': '\u0303',
    '\u02DD': '\u030B',
};
/**
Normalization:
1. Combining diacritics combine with the character that precedes them.
   A high-order character with diacritic (like "LATIN SMALL LETTER C WITH CARON")
   is decomposed into a pair [lowercase c, combining caron]. This is what we deal
   with below, by decomposing lone diacritics into [space, combining diacritic]
   pairs, removing the space, and recomposing, so that the diacritic combines
   with the previous character, as the PDF writer intended.
   E.g., Preot¸iuc (from P14-6001.pdf), where the U+00B8 "CEDILLA" combines with
   the character preceding it.
2. We also need to deal with modifier diacritics, which precede the character
   they modify. For example, Hajiˇc (from P14-5021.pdf), where the intended č
   is designated by a (U+02C7 "CARON", U+0063 "LATIN SMALL LETTER C") pair.
   ("CARON" is a Modifier_Letter)

Actually, I'm not sure how to tell these apart. "¸", which joins with the
preceding character, has a decomposition specified, as (SPACE, COMBINING CEDILLA),
but is otherwise a modifier character as usual.

So, it's ambiguous?
*/
function normalize(raw) {
    // remove all character codes 0 through 31 (space is 32 == 0x1F)
    var visible = raw.replace(/[\x00-\x1F]/g, '');
    // replace combining characters that are currently combining with a space
    // by the lone combiner so that they'll combine with the following character
    // instead, as intended.
    var decompositions_applied = visible.replace(/[\u00A8\u00AF\u00B4\u00B8\u02D8-\u02DD]/g, function (modifier) {
        return decomposable_modifiers[modifier];
    });
    // replace (modifier, letter) pairs with a single modified-letter character
    // (0x02B0-0x02FF) = (688-767)
    var modifiers_applied = decompositions_applied.replace(/([\u02B0-\u02FF])(.)/g, function (_, modifier, modified) {
        if (modifier in modifier_to_combiner) {
            return modified + modifier_to_combiner[modifier];
        }
        // if we can't find a matching combiner, return the original pair
        return modifier + modified;
    });
    // finally, canonicalize all the combining characters with precomposed
    // characters via unorm
    return unorm.nfc(modifiers_applied);
}
exports.normalize = normalize;
/**
If a line ends with a hyphen, we remove the hyphen and join it to
the next line directly; otherwise, join them with a space.

Render each Paragraph into a single string with any pre-existing EOL
markers converted to spaces, and any control characters stripped out.

TODO: look at the whole document / a general corpus for indicators of
intentionally hyphenated words.
*/
function joinLines(lines) {
    var strings = lines.map(function (line) {
        if (line.match(/-$/)) {
            // if line is hyphenated, return it without the hyphen.
            // TODO: be smarter about this.
            return line.slice(0, -1);
        }
        else {
            // otherwise, return it with a space on the end
            return line + ' ';
        }
    });
    // prepare line string
    var line = strings.join('').replace(/(\r\n|\r|\n|\t)/g, ' ').trim();
    return normalize(line);
}
exports.joinLines = joinLines;
var DocumentCanvas = (function (_super) {
    __extends(DocumentCanvas, _super);
    function DocumentCanvas() {
        _super.apply(this, arguments);
    }
    /**
    Flexibly partition all of this Canvas's spans into contiguous-ish groups.
  
    1. first pass: linear aggregation
  
    containers = empty list of containers
    currentContainer = uninitialized empty container
    for each span in spans:
      if container is uninitialized
        initialize new currentContainer with span
      else
        if span is within (dx, dy) of currentContainer
          add it to the currentContainer
        else
          add currentContainer to containers
          initialize new currentContainer with span
  
    we now have a collection of containers; some of them may overlap (but I think
    no two consecutive containers will overlap? don't count on that though -- I
    can think of perverse layouts that might do so)
  
    2. second pass: exhaustive aggregation
  
    for each container in containers:
      for each otherContainer in containers:
        if otherContainer is within (dx, dy) of container
          merge otherContainer into containers
          # maybe: restart the loop over otherContainers?
          # or instead: restart the loop over otherContainers when we reach the
          #             end ONLY if there have been any merges?
  
    */
    DocumentCanvas.prototype.autodetectLayout = function () {
        // threshold_dx: number = 20, threshold_dy: number = 5
        // 1. first pass -- linear aggregation
        var containers = groupContiguousTextSpans(this.spans, 20, 5);
        // 2. second pass -- exhaustive aggregation
        // containers = mergeAdjoiningContainers(containers, threshold_dx, threshold_dy);
        return containers;
    };
    DocumentCanvas.prototype.toJSON = function () {
        return {
            // native properties
            spans: this.spans,
            outerBounds: this.outerBounds,
            // computed values
            layout: this.autodetectLayout(),
        };
    };
    return DocumentCanvas;
})(canvas_1.Canvas);
exports.DocumentCanvas = DocumentCanvas;
/**
Given a single flat Array of TextSpans (which are aware of their original layout
component), divide it into an Array of Arrays of TextSpans, such that each
sub-Array of TextSpans contains TextSpans occurring on the same line.

Usually the given `textSpans` Array consists of all the content TextSpans in
a semantic section.

The optional parameter, `line_gap`, is the the maximum distance between lines
before we consider the next line a new paragraph.
*/
function groupIntoLines(textSpans, line_gap) {
    if (line_gap === void 0) { line_gap = -5; }
    var lines = [];
    var currentLine;
    var previousTextSpan;
    textSpans.forEach(function (textSpan) {
        // dY is the distance from bottom of the current (active) line to the
        // top of the next span (this should come out negative if the span is
        // on the same line as the last one)
        // set dY if currentMaxY has been initialized
        var dY = previousTextSpan ? (textSpan.minY - previousTextSpan.maxY) : Infinity;
        // if the new span does not vertically overlap with the previous one
        // at all, or if there was no previous line, or we've moved to a new
        // container, we consider it a new line
        if (dY > line_gap || textSpan.layoutContainer !== previousTextSpan.layoutContainer) {
            // flush the current line
            if (currentLine) {
                lines.push(currentLine);
            }
            // and initialize a new empty currentLine
            currentLine = [];
        }
        currentLine.push(textSpan);
        previousTextSpan = textSpan;
    });
    // finish up: flush the final line if there is one
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines;
}
/**
Line is a helper when doing paragraph detection; it's pretty much just a data
struct. It's not very interesting in itself.
*/
var Line = (function (_super) {
    __extends(Line, _super);
    function Line(textSpans, layoutContainer) {
        if (layoutContainer === void 0) { layoutContainer = textSpans[0].layoutContainer; }
        // TODO: maybe determine the bounds of the all the textSpans, not just the first one?
        _super.call(this, textSpans[0].minX, textSpans[0].minY, textSpans[0].maxX, textSpans[0].maxY);
        this.textSpans = textSpans;
        this.layoutContainer = layoutContainer;
    }
    return Line;
})(geometry_1.Rectangle);
/**
Paragraphs are distinguished by an unusual first line. This initial line is
unusual compared to preceding lines, as well as subsequent lines.

If paragraphs are very short, it can be hard to distinguish which are the start
lines and which are the end lines simply by shape, since paragraphs may have
normal positive indentation, or have hanging indentation.

Each Line keeps track of the container it belongs to, so that we can measure
offsets later.

The given lines will come from a variety of different layout components, but in
determining the oddity of the left offset of any given line, we only want to
compare its left offset to the left offsets of other lines in the same layout component.
*/
function detectParagaphs(linesOfTextSpans, min_indent) {
    if (min_indent === void 0) { min_indent = 8; }
    var lines = linesOfTextSpans.map(function (textSpans) {
        return new Line(textSpans);
    });
    var paragraphs = [];
    var currentParagraph;
    lines.forEach(function (currentLine) {
        // lineContainer's elements represent a single line of text
        var layoutContainerLines = lines.filter(function (line) { return line.layoutContainer == currentLine.layoutContainer; });
        // medianLineLeftOffset measures the typical left offset of each line
        // relative to the lines' layoutContainer
        // TODO: implement caching somehow
        var medianLineLeftOffset = medianLeftOffset(currentLine.layoutContainer, layoutContainerLines);
        var lineLeftOffset = currentLine.minX - currentLine.layoutContainer.minX;
        var diff_leftOffset = currentParagraph ? Math.abs(medianLineLeftOffset - lineLeftOffset) : Infinity;
        // a large diff_leftOffset (set to infinity if the current paragraph has
        // not been initialized) indicates that we should start a new paragraph
        if (diff_leftOffset > min_indent) {
            if (currentParagraph) {
                paragraphs.push(currentParagraph);
            }
            currentParagraph = [];
        }
        // each line boils down to a single string
        var lineString = flattenLine(currentLine.textSpans);
        currentParagraph.push(lineString);
    });
    // flush the current paragraph
    paragraphs.push(currentParagraph);
    return paragraphs;
}
/**
Despite being an array, `headerLines` will most often be 1-long.
*/
var Section = (function () {
    function Section(headerElements, contentElements) {
        if (headerElements === void 0) { headerElements = []; }
        if (contentElements === void 0) { contentElements = []; }
        this.headerElements = headerElements;
        this.contentElements = contentElements;
    }
    Section.prototype.getHeader = function () {
        // TODO: handle multi-line section headers (better)
        var text = flattenLine(this.headerElements);
        var line = text.replace(/(\r\n|\r|\n|\t)/g, ' ').trim();
        return normalize(line);
    };
    /**
    As single string:
      return this.contentElements.map(textSpan => textSpan.string).join('');
    */
    Section.prototype.getContent = function () {
        // 1. First step: basic line detection. There are no such things as
        //    paragraphs if we have no concept of lines.
        var lines = groupIntoLines(this.contentElements);
        //  2. iterate through the lines, flattening into paragraphs
        var paragraphs = detectParagaphs(lines);
        // finish up: convert each paragraph (list of strings) to a single string
        return paragraphs.map(function (paragraph) { return joinLines(paragraph); });
    };
    return Section;
})();
exports.Section = Section;
/**
Recombine an array of arbitrary TextSpan Containers into an array of Sections
*/
function documentFromContainers(containers) {
    // containers is an array of basic Containers for the whole PDF / document
    // the TextSpans in each container are self-aware of the Container they belong to (layoutContainer)
    // 1. the easiest first step is to get the mean and median font size
    var textSpans = Arrays.flatMap(containers, function (container) { return container.getElements(); });
    var fontSizes = textSpans.map(function (textSpan) { return textSpan.fontSize; });
    var mean_fontSize = Arrays.mean(fontSizes);
    // use the 75% quartile (Arrays.quantile() returns the endpoints, too) as the normal font size
    var content_fontSize = Arrays.quantile(fontSizes, 4)[3];
    // jump up a half pixel/pt to set the section header font size threshold
    var header_fontSize = content_fontSize + 0.5;
    // 2. the second step is to iterate through the sections and re-group them
    var sections = [];
    var currentSection = new Section();
    containers.forEach(function (container) {
        container.getElements().forEach(function (textSpan) {
            // new sections can be distinguished by larger sizes
            if (textSpan.fontSize > header_fontSize) {
                // start a new section if the current section has any content
                if (currentSection.contentElements.length > 0) {
                    // flush the current section
                    sections.push(currentSection);
                    // initialize the new section
                    currentSection = new Section();
                }
                currentSection.headerElements.push(textSpan);
            }
            else {
                currentSection.contentElements.push(textSpan);
            }
        });
    });
    // flush final section
    sections.push(currentSection);
    // flatten sections -- which is complicated in itself, but the Section class
    // handles the line/paragraph detection
    return {
        sections: sections.map(function (section) {
            return {
                title: section.getHeader(),
                paragraphs: section.getContent(),
            };
        })
    };
}
exports.documentFromContainers = documentFromContainers;
