#!/usr/bin/env node
var logger = require('loge');
var term = require('../dev/term');
var PDF = require('../PDF');

var yargs = require('yargs')
  .usage('Usage: $0 -f ScienceArticle.pdf')
  .describe({
    filename: 'pdf file to open',
    help: 'print this help message',
    verbose: 'print extra output',
  })
  .alias({
    verbose: 'v',
    filename: 'f',
  })
  .demand(['filename'])
  .boolean(['help', 'verbose'])
  .default({
    filename: 'examples/church-qpdf.uncompressed.pdf'
  });

var argv = yargs.argv;
logger.level = argv.verbose ? 'debug' : 'info';

function main() {
  var pdf = PDF.open(argv.filename);
  term.print('trailer', pdf.trailer);
  term.print('cross_references', term.inspect(pdf.cross_references));
  var Info = pdf.resolveObject(pdf.trailer.Info);
  term.print('trailer->Info', Info);
  var Root = pdf.resolveObject(pdf.trailer.Root);
  term.print('trailer->Root', Root);
  var Pages = pdf.resolveObject(Root.Pages);
  term.print('trailer->Root->Pages', Pages);

  var pages = pdf.pages;
  term.print('Found %d pages', pages.length);

  // iterate through the page objects
  for (var i = 0, page; (page = pages[i]); i++) {
    // page_object.Contents is a list of IndirectReference instances, or maybe just one
    var contents = Array.isArray(page.Contents) ? page.Contents : [page.Contents];
    for (var j = 0, content; (content = contents[j]); j++) {
        var content_object = pdf.resolveObject(content);
        term.print('Page %d:%d', i, j, content_object);
    }
  }
}

if (require.main == module) main();
