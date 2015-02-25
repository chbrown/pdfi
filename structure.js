/// <reference path="type_declarations/index.d.ts" />
var PDFReader = require('./pdfreader');
var term = require('./dev/term');
function open(filepath) {
    var pdf_reader = PDFReader.open(filepath);
    term.print('trailer', pdf_reader.trailer);
    term.print('cross_references', term.inspect(pdf_reader.cross_references));
    var Info = pdf_reader.findObject(pdf_reader.trailer['Info']);
    term.print('trailer->Info', Info);
    var Root = pdf_reader.findObject(pdf_reader.trailer['Root']);
    term.print('trailer->Root', Root);
    var Pages = pdf_reader.findObject(Root['Pages']);
    term.print('trailer->Root->Pages', Pages);
    var pages = Pages['Kids'];
    term.print('Found %d pages', pages.length);
    // iterate through the page objects
    var page_objects = [];
    for (var i = 0, page; (page = pages[i]); i++) {
        var page_object = pdf_reader.findObject(page);
        page_objects.push(page_object);
        term.print('Page %d', i, page_object);
    }
    for (var i = 0, page_object; (page_object = page_objects[i]); i++) {
        // page_object.Contents is a list of IndirectReference instances, or maybe just one
        var page_contents = Array.isArray(page_object['Contents']) ? page_object['Contents'] : [page_object['Contents']];
        for (var j = 0, page_content; (page_content = page_contents[j]); j++) {
            var content_object = pdf_reader.findObject(page_content);
            term.print('Page %d:%d', i, j, content_object);
        }
    }
}
exports.open = open;
