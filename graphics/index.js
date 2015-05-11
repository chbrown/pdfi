var geometry_1 = require('./geometry');
var document_1 = require('./document');
var stream_1 = require('./stream');
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
    var context = new stream_1.CanvasDrawingContext(canvas, page.Resources);
    var content_stream_string = page.joinContents('\n');
    // read the content stream and render it to the canvas, via the context
    context.applyContentStream(content_stream_string);
    return canvas;
}
exports.renderPage = renderPage;
function renderContentStream(content_stream) {
    var BBox = content_stream.dictionary['BBox'];
    var outerBounds = new geometry_1.Rectangle(BBox[0], BBox[1], BBox[2], BBox[3]);
    var canvas = new document_1.DocumentCanvas(outerBounds);
    var context = new stream_1.CanvasDrawingContext(canvas, content_stream.Resources);
    context.applyContentStream(content_stream.buffer.toString('binary'));
    return canvas;
}
exports.renderContentStream = renderContentStream;
/**
renderPageText does none of the graphical stuff.
it's mostly for debugging purposes.

It returns a list of objects like:
  {operator: 'Tj', font: 'F29', text: 'Catego'}
*/
function renderContentStreamText(content_stream) {
    // prepare the list that we will "render" to
    var text_operations = [];
    var context = new stream_1.TextDrawingContext(text_operations, content_stream.Resources);
    context.applyContentStream(content_stream.buffer.toString('binary'));
    return text_operations;
}
exports.renderContentStreamText = renderContentStreamText;
