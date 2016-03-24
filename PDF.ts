import * as chalk from 'chalk';
import {Paper} from 'academia/types';
import {Source} from 'lexing';
import {lastIndexOf} from 'lexing/source';
import {flatMap} from 'tarry';

import {logger} from './logger';
import * as pdfdom from './pdfdom';
import * as models from './models';
import {renderLayoutFromPage, paperFromParagraphs} from './graphics/index';

import {parseStateAt} from './parsers/index';
import {OBJECT, STARTXREF, XREF_WITH_TRAILER} from './parsers/states';

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
    const startxref_position = lastIndexOf(this.source, 'startxref');
    if (startxref_position === undefined) {
      throw new Error('Could not find "startxref" marker in file');
    }
    let next_xref_position = parseStateAt(this.source, STARTXREF, startxref_position, this);

    this._trailer = new models.Trailer(this);
    while (next_xref_position) { // !== null
      const xref_trailer = parseStateAt(this.source, XREF_WITH_TRAILER, next_xref_position, this);
      // TODO (or to check): are there really chains of trailers and multiple `Prev` links?
      next_xref_position = xref_trailer.trailer['Prev'];

      // add the cross references
      this._cross_references.push(...xref_trailer.cross_references);

      this._trailer.add(xref_trailer.trailer);
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
  findCrossReference(object_number: number, generation_number: number): pdfdom.CrossReference {
    for (let i = 0, cross_reference; (cross_reference = this.cross_references[i]); i++) {
      if (cross_reference.in_use &&
          cross_reference.object_number === object_number &&
          cross_reference.generation_number === generation_number) {
        return cross_reference;
      }
    }
    throw new Error(`Could not find a cross reference for ${object_number}:${generation_number}`);
  }

  getObject(object_number: number, generation_number: number): pdfdom.PDFObject {
    const object_id = `${object_number}:${generation_number}`;
    let cached_object = this._cached_objects[object_id];
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
    const model_id = `${ctor['name']}(${object_number}:${generation_number})`;
    // the type coersion below assumes that the caller read the doc comment
    // on this function.
    let cached_model = <T>this._cached_models[model_id];
    if (cached_model === undefined) {
      const object = this.getObject(object_number, generation_number);
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
    const cross_reference = this.findCrossReference(object_number, generation_number);
    let indirect_object: pdfdom.IndirectObject;
    if (cross_reference.offset) {
      indirect_object = parseStateAt(this.source, OBJECT, cross_reference.offset, this);
    }
    else {
      const object_stream = this.getModel(cross_reference.object_stream_object_number, 0, models.ObjectStream);
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
  Render all of the PDF's pages into a single textual data structure, where each
  section is represented by a title string and a list of paragraphs (each
  paragraph is represented by a single string, without newlines).
  */
  renderPaper(skipMissingCharacters = true): Paper {
    const paragraphs = flatMap(this.pages, (page, i, pages) => {
      logger.debug(`renderPaper: rendering page ${i + 1}/${pages.length}`);
      return renderLayoutFromPage(page, skipMissingCharacters);
    });
    return paperFromParagraphs(paragraphs);
  }

  /**
  Resolves a potential IndirectReference to the target object.

  1. If input is an IndirectReference, uses getObject to resolve it to the
     actual object.
  2. Otherwise, returns the input object.

  This is useful in the PDFObjectParser stream hack, but shouldn't be used elsewhere.
  */
  _resolveObject(object: pdfdom.PDFObject): pdfdom.PDFObject {
    // type-assertion hack, sry. Why do you make it so difficult, TypeScript?
    if (models.IndirectReference.isIndirectReference(object)) {
      const reference = <pdfdom.IndirectReference>object;
      return this.getObject(reference.object_number, reference.generation_number);
    }
    return object;
  }
}
