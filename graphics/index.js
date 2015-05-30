var Arrays = require('../Arrays');
var logger = require('loge');
var geometry_1 = require('./geometry');
var models_1 = require('./models');
var document_1 = require('./document');
var stream_1 = require('./stream');
function createLayout(canvas) {
    return {
        textSpans: canvas.getElements(),
        outerBounds: canvas.outerBounds,
        containers: document_1.autodetectLayout(canvas.getElements()),
    };
}
/**
When we render a page, we specify a ContentStream as well as a Resources
dictionary. That Resources dictionary may contain XObject streams that are
embedded as `Do` operations in the main contents, as well as sub-Resources
in those XObjects.
*/
function renderPageLayout(page, skipMissingCharacters, depth) {
    if (skipMissingCharacters === void 0) { skipMissingCharacters = true; }
    if (depth === void 0) { depth = 0; }
    // prepare the canvas that we will draw on
    var pageOuterBounds = new geometry_1.Rectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
    var canvas = new models_1.Canvas(pageOuterBounds);
    var context = new stream_1.CanvasDrawingContext(canvas, page.Resources, skipMissingCharacters, depth);
    var content_stream_string = page.joinContents('\n');
    // read the content stream and render it to the canvas, via the context
    context.applyContentStream(content_stream_string);
    return createLayout(canvas);
}
exports.renderPageLayout = renderPageLayout;
function renderContentStreamLayout(content_stream, skipMissingCharacters, depth) {
    if (skipMissingCharacters === void 0) { skipMissingCharacters = true; }
    if (depth === void 0) { depth = 0; }
    var BBox = content_stream.dictionary['BBox'];
    var outerBounds = new geometry_1.Rectangle(BBox[0], BBox[1], BBox[2], BBox[3]);
    var canvas = new models_1.Canvas(outerBounds);
    var context = new stream_1.CanvasDrawingContext(canvas, content_stream.Resources, skipMissingCharacters, depth);
    context.applyContentStream(content_stream.buffer.toString('binary'));
    return createLayout(canvas);
}
exports.renderContentStreamLayout = renderContentStreamLayout;
function renderPaper(pages, skipMissingCharacters, depth) {
    if (skipMissingCharacters === void 0) { skipMissingCharacters = true; }
    if (depth === void 0) { depth = 0; }
    var containers = Arrays.flatMap(pages, function (page, i, pages) {
        logger.debug("renderPaper: rendering page " + (i + 1) + "/" + pages.length);
        var layout = renderPageLayout(page);
        layout.containers.forEach(function (container) {
            container.getElements().forEach(function (textSpan) { return textSpan.layoutContainer = container; });
        });
        return layout.containers;
    });
    // containers: Container<TextSpan>[] for the whole PDF, but now each TextSpan
    // is also aware of its container
    return document_1.paperFromContainers(containers);
}
exports.renderPaper = renderPaper;
/**
This does none of the graphical stuff; it's mostly for debugging purposes.

It returns a list of objects like:
  {operator: 'Tj', font: 'F29', text: 'Catego'}
*/
function renderContentStreamText(content_stream) {
    // prepare the list that we will "render" to
    var text_operations = [];
    var context = new stream_1.TextDrawingContext(text_operations, content_stream.Resources, false);
    context.applyContentStream(content_stream.buffer.toString('binary'));
    return text_operations;
}
exports.renderContentStreamText = renderContentStreamText;
