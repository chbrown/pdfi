import {Paper} from 'academia/types';
import {flatMap, assign} from 'tarry';

import {logger} from '../logger';
import {Page, ContentStream, Resources} from '../models';

import {Rectangle, makeRectangle, transformPoint, formatRectangle, Container} from './geometry';
import {TextSpan, PositionedTextSpan, Layout, autodetectLayout, paperFromContainers} from './document';
import {Span, SpanDrawingContext, TextOperation, TextOperationDrawingContext} from './stream';

/**
When we render a page, we specify a ContentStream as well as a Resources
dictionary. That Resources dictionary may contain XObject streams that are
embedded as `Do` operations in the main contents, as well as sub-Resources
in those XObjects.
*/
export function renderLayout(outerBounds: Rectangle,
                             buffer: Buffer,
                             resources: Resources,
                             skipMissingCharacters = true): Layout<PositionedTextSpan> {
  // prepare the array of TextSpans that we will render into
  const spans: Span[] = [];
  const context = new SpanDrawingContext(spans, resources, skipMissingCharacters);
  // read the content stream and render it to the array of textSpans via the context
  context.applyContentStream(buffer);
  // transform into origin at top left
  const dY = outerBounds.maxY - outerBounds.minY;
  const textSpans: TextSpan[] = spans.map(span => {
    const {x: minX, y: minY} = transformPoint(span, 1, 0, 0, -1, 0, dY);
    const maxX = minX + span.width;
    const maxY = minY + span.height;
    const {fontName, fontSize, fontBold, fontItalic, text} = span;
    const details = `${formatRectangle({minX, minY, maxX, maxY})} fontName=${fontName}`;
    return {minX, minY, maxX, maxY, text, fontSize, fontBold, fontItalic, details};
  });
  // not sure why this doesn't work without my hints
  const positionedContainers: Container<PositionedTextSpan>[] = autodetectLayout(textSpans).map(layoutContainer => {
    const elements: PositionedTextSpan[] = layoutContainer.elements.map(element => assign(element, {layoutContainer}));
    return assign(layoutContainer, {elements});
  });
  const positionedElements = flatMap(positionedContainers, positionedContainer => positionedContainer.elements);
  // containers: Container<TextSpan>[] for the whole PDF, but each TextSpan
  // is also aware of its container
  return {outerBounds, elements: positionedElements, containers: positionedContainers};
}

export function renderPageLayout(page: Page, skipMissingCharacters = true): Layout<PositionedTextSpan> {
  // outerBounds is usually set by the Page's MediaBox rectangle. It does not depend
  // on the elements contained by the page.
  const outerBounds = makeRectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
  return renderLayout(outerBounds, page.joinContents(new Buffer('\n')), page.Resources, skipMissingCharacters);
}

export function renderContentStreamLayout(contentStream: ContentStream, skipMissingCharacters = true): Layout<PositionedTextSpan> {
  const BBox = contentStream.dictionary['BBox'];
  const outerBounds = makeRectangle(BBox[0], BBox[1], BBox[2], BBox[3]);
  return renderLayout(outerBounds, contentStream.buffer, contentStream.Resources, skipMissingCharacters);
}

export function renderPageLayouts(pages: Page[], skipMissingCharacters = true): Layout<PositionedTextSpan>[] {
  return pages.map((page, i, pages) => {
    logger.debug(`renderPageLayouts: rendering page ${i + 1}/${pages.length}`);
    return renderPageLayout(page);
  });
}

export function renderPaper(pages: Page[], skipMissingCharacters = true): Paper {
 const containers = flatMap(pages, (page, i, pages) => {
    logger.debug(`renderPaper: rendering page ${i + 1}/${pages.length}`);
    const layout = renderPageLayout(page);
    return layout.containers;
  });
  return paperFromContainers(containers);
}

/**
This does none of the graphical stuff; it's mostly for debugging purposes.

It returns a list of objects like:
  {operator: 'Tj', font: 'F29', text: 'Catego'}
*/
export function renderContentStreamText(content_stream: ContentStream): TextOperation[] {
  // operations is the list that we will "render" to
  const operations: TextOperation[] = [];
  const context = new TextOperationDrawingContext(operations, content_stream.Resources, false);
  context.applyContentStream(content_stream.buffer);
  return operations;
}
