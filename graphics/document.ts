/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');
import unorm = require('unorm');

import Arrays = require('../Arrays');
import models = require('./models');
import {Rectangle} from './geometry';
import {Canvas} from './canvas';

export class DocumentCanvas extends Canvas {

  /**
  We define a header as the group of spans at the top separated from the rest
  of the text by at least `min_header_gap`, but which is at most
  `max_header_height` high.
  */
  getHeader(max_header_height = 50, min_header_gap = 10): Rectangle {
    // sort in ascending order. the sort occurs in-place but the map creates a
    // new array anyway (though it's shallow; the points are not copies)
    var spans = this.spans.slice().sort((a, b) => a.minY - b.minY);
    // var boxes = this.spans.map(span => span.box).sort((a, b) => a.minY - b.minY);
    // the header starts as a page-wide sliver at the top of the highest span box
    var header_minY = (spans.length > 0) ? spans[0].minY : this.outerBounds.minY;
    var header_maxY = header_minY;
    // now we read glom through the following points until we hit one that's far
    // enough away, only shifting header.maxY as needed.
    for (var i = 0, next_lower_span: models.TextSpan; (next_lower_span = spans[i]); i++) {
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
    return new Rectangle(this.outerBounds.minX, this.outerBounds.minY, this.outerBounds.maxX, header_maxY);
  }

  /**
  The footer can extend at most `max_footer_height` from the bottom of the page,
  and must have a gap of `min_footer_gap` between it and the rest of the text.
  */
  getFooter(max_footer_height = 50, min_footer_gap = 10): Rectangle {
    // sort in descending order -- lowest boxes first
    var spans = this.spans.slice().sort((a, b) => b.maxY - a.maxY);
    // var boxes = this.spans.map(span => span.box).sort((a, b) => b.maxY - a.maxY);
    // default the footer to a box as high as the lowest span on the page.
    var footer_minY = (spans.length > 0) ? spans[0].minY : this.outerBounds.minY;
    var footer_maxY = footer_minY;
    // now we read glom through each box from the bottom until we hit one that's far enough away
    // as we go through, we adjust ONLY footer.minY
    for (var i = 1, next_higher_span: models.TextSpan; (next_higher_span = spans[i]); i++) {
      // dY is the distance from the highest point on the current footer to the
      // bottom of the next highest rectangle on the page
      var dY = footer_minY - next_higher_span.maxY;
      if (dY > min_footer_gap) {
        // okay, the text above is too far away to merge into the footer, we're done
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
    return new Rectangle(this.outerBounds.minX, footer_minY, this.outerBounds.maxX, this.outerBounds.maxY);
  }

  /**
  The spans collected in each section should be in reading order (we're
  currently assuming that the natural order is proper reading order).
  */
  getLineContainers(): NamedLineContainer[] {
    var header = this.getHeader();
    var footer = this.getFooter();
    // Excluding the header and footer, find a vertical split between the spans,
    // and return an Array of Rectangles bounding each column.
    // For now, split into two columns down the middle of the page.
    var contents = new Rectangle(this.outerBounds.minX, header.maxY, this.outerBounds.maxX, footer.minY);
    var col1 = new Rectangle(contents.minX, contents.minY, contents.midX, contents.maxY);
    var col2 = new Rectangle(contents.midX, contents.minY, contents.maxX, contents.maxY);
    // okay, we've got the bounding boxes, now we need to find the spans they contain
    var named_page_sections = [
      new NamedPageSection('header', header),
      new NamedPageSection('footer', footer),
      new NamedPageSection('col1', col1),
      new NamedPageSection('col2', col2),
    ];
    var outside_page_section = new NamedPageSection('outside', this.outerBounds);

    // now loop through the spans and put them in the appropriate rectangles
    this.spans.forEach(span => {
      var outside = true;
      named_page_sections.forEach(section => {
        if (section.outerBounds.containsRectangle(span)) {
          outside = false;
          section.textSpans.push(span)
        }
      });
      if (outside) {
        outside_page_section.textSpans.push(span);
      }
    });
    named_page_sections.push(outside_page_section);

    return named_page_sections.map(named_page_section => {
      return NamedLineContainer.fromTextSpans(named_page_section.name, named_page_section.textSpans);
    });
  }

  getPartialDocument(section_names: string[]): Document {
    var sections = this.getLineContainers().filter(section => section_names.indexOf(section.name) > -1)
    var lines = Arrays.flatMap(sections, section => section.lines);
    return new Document(lines);
  }

  toJSON() {
    return {
      // native properties
      spans: this.spans,
      outerBounds: this.outerBounds,
      // getters
      sections: this.getLineContainers(),
    };
  }
}

export class NamedLineContainer extends models.NamedContainer<Line> {
  constructor(name: string) { super(name) }

  get lines(): Line[] {
    return this.elements;
  }

  /**
  Groups the container's elements (TextSpans) into an array of Line instances;
  one for each line of text in the PDF.

  A 'Section' (e.g., a column) of text can, by definition, be divided into
  discrete lines, so this is a reasonable place to do line processing.

  * `line_gap` is the the maximum distance between lines before we consider the
    next line a new paragraph.
  */
  static fromTextSpans(name: string, textSpans: models.TextSpan[], line_gap = -5): NamedLineContainer {
    var namedLineContainer = new NamedLineContainer(name);
    var lines: Line[] = [];
    var currentLine: Line = new Line(namedLineContainer);
    textSpans.forEach(currentSpan => {
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
  }

  toJSON() {
    return {
      // native properties
      name: this.name,
      elements: this.elements,
      // getters
      // lines: this.lines,
    };
  }
}

/**
This is for the first pass of collecting all of the TextSpans that lie inside
a bounding box.

We don't need to know the bounding rectangle of the TextSpans, so we don't
inherit from models.NamedContainer (which saves some time recalculating the spans).
*/
export class NamedPageSection {
  constructor(public name: string,
              public outerBounds: Rectangle,
              public textSpans: models.TextSpan[] = []) { }
}

export class Line extends models.Container<models.TextSpan> {
  constructor(protected container: NamedLineContainer,
              elements: models.TextSpan[] = []) { super(elements) }

  get textSpans(): models.TextSpan[] {
    return this.elements;
  }

  get leftOffset(): number {
    return this.minX - this.container.minX;
  }

  get containerMedianElementLeftOffset(): number {
    return this.container.medianElementLeftOffset;
  }

  toString(min_space_width = 1): string {
    var previousSpan: models.TextSpan = null;
    return this.elements.map(currentSpan => {
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
  }

  toJSON() {
    return {
      // native properties
      maxX: this.maxX,
      maxY: this.maxY,
      minX: this.minX,
      minY: this.minY,
      // elements: this.elements, // exclude models.Container#elements for the sake of brevity
      // container: this.container, // exclude Line#container to avoid circularity
      // methods
      string: this.toString(),
    };
  }
}

export class Paragraph extends models.Container<Line> {
  toString(): string {
    return joinLines(this.elements);
  }
  toJSON() {
    return {
      string: this.toString(),
    }
  }
}

export class Document {
  public normalFontSize: number;
  public meanFontSize: number;
  /**
  `lines` should be only the content of the document (not from the header / footer)
  */
  constructor(private lines: Line[]) {
    // Reduce all the PDF's pages to a single array of Lines. Each Line keeps
    // track of the container it belongs to, so that we can measure offsets
    // later.
    var fontSizes = Arrays.flatMap(this.lines, line => {
      return line.textSpans.map(textSpan => textSpan.fontSize);
    });
    this.meanFontSize = Arrays.mean(fontSizes);
    // use the 75% quartile (Arrays.quantile() returns the endpoints, too) as the normalFontSize
    this.normalFontSize = Arrays.quantile(fontSizes, 4)[3];
  }

  getSections(): DocumentSection[] {
    var sections: DocumentSection[] = [];
    var currentSection = new DocumentSection();
    this.lines.forEach(currentLine => {
      var line_fontSize = Arrays.mean(currentLine.textSpans.map(textSpan => textSpan.fontSize));
      // new sections can be distinguished by larger sizes
      if (line_fontSize > (this.normalFontSize + 0.5)) {
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
  }

  toJSON() {
    return {
      // native properties
      lines: this.lines,
      normalFontSize: this.normalFontSize,
      meanFontSize: this.meanFontSize,
      // getters
      sections: this.getSections(),
    };
  }
}
/**
Despite being an array, `headerLines` will most often be 1-long.
*/
export class DocumentSection  {
  constructor(public headerLines: Line[] = [], public contentLines: Line[] = []) { }

  get header(): string {
    return this.headerLines.map(line => line.toString()).join('\n');
  }
  get content(): string {
    return this.contentLines.map(line => line.toString()).join('\n');
  }

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
  getParagraphs(min_indent = 8, min_gap = 5): Paragraph[] {
    // offsets will all be non-negative
    // var leftOffsets = this.contentLines.map(line => line.minX - line.container.minX);
    // var medianLeftOffset = Arrays.median(leftOffsets);
    var paragraphs: Paragraph[] = [];
    var currentParagraph = new Paragraph();
    // we can't use currentParagraph.maxY because paragraphs may span multiple columns
    var previousLine: Line = null;
    this.contentLines.forEach(currentLine => {
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
  }

  toJSON() {
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
  }

}

/**
If a line ends with a hyphen, we remove the hyphen and join it to
the next line directly; otherwise, join them with a space.

Render each Paragraph into a single string with any pre-existing EOL
markers converted to spaces, and any control characters stripped out.
*/
export function joinLines(lines: Line[]): string {
  var strings = lines.map(line => {
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
