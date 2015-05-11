/// <reference path="../type_declarations/index.d.ts" />
import {StringIterable, StringIterator} from 'lexing';
import {CONTENT_STREAM, ContentStreamOperation} from '../parsers/states';

export type ContentStreamOperation = ContentStreamOperation;

export function parseString(content_stream_string: string): ContentStreamOperation[] {
  return parseStringIterable(new StringIterator(content_stream_string));
}

export function parseStringIterable(content_stream_string_iterable: StringIterable): ContentStreamOperation[] {
  return new CONTENT_STREAM(content_stream_string_iterable, 1024).read();
}
