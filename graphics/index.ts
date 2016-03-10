import {Paper} from 'academia/types';
import {flatMap} from 'tarry';

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
  const pageOuterBounds = new Rectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
  const canvas = new Canvas(pageOuterBounds);

  const context = new CanvasDrawingContext(canvas, page.Resources, skipMissingCharacters, depth);
  const content_stream_buffer = page.joinContents(new Buffer('\n'))
  // read the content stream and render it to the canvas, via the context
  context.applyContentStream(content_stream_buffer);
  return createLayout(canvas);
}

export function renderContentStreamLayout(content_stream: ContentStream, skipMissingCharacters = true, depth = 0): Layout {
  const BBox = content_stream.dictionary['BBox'];
  const outerBounds = new Rectangle(BBox[0], BBox[1], BBox[2], BBox[3]);
  const canvas = new Canvas(outerBounds);

  const context = new CanvasDrawingContext(canvas, content_stream.Resources, skipMissingCharacters, depth);
  context.applyContentStream(content_stream.buffer);
  return createLayout(canvas);
}

export function renderPaper(pages: Page[], skipMissingCharacters = true, depth = 0): Paper {
 const containers = flatMap(pages, (page, i, pages) => {
    logger.debug(`renderPaper: rendering page ${i + 1}/${pages.length}`);
    const layout = renderPageLayout(page);
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
  const text_operations: TextOperation[] = [];
  const context = new TextDrawingContext(text_operations, content_stream.Resources, false);
  context.applyContentStream(content_stream.buffer);
  return text_operations;
}
