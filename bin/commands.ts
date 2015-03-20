/// <reference path="../type_declarations/index.d.ts" />
import PDF = require('../PDF');
import models = require('../models');
import chalk = require('chalk');
chalk.enabled = true; // dumb

var visible = require('visible');

function stderr(line: string) {
  process.stderr.write(chalk.magenta(line) + '\n');
}

var escaper = new visible.Escaper({
  // literalEOL: false,
});

export function dump(filename: string,
                     trailer: boolean = true,
                     catalog: boolean = false,
                     info: boolean = false,
                     xref: boolean = false,
                     pages: boolean = false,
                     object: string[] = [],
                     stream: string[] = []) {
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

  var eachObject = (reference_arguments: string[], func) => {
    reference_arguments.forEach(reference_argument => {
      var object_parts = reference_argument.toString().split(':');
      var object_number = parseInt(object_parts[0], 10);
      var generation_number = parseInt(object_parts[1] || '0', 10);
      var object = pdf.getObject(object_number, generation_number);
      func(object_number, generation_number, object);
    });
  };

  if (pages) {
    // iterate through the page objects
    pdf.pages.forEach((page, i, pages) => {
      stderr(`Page ${i} of ${pages.length}`);
      process.stdout.write(page.joinContents('\n'));
    });
  }

  if (object) {
    eachObject(object, (object_number, generation_number, object) => {
      stderr(`${object_number}:${generation_number}`);
      process.stdout.write(JSON.stringify(object) + '\n');
    });
  }

  if (stream) {
    eachObject(stream, (object_number, generation_number, object) => {
      var content_stream = new models.ContentStream(pdf, object);
      stderr(`${object_number}:${generation_number}`);
      process.stdout.write(content_stream.buffer);
    });
  }

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
