/// <reference path="type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');
var unorm = require('unorm');

import shapes = require('./shapes');

export class Canvas {
  // Eventually, this will render out other elements, too
  public spans: shapes.TextSpan[] = [];

  constructor(public outerBounds: shapes.Rectangle) { }

  /**
  We define a header as the group of spans at the top separated from the rest
  of the text by at least `min_header_gap`, but which is at most
  `max_header_height` high.
  */
  getHeader(max_header_height = 50, min_header_gap = 10): shapes.Rectangle {
    // sort in ascending order. the sort occurs in-place but the map creates a
    // new array anyway (though it's shallow; the points are not copies)
    var spans = this.spans.slice().sort((a, b) => a.minY - b.minY);
    // var boxes = this.spans.map(span => span.box).sort((a, b) => a.minY - b.minY);
    // the header starts as a page-wide sliver at the top of the highest span box
    var header_minY = spans[0].minY;
    var header_maxY = header_minY;
    // now we read glom through the following points until we hit one that's far
    // enough away, only shifting header.maxY as needed.
    for (var i = 0, next_lower_span: shapes.TextSpan; (next_lower_span = spans[i]); i++) {
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
  }

  /**
  The footer can extend at most `max_footer_height` from the bottom of the page,
  and must have a gap of `min_footer_gap` between it and the rest of the text.
  */
  getFooter(max_footer_height = 50, min_footer_gap = 10): shapes.Rectangle {
    // sort in descending order -- lowest boxes first
    var spans = this.spans.slice().sort((a, b) => b.maxY - a.maxY);
    // var boxes = this.spans.map(span => span.box).sort((a, b) => b.maxY - a.maxY);
    // default the footer to a box as high as the lowest span on the page.
    var footer_minY = spans[0].minY;
    var footer_maxY = footer_minY;
    // now we read glom through each box from the bottom until we hit one that's far enough away
    // as we go through, we adjust ONLY footer.minY
    for (var i = 1, next_higher_span: shapes.TextSpan; (next_higher_span = spans[i]); i++) {
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
    return new shapes.Rectangle(this.outerBounds.minX, footer_minY, this.outerBounds.maxX, this.outerBounds.maxY);
  }

  /**
  The spans collected in each section should be in reading order (we're
  currently assuming that the natural order is proper reading order).
  */
  getSections(): TextSection[] {
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
    this.spans.forEach(span => {
      var outside = true;
      sections.forEach(section => {
        if (section.outerBounds.containsRectangle(span)) {
          outside = false;
          section.push(span)
        }
      });
      if (outside) {
        outside_section.push(span);
      }
    });
    sections.push(outside_section);

    return sections;
  }

  addSpan(string: string, origin: shapes.Point, size: shapes.Size, fontSize: number, fontName: string) {
    // transform into origin at top left
    var canvas_origin = origin.transform(1, 0, 0, -1, 0, this.outerBounds.dY)
    var span = new shapes.TextSpan(string,
                                   canvas_origin.x,
                                   canvas_origin.y,
                                   canvas_origin.x + size.width,
                                   canvas_origin.y + size.height,
                                   fontSize);
    var rectangle_string = [span.minX, span.minY, span.maxX, span.maxY].map(x => x.toFixed(3)).join(',');
    span.details = `${rectangle_string} fontSize=${fontSize} fontName=${fontName}`;
    this.spans.push(span);
  }

  toJSON() {
    return {
      // native properties
      spans: this.spans,
      outerBounds: this.outerBounds,
      // getters
      sections: this.getSections(),
    };
  }
}

/**
Could also be called "NamedTextContainer"
*/
export class TextSection extends shapes.NamedContainer<shapes.TextSpan> {
  constructor(name: string, public outerBounds: shapes.Rectangle) { super(name) }

  /**
  Returns an array of Line instances; one for each line of text in the PDF.
  A 'Section' (e.g., a column) of text can, by definition, be divided into
  discrete lines, so this is a reasonable place to do line processing.

  `max_line_gap`: the maximum distance between lines before we consider the
      next line a new paragraph.
  */
  getLines(line_gap = -5): Line[] {
    var lines: Line[] = [];

    var currentLine: Line = new Line(this);
    // var lastSpan: TextSpan = null;

    this.elements.forEach(currentSpan => {
      var dY = -1000;
      if (currentLine.length > 0) {
        // dY is the distance from bottom of the current (active) line to the
        // top of the next span (this should come out negative if the span is
        // on the same line as the last one)
        dY = currentSpan.minY - currentLine.maxY;
        // logger.info(`${currentLine.toString()} -> ${currentSpan.string}`);
        // logger.info(`${currentSpan.minY} - ${currentLine.maxY} => ${dY}`);
      }
      if (dY > line_gap) {
        // if the new span does not vertically overlap with the previous one
        // at all, we consider it a new line
        lines.push(currentLine);
        // lastLine = currentLine;
        currentLine = new Line(this);
      }
      // otherwise it's a span on the same line
      currentLine.push(currentSpan);
    });

    // finish up
    lines.push(currentLine);

    return lines;
  }

  toJSON() {
    return {
      // native properties
      name: this.name,
      elements: this.elements,
      outerBounds: this.outerBounds,
      // getters
      lines: this.getLines(),
    };
  }
}

export class Line extends shapes.Container<shapes.TextSpan> {
  constructor(public container: shapes.Rectangle, elements: shapes.TextSpan[] = []) { super(elements) }

  toString(min_space_width = 1): string {
    var previousSpan: shapes.TextSpan = null;
    return this.elements.map(currentSpan => {
      // presumably all the spans have approximately the same Y values
      // dX measures the distance between the right bound of the previous span
      // and the left bound of the current one. It may be negative.
      var dX = -1000;
      if (previousSpan) {
        dX = currentSpan.minX - previousSpan.maxX;
        // logger.info(`${previousSpan.string} -> ${currentSpan.string} = ${dX}`);
      }
      // save the previous span for future reference
      previousSpan = currentSpan;
      // if it's far enough away (horizontally) from the last box, we add a space
      return (dX > min_space_width) ? (' ' + currentSpan.string) : currentSpan.string;
    }).join('');
  }

  toJSON() {
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
  var normalized_line = unorm.nfkc(visible_line);
  return normalized_line;
}
