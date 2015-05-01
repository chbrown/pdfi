/// <reference path="../type_declarations/index.d.ts" />
import * as lexing from 'lexing';

import {Page} from '../models';
import {Rectangle} from './geometry';
import {DocumentCanvas} from './document';
import {DrawingContext} from './stream';

/**
When we render a page, we specify a ContentStream as well as a Resources
dictionary. That Resources dictionary may contain XObject streams that are
embedded as `Do` operations in the main contents, as well as sub-Resources
in those XObjects.
*/
export function renderPage(page: Page): DocumentCanvas {
  var pageBox = new Rectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
  var canvas = new DocumentCanvas(pageBox);

  var contents_string = page.joinContents('\n');
  var contents_string_iterable = new lexing.StringIterator(contents_string);

  var context = new DrawingContext(page.Resources);
  context.render(contents_string_iterable, canvas);

  return canvas;
}
