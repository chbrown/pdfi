var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var arrays_1 = require('arrays');
var index_1 = require('../encoding/index');
var util_1 = require('../util');
var models_1 = require('./models');
var geometry_1 = require('./geometry');
/**
Group horizontally contiguous elements into containers. Usually this is called
with an array of all TextSpans on a single page.
*/
function groupHorizontallyContiguousElements(elements) {
    var containers = [];
    var currentContainer;
    elements.forEach(function (element) {
        var dy = currentContainer ? (element.minY - currentContainer.minY) : Infinity;
        // 5 is approximately half the mean font size
        var new_container = Math.abs(dy) > 5;
        if (new_container) {
            // flush current container
            if (currentContainer) {
                containers.push(currentContainer);
            }
            currentContainer = new models_1.Container();
        }
        currentContainer.push(element);
    });
    // flush final container if it exists --- if `elements` is empty,
    // currentContainer will still be undefined
    if (currentContainer) {
        containers.push(currentContainer);
    }
    return containers;
}
/**
Merge containers that are vertically overlapping in incremental text mode.
*/
function mergeVerticallyContiguousContainers(containers, threshold_dx, threshold_dy) {
    var mergedContainers = [];
    var currentContainer;
    var previousBounds;
    containers.forEach(function (container) {
        var _a = previousBounds ? previousBounds.distance(container) : [Infinity, Infinity], dx = _a[0], dy = _a[1];
        var new_container = dx > threshold_dx || dy > threshold_dy;
        if (new_container) {
            // flush current container
            if (currentContainer) {
                mergedContainers.push(currentContainer);
            }
            currentContainer = new models_1.Container();
        }
        currentContainer.merge(container);
        previousBounds = container;
    });
    // flush final container if it exists --- if `containers` is empty,
    // currentContainer will still be undefined
    if (currentContainer) {
        mergedContainers.push(currentContainer);
    }
    return mergedContainers;
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
function autodetectLayout(textSpans) {
    // threshold_dx: number = 20, threshold_dy: number = 5
    // 1. first pass -- linear aggregation
    var containers = groupHorizontallyContiguousElements(textSpans);
    // 2. second pass -- exhaustive aggregation
    var merged_containers = mergeVerticallyContiguousContainers(containers, 0, 5);
    return merged_containers;
}
exports.autodetectLayout = autodetectLayout;
/**
Returns the median distance between this container's left (inner) bound and
the left bound of its elements.

This is useful when we want to determine whether a given line is atypical
within its specific container.
*/
function typicalLeftOffset(container, elements) {
    var leftOffsets = elements.map(function (element) { return element.minX - container.minX; });
    // special handling to avoid taking the mean of two elements:
    if (elements.length == 2) {
        // consider the first of the two (or the single line) to be the "atypical"
        // one, so that it signals a paragraph change
        return leftOffsets[1];
    }
    return arrays_1.median(leftOffsets);
}
/**
The given textSpans should all have approximately the same Y value.

normalize(...) ensures that there is no whitespace, besides SPACE, in the result.
*/
function flattenLine(textSpans, spaceWidth) {
    if (spaceWidth === void 0) { spaceWidth = 1; }
    var line = textSpans.map(function (currentTextSpan, i) {
        var previousTextSpan = textSpans[i - 1];
        // dX measures the distance between the right bound of the previous span
        // and the left bound of the current one. It may be negative.
        if (previousTextSpan) {
            // if it's far enough away (horizontally) from the last box, we add a space
            if ((currentTextSpan.minX - previousTextSpan.maxX) > spaceWidth) {
                return ' ' + currentTextSpan.string;
            }
        }
        return currentTextSpan.string;
    }).join('');
    return index_1.normalize(line).trim();
}
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
    if (min_indent === void 0) { min_indent = 5; }
    var lines = linesOfTextSpans.map(function (textSpans) { return new Line(textSpans); });
    var paragraphs = [];
    var currentParagraph = [];
    lines.forEach(function (currentLine) {
        // lineContainer's elements represent a single line of text
        var layoutContainerLines = lines.filter(function (line) { return line.layoutContainer == currentLine.layoutContainer; });
        // typicalLineLeftOffset measures the typical (like, median) left offset of
        // each line relative to the lines' layoutContainer
        // TODO: implement caching somehow
        var typicalLineLeftOffset = typicalLeftOffset(currentLine.layoutContainer, layoutContainerLines);
        var lineLeftOffset = currentLine.minX - currentLine.layoutContainer.minX;
        var diff_leftOffset = currentParagraph ? Math.abs(typicalLineLeftOffset - lineLeftOffset) : Infinity;
        // a large diff_leftOffset (set to infinity if the current paragraph has
        // not been initialized) indicates that we should start a new paragraph
        if (diff_leftOffset > min_indent) {
            if (currentParagraph.length > 0) {
                paragraphs.push(currentParagraph);
            }
            currentParagraph = [];
        }
        // each line boils down to a single string
        var lineString = flattenLine(currentLine.textSpans);
        currentParagraph.push(lineString);
    });
    // flush the current paragraph
    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
    }
    return paragraphs;
}
/**
Despite being an array, `headerElements` will most often be 1-long.

`headerElements` is eventually flattened into `title`,
and `contentElements` into `paragraphs`.
*/
var Section = (function () {
    function Section(headerElements, contentElements) {
        if (headerElements === void 0) { headerElements = []; }
        if (contentElements === void 0) { contentElements = []; }
        this.headerElements = headerElements;
        this.contentElements = contentElements;
    }
    return Section;
})();
exports.Section = Section;
/**
Recombine an array of arbitrary TextSpan Containers into an array of Sections
*/
function paperFromContainers(containers) {
    // containers is an array of basic Containers for the whole PDF / document
    // the TextSpans in each container are self-aware of the Container they belong to (layoutContainer)
    // 1. the easiest first step is to get the mean and median font size
    var textSpans = arrays_1.flatMap(containers, function (container) { return container.getElements(); });
    var fontSizes = textSpans.map(function (textSpan) { return textSpan.fontSize; });
    // var mean_fontSize = mean(fontSizes);
    // use the 75% quartile (quantile() returns the endpoints, too) as the normal font size
    var content_fontSize = arrays_1.quantile(fontSizes, 4)[3];
    // jump up a half pixel/pt to set the section header font size threshold
    var header_fontSize = content_fontSize + 0.5;
    // 2. the second step is to iterate through the sections and re-group them
    var sections = [];
    var currentSection = new Section();
    containers.forEach(function (container) {
        container.getElements().forEach(function (textSpan) {
            // new sections can be distinguished by larger sizes
            var isHeaderSized = textSpan.fontSize > header_fontSize;
            // or by leading boldface (boldface within other normal content does not
            // trigger a new section
            var isLeadingBold = textSpan.fontBold && currentSection.contentElements.length == 0;
            // logger.info(`textSpan isHeaderSized=${isHeaderSized}; isLeadingBold=${isLeadingBold}; isWhiteSpace=${isWhiteSpace}; content length=${currentSection.contentElements.length}: "${textSpan.string}"`);
            var isWhiteSpace = !textSpan.string.match(/\S/);
            if (isWhiteSpace) {
                // whitespace never triggers a new section or a transition to content section
                // we just have to determine which it goes in: header or content
                if (currentSection.contentElements.length > 0) {
                    currentSection.contentElements.push(textSpan);
                }
                else {
                    currentSection.headerElements.push(textSpan);
                }
            }
            else if (isHeaderSized || isLeadingBold) {
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
    // pass through once to prepare the paragraphs
    // (this flattens each sections -- which is complicated in itself, but the
    // groupIntoLines and detectParagaphs functions do the heavy work)
    sections.forEach(function (section) {
        // 1. First step: basic line detection. There are no such things as
        //    paragraphs if we have no concept of lines.
        var lines = groupIntoLines(section.contentElements);
        // 2. iterate through the lines, regrouping into paragraphs
        section.paragraphs = detectParagaphs(lines);
    });
    // Each section's `paragraphs` is now set to a list of lists of lines (string[][])
    // We now need to derive a bag of words for the entire document.
    var bag_of_words = new util_1.Multiset();
    sections.forEach(function (section) {
        section.paragraphs.forEach(function (lines) {
            lines.forEach(function (line) {
                line.split(/\s+/).forEach(function (token) {
                    bag_of_words.add(token.toLowerCase());
                });
            });
        });
    });
    return {
        sections: sections.map(function (section) {
            // TODO: handle multi-line section headers better
            var title_lines = groupIntoLines(section.headerElements);
            var title_paragraphs = detectParagaphs(title_lines);
            var title = title_paragraphs.map(function (lines) { return joinLines(lines, bag_of_words); }).join(' ');
            // finish up: convert each paragraph (list of strings) to a single string
            var paragraphs = section.paragraphs.map(function (lines) { return joinLines(lines, bag_of_words); });
            return { title: title, paragraphs: paragraphs };
        })
    };
}
exports.paperFromContainers = paperFromContainers;
/**
If a line ends with a hyphen, we remove the hyphen and join it to
the next line directly; otherwise, join them with a space.

Render each Paragraph into a single string with any pre-existing EOL
markers converted to spaces, and any control characters stripped out.

bag_of_words is used to look at the whole document for indicators of
intentionally hyphenated words.
*/
function joinLines(lines, bag_of_words) {
    // each line in lines is guaranteed not to contain whitespace other than
    // SPACE, since they've all been run through flattenLine, so when we join
    // with newline characters here, we know that only newlines in the string
    // are the ones we've just added
    var joined = lines.join('\n');
    // now look for all occurrences of "-\n", capturing the words before and after
    var rejoined = joined.replace(/(\w+)-\n(\w+)/g, function (_, left, right) {
        // if line is hyphenated, and the word that is broken turns up in the corpus
        // more times WITH the hyphen than WITHOUT, return it WITH the hyphen
        var left_lower = left.toLowerCase();
        var right_lower = right.toLowerCase();
        var hyphenated = left + "-" + right;
        var nhyphenated = bag_of_words.get(left_lower + "-" + right_lower);
        var dehyphenated = "" + left + right;
        var ndehyphenated = bag_of_words.get("" + left_lower + right_lower);
        if (nhyphenated > ndehyphenated) {
            return hyphenated;
        }
        else if (ndehyphenated > nhyphenated) {
            return dehyphenated;
        }
        // otherwise, they're equal (both 0, usually), which is tougher
        // 1. if the second of the two parts is capitalized (Uppercase-Lowercase),
        //    it's probably a hyphenated name, so keep it hyphenated
        var capitalized = right[0] === right[0].toUpperCase();
        if (capitalized) {
            return hyphenated;
        }
        // TODO: what about Uppercase-lowercase? Can we assume anything?
        // 2. if the two parts are reasonable words in themselves, keep them
        //    hyphenated (it's probably something like "one-vs-all", or "bag-of-words")
        var common_parts = (bag_of_words.get(left_lower) + bag_of_words.get(right_lower)) > 2;
        if (common_parts) {
            return hyphenated;
        }
        // finally, default to dehyphenation, which is by far more common than
        // hyphenation (though it's more destructive of an assumption when wrong)
        return dehyphenated;
    });
    // the remaining line breaks are legimate breaks between words, so we simply
    // replace them with a plain SPACE
    return rejoined.replace(/\n/g, ' ');
}
