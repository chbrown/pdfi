/// <reference path="../type_declarations/index.d.ts" />
import * as lexing from 'lexing';
import * as academia from 'academia';
import {flatMap} from 'arrays';

import {logger} from '../logger';
import {Page, ContentStream, Resources} from '../models';

import {Rectangle} from './geometry';
import {Canvas, Layout} from './models';
import {autodetectLayout, paperFromContainers} from './document';
import {RecursiveDrawingContext, CanvasDrawingContext, TextDrawingContext, TextOperation} from './stream';

function createLayout(canvas: Canvas): Layout {
  return {
    textSpans: canvas.getElements(),
    outerBounds: canvas.outerBounds,
    containers: autodetectLayout(canvas.getElements()),
  };
}

/**
When we render a page, we specify a ContentStream as well as a Resources
dictionary. That Resources dictionary may contain XObject streams that are
embedded as `Do` operations in the main contents, as well as sub-Resources
in those XObjects.
*/
export function renderPageLayout(page: Page, skipMissingCharacters = true, depth = 0): Layout {
  // prepare the canvas that we will draw on
  var pageOuterBounds = new Rectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
  var canvas = new Canvas(pageOuterBounds);

  var context = new CanvasDrawingContext(canvas, page.Resources, skipMissingCharacters, depth);
  var content_stream_string = page.joinContents('\n')
  // read the content stream and render it to the canvas, via the context
  context.applyContentStream(content_stream_string);
  return createLayout(canvas);
}

export function renderContentStreamLayout(content_stream: ContentStream, skipMissingCharacters = true, depth = 0): Layout {
  var BBox = content_stream.dictionary['BBox'];
  var outerBounds = new Rectangle(BBox[0], BBox[1], BBox[2], BBox[3]);
  var canvas = new Canvas(outerBounds);

  var context = new CanvasDrawingContext(canvas, content_stream.Resources, skipMissingCharacters, depth);
  context.applyContentStream(content_stream.buffer.toString('binary'));
  return createLayout(canvas);
}

export function renderPaper(pages: Page[], skipMissingCharacters = true, depth = 0): academia.types.Paper {
 var containers = flatMap(pages, (page, i, pages) => {
    logger.debug(`renderPaper: rendering page ${i + 1}/${pages.length}`);
    var layout = renderPageLayout(page);
    layout.containers.forEach(container => {
      container.getElements().forEach(textSpan => textSpan.layoutContainer = container);
    });
    return layout.containers;
  });
  // containers: Container<TextSpan>[] for the whole PDF, but now each TextSpan
  // is also aware of its container
  return paperFromContainers(containers);
}

/**
This does none of the graphical stuff; it's mostly for debugging purposes.

It returns a list of objects like:
  {operator: 'Tj', font: 'F29', text: 'Catego'}
*/
export function renderContentStreamText(content_stream: ContentStream): TextOperation[] {
  // prepare the list that we will "render" to
  var text_operations: TextOperation[] = [];
  var context = new TextDrawingContext(text_operations, content_stream.Resources, false);
  context.applyContentStream(content_stream.buffer.toString('binary'));
  return text_operations;
}
