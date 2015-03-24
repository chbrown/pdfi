/// <reference path="type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');

import shapes = require('./shapes');

export class Paragraph {
  constructor(public lines: string[] = []) { }

  getText(): string {
    // if a line ends with a hyphen, we remove the hyphen and join it to
    // the next line directly; otherwise, join them with a space
    return this.lines.map(line => {
      if (line.match(/-$/)) {
        // if line is hyphenated, return it without the hyphen.
        return line.slice(0, -1);
      }
      else {
        // otherwise, return it with a space on the end
        return line + ' ';
      }
    }).join('').trim();
  }

  toJSON() {
    return {
      lines: this.lines,
      text: this.getText(),
    };
  }

}

export class Section {
  public spans: shapes.TextSpan[] = [];
  constructor(public name: string, public bounds: shapes.Rectangle) { }

  /**
  This Section's spans should be in reading order

  `max_line_gap`: the maximum distance between lines before we consider the
  next line a new paragraph.
  */
  getParagraphs(max_line_gap = 5): Paragraph[] {
    var paragraphs: Paragraph[] = [];

    var current_paragraph: Paragraph = new Paragraph();
    var current_line = '';

    var flushLine = () => { current_paragraph.lines.push(current_line); current_line = ''; }
    var flushParagraph = () => { flushLine(); paragraphs.push(current_paragraph); current_paragraph = new Paragraph(); }

    // current_maxY is the current paragraph's bottom bound
    var last_bounds = new shapes.Rectangle(0, 0, 0, 0);
    // for (var i = 0, span; (span = sorted_spans[i]); i++) {
    this.spans.forEach(span => {
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
  }

  toJSON() {
    return {
      name: this.name,
      bounds: this.bounds,
      spans: this.spans,
      paragraphs: this.getParagraphs(),
    };
  }
}

export class Canvas {
  // Eventually, this will render out other elements, too
  public spans: shapes.TextSpan[] = [];

  constructor(public bounds: shapes.Rectangle) { }

  /**
  We define a header as the group of spans at the top separated from the rest
  of the text by at least `min_header_gap`, but which is at most
  `max_header_height` high.
  */
  getHeader(max_header_height = 50, min_header_gap = 10): shapes.Rectangle {
    // sort in ascending order. the sort occurs in-place but the map creates a
    // new array anyway (though it's shallow; the points are not copies)
    var spans = this.spans.slice().sort((a, b) => a.bounds.minY - b.bounds.minY);
    // var boxes = this.spans.map(span => span.box).sort((a, b) => a.minY - b.minY);
    // the header starts as a page-wide sliver at the top of the highest span box
    var header_minY = spans[0].bounds.minY;
    var header_maxY = header_minY;
    // now we read glom through the following points until we hit one that's far
    // enough away, only shifting header.maxY as needed.
    for (var i = 0, next_lower_span: shapes.TextSpan; (next_lower_span = spans[i]); i++) {
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
  }

  /**
  The footer can extend at most `max_footer_height` from the bottom of the page,
  and must have a gap of `min_footer_gap` between it and the rest of the text.
  */
  getFooter(max_footer_height = 50, min_footer_gap = 10): shapes.Rectangle {
    // sort in descending order -- lowest boxes first
    var spans = this.spans.slice().sort((a, b) => b.bounds.maxY - a.bounds.maxY);
    // var boxes = this.spans.map(span => span.box).sort((a, b) => b.maxY - a.maxY);
    // default the footer to a box as high as the lowest span on the page.
    var footer_minY = spans[0].bounds.minY;
    var footer_maxY = footer_minY;
    // now we read glom through each box from the bottom until we hit one that's far enough away
    // as we go through, we adjust ONLY footer.minY
    for (var i = 1, next_higher_span: shapes.TextSpan; (next_higher_span = spans[i]); i++) {
      // dY is the distance from the highest point on the current footer to the
      // bottom of the next highest rectangle on the page
      var dY = footer_minY - next_higher_span.bounds.maxY;
      if (dY > min_footer_gap) {
        // okay, the text above is too far away to merge into the footer, we're done
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
  }

  getSections(): Section[] {
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
    this.spans.forEach(span => {
      var outside = true;
      sections.forEach(section => {
        if (section.bounds.containsRectangle(span.bounds)) {
          outside = false;
          section.spans.push(span)
        }
      });
      if (outside) {
        outside_section.spans.push(span);
      }
    });
    sections.push(outside_section);

    return sections;
  }

  addSpan(string: string, origin: shapes.Point, size: shapes.Size, fontSize: number) {
    // fontName: string,
    // transform into origin at top left
    var canvas_origin = origin.transform(1, 0, 0, -1, 0, this.bounds.dY)
    var bounds = shapes.Rectangle.fromPointSize(canvas_origin, size);
    var details = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].map(x => x.toFixed(3)).join(',');
    var span = new shapes.TextSpan(string, bounds, fontSize, details);
    this.spans.push(span);
  }

  toJSON() {
    return {
      spans: this.spans,
      bounds: this.bounds,
      sections: this.getSections(),
    };
  }
}
