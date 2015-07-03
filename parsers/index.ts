/// <reference path="../type_declarations/index.d.ts" />
import {StringIterable, StringIterator} from 'lexing';

import {OBJECT, STARTXREF, XREF_WITH_TRAILER, CONTENT_STREAM, CMAP, ContentStreamOperation} from './states';
import {PDFObject, IndirectObject} from '../pdfdom';

export function parsePDFObject(string_iterable: StringIterable): PDFObject {
  return new OBJECT(string_iterable, 1024).read();
}

export type ContentStreamOperation = ContentStreamOperation;

export function parseContentStream(content_stream_string: string): ContentStreamOperation[] {
  var string_iterable = new StringIterator(content_stream_string);
  return new CONTENT_STREAM(string_iterable, 1024).read();
}

export function parseCMap(string_iterable: StringIterable) {
  return new CMAP(string_iterable, 1024).read();
}
