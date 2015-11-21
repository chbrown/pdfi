import * as fs from 'fs';
import * as chalk from 'chalk';
import {Paper} from 'academia/types';
import {MachineState, MachineStateConstructor, Source, SourceStringIterator} from 'lexing';

import {logger} from './logger';
import * as pdfdom from './pdfdom';
import * as models from './models';
import * as graphics from './graphics/index';

import {parsePDFObject} from './parsers/index';
import {OBJECT, STARTXREF, XREF_WITH_TRAILER} from './parsers/states';
import {indexOf, lastIndexOf} from './sourceops';

class PDFStringIterator extends SourceStringIterator {
  constructor(source: Source, _encoding: string, _position: number, public pdf: PDF) {
    super(source, _encoding, _position);
  }
}

export class PDF {
  private _trailer: models.Trailer;
  private _cross_references: pdfdom.CrossReference[] = [];
  // _cached_objects is a cache of PDF objects indexed by
  // "${object_number}:${generation_number}" identifiers
  private _cached_objects: {[index: string]: pdfdom.PDFObject} = {};
  private _cached_models: {[index: string]: models.Model} = {};

  constructor(public source: Source) { }

  get size(): number {
    return this.source.size;
  }

  /** Since the trailers and cross references overlap so much,
  we might as well read them all at once.
  */
  readTrailers(): void {
    // Find the offset of the first item in the xref-trailer chain
    var startxref_position = lastIndexOf(this.source, 'startxref');
    if (startxref_position === null) {
      throw new Error('Could not find "startxref" marker in file');
    }
    var next_xref_position = <number>this.parseStateAt(STARTXREF, startxref_position);

    this._trailer = new models.Trailer(this)
    while (next_xref_position) { // !== null
      // XREF_TRAILER_ONLY -> "return {cross_references: $1, trailer: $3, startxref: $5};"
      var xref_trailer = this.parseStateAt(XREF_WITH_TRAILER, next_xref_position);
      // TODO: are there really chains of trailers and multiple `Prev` links?
      next_xref_position = xref_trailer['trailer']['Prev'];
      // merge the cross references
      var cross_references = <pdfdom.CrossReference[]>xref_trailer['cross_references'];
      Array.prototype.push.apply(this._cross_references, cross_references);

      this._trailer.merge(xref_trailer['trailer']);
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
  get trailer(): models.Trailer {
    if (this._trailer === undefined) {
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
  private findCrossReference(object_number: number, generation_number: number): pdfdom.CrossReference {
    for (var i = 0, cross_reference; (cross_reference = this.cross_references[i]); i++) {
      if (cross_reference.in_use &&
          cross_reference.object_number === object_number &&
          cross_reference.generation_number === generation_number) {
        return cross_reference;
      }
    }
    throw new Error(`Could not find a cross reference for ${object_number}:${generation_number}`);
  }

  getObject(object_number: number, generation_number: number): pdfdom.PDFObject {
    var object_id = `${object_number}:${generation_number}`;
    var cached_object = this._cached_objects[object_id];
    if (cached_object === undefined) {
      cached_object = this._cached_objects[object_id] = this._readObject(object_number, generation_number);
    }
    return cached_object;
  }

  /**
  If getModel is called multiple times with the same object:generation number
  pair, the ctor should be the same, or at least, if the ctor is different, it
  should have a different name.
  */
  getModel<T extends models.Model>(object_number: number,
                                   generation_number: number,
                                   ctor: { new(pdf: PDF, object: pdfdom.PDFObject): T }): T {
    var model_id = `${ctor['name']}(${object_number}:${generation_number})`;
    // the type coersion below assumes that the caller read the doc comment
    // on this function.
    var cached_model = <T>this._cached_models[model_id];
    if (cached_model === undefined) {
      var object = this.getObject(object_number, generation_number);
      cached_model = this._cached_models[model_id] = new ctor(this, object);
    }
    return cached_model;
  }

  /**
  Resolves a object reference to the original object from the PDF, parsing the
  PDF's cross references if needed.

  Throws an Error (from findCrossReference) if there is no CrossReference
  matching the requested IndirectReference.

  Also throws an Error if the matched CrossReference points to an IndirectObject
  that doesn't match the originally requested IndirectReference.
  */
  private _readObject(object_number: number, generation_number: number): pdfdom.PDFObject {
    var cross_reference = this.findCrossReference(object_number, generation_number);
    var indirect_object: pdfdom.IndirectObject;
    if (cross_reference.offset) {
      indirect_object = <pdfdom.IndirectObject>this.parseStateAt(OBJECT, cross_reference.offset);
    }
    else {
      var object_stream = this.getModel(cross_reference.object_stream_object_number, 0, models.ObjectStream);
      indirect_object = object_stream.objects[cross_reference.object_stream_index];
    }
    // indirect_object is a pdfdom.IndirectObject, but we already knew the object number
    // and generation number; that's how we found it. We only want the value of
    // the object. But we might as well double check that what we got is what
    // we were looking for:
    if (indirect_object.object_number != cross_reference.object_number) {
      throw new Error(`PDF cross references are incorrect; the offset
        ${cross_reference.offset} does not lead to an object numbered
        ${cross_reference.object_number}; instead, the object at that offset is
        ${indirect_object.object_number}`);
    }
    return indirect_object.value;
  }

  /**
  This resolves the Root Catalog's Pages tree into an Array of all its leaves.
  */
  get pages(): models.Page[] {
    return this.trailer.Root.Pages.getLeaves();
  }

  /**
  Returns one string (one line) for each paragraph.

  Reduces all the PDF's pages to a single array of Lines. Each Line keeps
  track of the container it belongs to, so that we can measure offsets
  later.

  If `section_names` is empty, return all sections.
  */
  renderPaper(): Paper {
    return graphics.renderPaper(this.pages);
  }

  /**
  Resolves a potential IndirectReference to the target object.

  1. If input is an IndirectReference, uses getObject to resolve it to the
     actual object.
  2. Otherwise, returns the input object.

  This is useful in the PDFObjectParser stream hack, but shouldn't be used elsewhere.
  */
  private _resolveObject(object: pdfdom.PDFObject): pdfdom.PDFObject {
    // type-assertion hack, sry. Why do you make it so difficult, TypeScript?
    if (models.IndirectReference.isIndirectReference(object)) {
      var reference = <pdfdom.IndirectReference>object;
      return this.getObject(reference.object_number, reference.generation_number);
    }
    return object;
  }

  printContext(start_position: number, error_position: number, margin: number = 256): void {
    logger.error(`context preface=${chalk.cyan(start_position.toString())} error=${chalk.yellow(error_position.toString())}...`)
    // File#readBuffer(length: number, position: number): Buffer
    // logger.error(`source.readBuffer(${error_position - start_position}, ${start_position})...`);
    var preface_buffer = this.source.readBuffer(error_position - start_position, start_position);
    var preface_string = preface_buffer.toString('ascii').replace(/\r\n?/g, '\r\n');
    var error_buffer = this.source.readBuffer(margin, error_position);
    var error_string = error_buffer.toString('ascii').replace(/\r\n?/g, '\r\n');
    // logger.log(chalk.cyan(preface_string) + chalk.yellow(error_string));
    logger.error('%s%s', chalk.cyan(preface_string), chalk.yellow(error_string));
  }

  parseStateAt<T, I>(STATE: MachineStateConstructor<T, I>, position: number, peek_length = 1024): pdfdom.PDFObject {
    var iterable = new PDFStringIterator(this.source, 'ascii', position, this);
    try {
      return new STATE(iterable, peek_length).read();
    }
    catch (exc) {
      logger.error(`Error trying to parse ${STATE['name']}: ${chalk.red(exc.message)}`);
      this.printContext(position, iterable.position);

      throw exc;
    }
  }
}
