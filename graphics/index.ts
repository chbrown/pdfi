/// <reference path="../type_declarations/index.d.ts" />
import * as lexing from 'lexing';

import {Page, ContentStream, Resources} from '../models';

import {Rectangle} from './geometry';
import {DocumentCanvas} from './document';
import {ContentStreamReader} from './stream';
import {DrawingContext, CanvasDrawingContext, TextDrawingContext} from './context';

function renderHelper(content_stream_string: string, resources: Resources, context: DrawingContext) {
  var content_stream_string_iterable = new lexing.StringIterator(content_stream_string);
  // prepare the content stream reader
  var reader = new ContentStreamReader(resources);
  // read the content stream and render it to the canvas, via the context
  reader.render(content_stream_string_iterable, context);
}


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
  var context = new CanvasDrawingContext(canvas);
  renderHelper(page.joinContents('\n'), page.Resources, context);
  return canvas;
}

/**
renderPageText does none of the graphical stuff.
it's mostly for debugging purposes.

It returns a list of objects like:
  {operator: 'Tj', font: 'F29', text: 'Catego'}
*/
export function renderContentStreamText(content_stream: ContentStream): any[] {
  // prepare the list that we will "render" to
  var spans = [];
  var context = new TextDrawingContext(spans);
  renderHelper(content_stream.buffer.toString('binary'), content_stream.Resources, context);
  return spans;
}
