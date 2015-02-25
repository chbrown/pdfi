/// <reference path="type_declarations/index.d.ts" />
import PDFReader = require('./pdfreader');
import pdfdom = require('./pdfdom');
import term = require('./dev/term');

export function open(filepath: string): void {
  var pdf_reader = PDFReader.open(filepath);

  term.print('trailer', pdf_reader.trailer);
  term.print('cross_references', term.inspect(pdf_reader.cross_references));

  var Info = pdf_reader.findObject(<pdfdom.IndirectReference>pdf_reader.trailer['Info']);
  term.print('trailer->Info', Info);
  var Root = pdf_reader.findObject(<pdfdom.IndirectReference>pdf_reader.trailer['Root']);
  term.print('trailer->Root', Root);
  var Pages = pdf_reader.findObject(<pdfdom.IndirectReference>Root['Pages']);
  term.print('trailer->Root->Pages', Pages);

  var pages = <pdfdom.ArrayObject>Pages['Kids'];
  term.print('Found %d pages', pages.length);

  // iterate through the page objects
  var page_objects: pdfdom.PDFObject[] = [];
  for (var i = 0, page; (page = pages[i]); i++) {
    var page_object = pdf_reader.findObject(<pdfdom.IndirectReference>page);
    page_objects.push(page_object);
    term.print('Page %d', i, page_object);
  }

  for (var i = 0, page_object: pdfdom.PDFObject; (page_object = page_objects[i]); i++) {
    // page_object.Contents is a list of IndirectReference instances, or maybe just one
    var page_contents = Array.isArray(page_object['Contents']) ? page_object['Contents'] : [page_object['Contents']];
    for (var j = 0, page_content; (page_content = page_contents[j]); j++) {
      var content_object = pdf_reader.findObject(<pdfdom.IndirectReference>page_content);
      term.print('Page %d:%d', i, j, content_object);
    }
  }
}
