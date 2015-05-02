/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var geometry_1 = require('./geometry');
var document_1 = require('./document');
var stream_1 = require('./stream');
var context_1 = require('./context');
function renderHelper(content_stream_string, resources, context) {
    var content_stream_string_iterable = new lexing.StringIterator(content_stream_string);
    // prepare the content stream reader
    var reader = new stream_1.ContentStreamReader(resources);
    // read the content stream and render it to the canvas, via the context
    reader.render(content_stream_string_iterable, context);
}
/**
When we render a page, we specify a ContentStream as well as a Resources
dictionary. That Resources dictionary may contain XObject streams that are
embedded as `Do` operations in the main contents, as well as sub-Resources
in those XObjects.
*/
function renderPage(page) {
    // prepare the canvas that we will draw on
    var pageBox = new geometry_1.Rectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
    var canvas = new document_1.DocumentCanvas(pageBox);
    var context = new context_1.CanvasDrawingContext(canvas);
    renderHelper(page.joinContents('\n'), page.Resources, context);
    return canvas;
}
exports.renderPage = renderPage;
/**
renderPageText does none of the graphical stuff.
it's mostly for debugging purposes.

It returns a list of objects like:
  {operator: 'Tj', font: 'F29', text: 'Catego'}
*/
function renderContentStreamText(content_stream) {
    // prepare the list that we will "render" to
    var spans = [];
    var context = new context_1.TextDrawingContext(spans);
    renderHelper(content_stream.buffer.toString('binary'), content_stream.Resources, context);
    return spans;
}
exports.renderContentStreamText = renderContentStreamText;
