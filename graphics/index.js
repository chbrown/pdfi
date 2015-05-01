/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
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
    var pageBox = new geometry_1.Rectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
    var canvas = new document_1.DocumentCanvas(pageBox);
    var contents_string = page.joinContents('\n');
    var contents_string_iterable = new lexing.StringIterator(contents_string);
    var context = new stream_1.DrawingContext(page.Resources);
    context.render(contents_string_iterable, canvas);
    return canvas;
}
exports.renderPage = renderPage;
