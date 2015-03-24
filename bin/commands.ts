/// <reference path="../type_declarations/index.d.ts" />
import PDF = require('../PDF');
import models = require('../models');
import chalk = require('chalk');
chalk.enabled = true; // dumb

import visible = require('visible');

function stderr(line: string) {
  process.stderr.write(chalk.magenta(line) + '\n');
}

var escaper = new visible.Escaper({
  // literalEOL: false,
});

function enhanceObject(pdf: PDF, object: any): any {
  if (models.ContentStream.isContentStream(object)) {
    var content_stream = new models.ContentStream(pdf, object);
    return content_stream.buffer;
  }

  if (models.Type1Font.isType1Font(object)) {
    return new models.Type1Font(pdf, object);
  }

  if (models.Type0Font.isType0Font(object)) {
    return new models.Type0Font(pdf, object);
  }

  if (models.Font.isFont(object)) {
    return new models.Font(pdf, object);
  }

  if (models.Encoding.isEncoding(object)) {
    return new models.Encoding(pdf, object);
  }

  stderr(`Could not enhance object`);
  return object;
}

export function dump(filename: string,
                     trailer: boolean = true,
                     catalog: boolean = false,
                     info: boolean = false,
                     xref: boolean = false,
                     pages: boolean = false,
                     objects: models.IndirectReference[] = [],
                     enhance: boolean = false) {
  var pdf = PDF.open(filename);

  if (trailer) {
    stderr(`[${filename}] Trailer`);
    process.stdout.write(JSON.stringify(pdf.trailer) + '\n');
  }
  if (catalog) {
    stderr(`[${filename}] Catalog`);
    var Root = escaper.simplify(pdf.trailer.Root);
    process.stdout.write(JSON.stringify(Root) + '\n');
  }
  if (info) {
    stderr(`[${filename}] Info`);
    var Info = escaper.simplify(pdf.trailer.Info);
    process.stdout.write(JSON.stringify(Info) + '\n');
  }
  if (xref) {
    stderr(`[${filename}] Cross References`);
    process.stdout.write(JSON.stringify(pdf.cross_references) + '\n');
  }

  if (pages) {
    // iterate through the page objects
    pdf.pages.forEach((page, i, pages) => {
      stderr(`Page ${i} of ${pages.length}`);
      process.stdout.write(page.joinContents('\n'));
    });
  }

  objects.forEach(reference => {
    stderr(reference.toString());
    var model = new models.Model(pdf, reference);
    var object = model.object;

    if (enhance) {
      object = enhanceObject(pdf, object)
    }

    process.stdout.write(JSON.stringify(object) + '\n');
  });

}

export function extract(filename: string,
                        sections: string[] = []) {
  var pdf = PDF.open(filename);

  pdf.pages.forEach(function(page, page_index, pages) {
    stderr(`Rendering Page ${page_index} of ${pages.length}`);
    var lines = page.getParagraphStrings(sections);
    process.stdout.write(lines.join('\n') + '\n');
  });
}
