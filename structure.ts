/// <reference path="type_declarations/index.d.ts" />
import logger = require('loge');
import chalk = require('chalk');

import FileCursor = require('./FileCursor');

import pdfdom = require('./pdfdom');

import run = require('./dev/run');
import term = require('./dev/term');

function printParseException(input, exception) {
  logger.error('(%d,%d): [%d/%d] %s', exception.line, exception.column,
    exception.offset, input.length, exception.toString());
  // 32 4 1 [ { type: 'class', value: '[0-9]', description: '[0-9]' },
  var margin = 256; // input.length > 256 ? 64 : 256;
  var prefix = input.slice(Math.max(0, exception.offset - margin), exception.offset);
  var position = input.slice(exception.offset, exception.offset + 1)
  var postfix = input.slice(exception.offset + 1, exception.offset + margin);
  term.print(term.escape(prefix) + chalk.bgRed(term.escape(position)) + term.escape(postfix));
  // exception.offset, exception.line, exception.column, exception.expected, exception.found);
  // term.print(exc.offset, exc.line, exc.column, exc.expected, exc.found, exc.name, Object.keys(exc));
}

function wrapParser(parser) {
  return {
    parse: function(input) {
      try {
        return parser.parse(input);
      }
      catch (exc) {
        printParseException(input, exc);
        throw exc;
      }
    }
  }
}

var pdfobject_parser = wrapParser(require('./parsers/pdfobject'));
var xref_parser = wrapParser(require('./parsers/xref'));


/** parseStartXref(buffer)
 *
 * Read a snippet like
 *
 *    startxref
 *    123456
 *    %%EOF
 *
 * And return the index specified, e.g., 123456.
 */
function parseStartXref(buffer: Buffer): number {
  // \s+ matches newlines
  var xref_offset_match = buffer.toString('utf8').match(/startxref\s+(\d+)/);
  if (xref_offset_match == null) throw new Error('Could not find final startxref');
  return parseInt(xref_offset_match[1], 10);
}


class PDFFileReader extends FileCursor {
  // the trailer will generally have two important fields: "Root" and "Info",
  // both of which are object references

  constructor(public filepath: string) {
    super(filepath);
  }

  /** PDFFileReader#readMetadata()
   * Reads the final xref and trailer from the opened PDF file, returning a
   * minimal pdfdom.PDF structure (just trailer and cross_references)
   */
  readMetadata(): pdfdom.PDF {
    // 1. find the final "startxref <offset> %%EOF", which should happen in the last 64 bytes
    var footer = this.readRangeUntilString(this.stats.size - 64, '%%EOF');
    if (footer == null) throw new Error('Could not find final %%EOF');
    var xref_offset = parseStartXref(footer.buffer);

    // 2. seek to that xref and read until the trailer
    var xref_content = this.readRangeUntilString(xref_offset, 'trailer');
    var xref_string = xref_content.buffer.toString('ascii');
    // term.print('xref_string: %j', xref_string);
    var cross_references = xref_parser.parse(xref_string);

    // 3. read the trailer
    var trailer_content = this.readRangeUntilString(xref_content.end, 'startxref');
    // skip over the "trailer" marker
    var trailer_string = trailer_content.buffer.slice(7).toString('ascii').trim();
    // term.print('trailer_string: %j', trailer_string);
    var trailer_object = pdfobject_parser.parse(trailer_string);
    // term.print('trailer_object: %j', trailer_object);
    var trailer = <pdfdom.DictionaryObject>trailer_object;
    //var next_xref = indexed_file.readRangeUntil(trailer_content.end, '%%EOF');
    // next_xref is just the XREF from the first lookup
    return {
      cross_references: cross_references,
      trailer: trailer,
    };
  }

  /** findObject()

  pdfdom.IndirectReference is just a simple interface:
     {object_number: number, generation_number: number}
  */
  findObject(reference: pdfdom.IndirectReference,
             cross_references: pdfdom.CrossReference[]): pdfdom.PDFObject {
    var cross_reference;
    for (var i = 0; (cross_reference = cross_references[i]); i++) {
      // TODO: also check generation number
      if (cross_reference.object_number === reference.object_number) break;
    }
    if (cross_reference === undefined) {
      throw new Error(`Could not find a cross reference for
        ${reference.object_number}:${reference.generation_number}`);
    }
    // TODO: also check that cross_reference.in_use == true
    // TODO: only match endobj at the beginning of lines
    var object_content = this.readRangeUntilString(cross_reference.offset, 'endobj');
    var object_string = object_content.buffer.toString('ascii');
    var object = pdfobject_parser.parse(object_string);
    // object is a pdfdom.IndirectObject, but we already knew the object number
    // and generation number; that's how we found it. We only want the value of
    // the object. But we might as well double check that what we got is what
    // we were looking for:
    if (object.object_number != cross_reference.object_number) {
      throw new Error(`PDF cross references are incorrect; the offset
        ${cross_reference.offset} does not lead to an object numbered
        ${cross_reference.object_number}; instead, the object at that offset is
        ${object.object_number}`);
    }
    return object.value;
  }
}

export function open(filepath: string): void {
  var reader = new PDFFileReader(filepath);

  var pdf = reader.readMetadata();
  term.print('cross_references', term.inspect(pdf.cross_references));
  term.print('trailer', pdf.trailer);

  var Info = reader.findObject(<pdfdom.IndirectReference>pdf.trailer['Info'], pdf.cross_references);
  term.print('trailer->Info', Info);
  var Root = reader.findObject(<pdfdom.IndirectReference>pdf.trailer['Root'], pdf.cross_references);
  term.print('trailer->Root', Root);
  var Pages = reader.findObject(<pdfdom.IndirectReference>Root['Pages'], pdf.cross_references);
  term.print('trailer->Root->Pages', Pages);

  var pages = <pdfdom.ArrayObject>Pages['Kids'];
  term.print('Found %d pages', pages.length);

  // iterate through the page objects
  var page_objects: pdfdom.PDFObject[] = [];
  for (var i = 0, page; (page = pages[i]); i++) {
    var page_object = reader.findObject(<pdfdom.IndirectReference>page, pdf.cross_references);
    page_objects.push(page_object);
    term.print('Page %d', i, page_object);
  }

  for (var i = 0, page_object: pdfdom.PDFObject; (page_object = page_objects[i]); i++) {
    // page_object.Contents is a list of IndirectReference instances, or maybe just one
    var page_contents = Array.isArray(page_object['Contents']) ? page_object['Contents'] : [page_object['Contents']];
    for (var j = 0, page_content; (page_content = page_contents[j]); j++) {
      var content_object = reader.findObject(<pdfdom.IndirectReference>page_content, pdf.cross_references);
      term.print('Page %d:%d', i, j, content_object);
    }
  }

}
