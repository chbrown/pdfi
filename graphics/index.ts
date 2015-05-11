/// <reference path="../type_declarations/index.d.ts" />
import * as lexing from 'lexing';

import {Page, ContentStream, Resources} from '../models';

import {Rectangle} from './geometry';
import {DocumentCanvas} from './document';
import {RecursiveDrawingContext, CanvasDrawingContext, TextDrawingContext, TextOperation} from './stream';

/**
When we render a page, we specify a ContentStream as well as a Resources
dictionary. That Resources dictionary may contain XObject streams that are
embedded as `Do` operations in the main contents, as well as sub-Resources
in those XObjects.
*/
export function renderPage(page: Page): DocumentCanvas {
  // prepare the canvas that we will draw on
  var pageBox = new Rectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
  var canvas = new DocumentCanvas(pageBox);

  var context = new CanvasDrawingContext(canvas, page.Resources, true);
  var content_stream_string = page.joinContents('\n')
  // read the content stream and render it to the canvas, via the context
  context.applyContentStream(content_stream_string);
  return canvas;
}

export function renderContentStream(content_stream: ContentStream): DocumentCanvas {
  var BBox = content_stream.dictionary['BBox'];
  var outerBounds = new Rectangle(BBox[0], BBox[1], BBox[2], BBox[3]);
  var canvas = new DocumentCanvas(outerBounds);

  var context = new CanvasDrawingContext(canvas, content_stream.Resources, true);
  context.applyContentStream(content_stream.buffer.toString('binary'));
  return canvas;
}

/**
renderPageText does none of the graphical stuff.
it's mostly for debugging purposes.

It returns a list of objects like:
  {operator: 'Tj', font: 'F29', text: 'Catego'}
*/
export function renderContentStreamText(content_stream: ContentStream): TextOperation[] {
  // prepare the list that we will "render" to
  var text_operations: TextOperation[] = [];
  var context = new TextDrawingContext(text_operations, content_stream.Resources);
  context.applyContentStream(content_stream.buffer.toString('binary'));
  return text_operations;
}
