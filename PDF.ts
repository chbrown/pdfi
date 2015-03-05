/// <reference path="type_declarations/index.d.ts" />
import fs = require('fs');
import chalk = require('chalk');
import logger = require('loge');
import term = require('./dev/term');

import File = require('./File');
import FileReader = require('./readers/FileReader');
import BufferedFileReader = require('./readers/BufferedFileReader');
import BufferedStringReader = require('./readers/BufferedStringReader');

import pdfdom = require('./pdfdom');

import PDFObjectParser = require('./parsers/PDFObjectParser');

var util = require('util-enhanced');

class PDF {
  _trailer: pdfdom.DictionaryObject = {};
  _cross_references: pdfdom.CrossReference[] = [];

  constructor(public file: File) { }

  static open(filepath: string): PDF {
    return new PDF(File.open(filepath));
  }

  get size(): number {
    return this.file.size;
  }

  /** Since the trailers and crossreferences overlap so much,
  we might as well read them all at once.
  */
  readTrailers(): void {
    // Find the offset of the first item in the xref-trailer chain
    var simple_reader = new FileReader(this.file);
    var startxref_position = simple_reader.lastIndexOf('startxref');
    if (startxref_position === null) {
      throw new Error('Could not find "startxref" marker in file');
    }
    var next_xref_position = <number>this.parseObjectAt(startxref_position, "STARTXREF_ONLY");

    while (next_xref_position) { // !== null
      // XREF_TRAILER_ONLY -> "return {cross_references: $1, trailer: $3, startxref: $5};"
      var xref_trailer = this.parseObjectAt(next_xref_position, "XREF_TRAILER_ONLY");
      // TODO: are there really chains of trailers and multiple `Prev` links?
      next_xref_position = xref_trailer['trailer']['Prev'];
      // merge the cross references
      var cross_references = <pdfdom.CrossReference[]>xref_trailer['cross_references'];
      Array.prototype.push.apply(this._cross_references, cross_references);
      // merge the trailer (but the later trailer's values should be preferred)
      this._trailer = util.extend(xref_trailer['trailer'], this._trailer);
    }
  }

  /**
  read the trailer, which gives the location of the cross-reference table and of certain special objects within the body of the file (PDF32000_2008.pdf:7.5.1). For example:

      trailer
      << /Info 2 0 R /Root 1 0 R /Size 105 >>
      startxref
      123456
      %%EOF

  The trailer dictionary will generally have two important fields: "Root" and
  "Info", both of which are object references. Size is the number of objects in
  the document (or maybe just those in the cross references section that
  immediately follows the trailer?)
  */
  get trailer(): pdfdom.DictionaryObject {
    if (this._trailer['Root'] === undefined) {
      this.readTrailers();
    }
    return this._trailer;
  }

  /**
  Reads the xref section referenced from the trailer.

  Requires reading the trailer, if it hasn't already been read.
  */
  get cross_references(): pdfdom.CrossReference[] {
    if (this._cross_references.length == 0) {
      this.readTrailers();
    }
    return this._cross_references;
  }

  /**
  Find the CrossReference matching the given IndirectReference, parsing the
  PDF's cross references if needed.

  Throws an Error if no match is found.
  */
  findCrossReference(reference: pdfdom.IndirectReference): pdfdom.CrossReference {
    // for (var cross_reference in cross_references) {
    for (var i = 0, cross_reference; (cross_reference = this.cross_references[i]); i++) {
      if (cross_reference.in_use &&
          cross_reference.object_number === reference.object_number &&
          cross_reference.generation_number === reference.generation_number) {
        return cross_reference;
      }
    }
    throw new Error(`Could not find a cross reference for ${reference.object_number}:${reference.generation_number}`);
  }

  /**
  Resolves a object reference to the original object from the PDF, parsing the
  PDF's cross references if needed.

  Throws an Error (from findCrossReference) if there is no CrossReference
  matching the requested IndirectReference.

  Also throws an Error if the matched CrossReference points to an IndirectObject
  that doesn't match the originally requested IndirectReference.
  */
  findObject(reference: pdfdom.IndirectReference): pdfdom.PDFObject {
    var cross_reference = this.findCrossReference(reference);
    // logger.info(chalk.green(`findObject(${reference.object_number}:${reference.generation_number}): offset=${cross_reference.offset}`));
    var object = <pdfdom.IndirectObject>this.parseObjectAt(cross_reference.offset, "INDIRECT_OBJECT");
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

  /**
  Resolves a potential IndirectReference to the target object.

  1. If input is an IndirectReference, uses findObject to resolve it to the
     actual object.
  2. Otherwise, returns the input object.
  */
  resolveObject(input: pdfdom.PDFObject): pdfdom.PDFObject {
    // logger.info('PDFReader#resolveObject(%j)', input);
    // type-assertion hack, sry. Why do you make it so difficult, TypeScript?
    if (input !== undefined &&
        input['object_number'] !== undefined &&
        input['generation_number'] !== undefined) {
      var resolution = this.findObject(<pdfdom.IndirectReference>input);
      // logger.info('PDFReader#resolveObject => %j', resolution);
      return resolution;
    }
    return input;
  }

  /**
  "Pages"-type objects have a field, Kids: IndirectReference[].
  Each indirect reference will resolve to a Page or Pages object.

  This function will flatten the page list breadth-first, returning
  */
  flattenPages(Pages: pdfdom.Pages): pdfdom.Page[] {
    var PageGroups: pdfdom.Page[][] = Pages.Kids.map(KidReference => {
      var Kid = this.resolveObject(KidReference);
      if (Kid['Type'] == 'Pages') {
        return this.flattenPages(<pdfdom.Pages>Kid);
      }
      else if (Kid['Type'] == 'Page') {
        return [<pdfdom.Page>Kid];
      }
      else {
        throw new Error('Unknown Kid type: ' + Kid['Type']);
      }
    });
    return Array.prototype.concat.apply([], PageGroups);
  }

  get catalog(): pdfdom.Catalog {
    return <pdfdom.Catalog>this.resolveObject(this.trailer['Root']);
  }

  get pages(): pdfdom.Page[] {
    var Pages = <pdfdom.Pages>this.resolveObject(this.catalog.Pages);
    return this.flattenPages(Pages);
  }

  printContext(start_position: number, error_position: number, margin: number = 256): void {
    logger.error('Context (%d:%d:%d)', start_position, error_position, error_position + margin);
    // File#readBuffer(length: number, position: number): Buffer
    var preface_buffer = this.file.readBuffer(error_position - start_position, start_position);
    var preface_string = preface_buffer.toString('ascii')
    var error_buffer = this.file.readBuffer(margin, error_position);
    var error_string = error_buffer.toString('ascii')
    term.print('%s%s', chalk.cyan(preface_string), chalk.yellow(error_string));
  }

  parseObjectAt(position: number, start: string = "OBJECT_HACK"): pdfdom.PDFObject {
    var reader = new BufferedFileReader(this.file, position);
    var parser = new PDFObjectParser(this, start);

    try {
      return parser.parse(reader);
    }
    catch (exc) {
      term.print('%s', chalk.red(exc.message));
      this.printContext(position, reader.position);

      throw exc;
    }
  }

  parseString(input: string): pdfdom.PDFObject {
    var reader = new BufferedStringReader(input);

    var parser = new PDFObjectParser(this, "OBJECT_HACK");
    return parser.parse(reader);
  }
}

export = PDF;
