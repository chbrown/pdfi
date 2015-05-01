/// <reference path="type_declarations/index.d.ts" />
// This file provides the most abstract API to pdfi. The type signatures of
// this module should following proper versioning practices.
import logger = require('loge');

export function setLoggerLevel(level: number | string) {
  logger.level = level;
}

import PDF = require('./PDF');
import Arrays = require('./Arrays');

interface ReadOptions {
  type?: string;
}

/**
Read a PDF from the given filepath. The callback's second argument, `data`,
depends on the passed options. If options is an empty object, null, or
undefined, data will be a string with newlines separating paragraphs.

If options.type == "document", data will be structured, e.g.:

    {
      sections: [
        {header: 'Abstract', paragraphs: ['This paper...']},
        {header: 'Introduction', paragraphs: ['We hypothesize...', 'We prove...']}
      ]
    }

Or in terms of the types:

    interface Section {
      header: string;
      paragraphs: string[];
    }
    interface Document {
      sections: Section[];
    }

With readFile(filename, {type: 'document'}, ...), `data` will be a Document.
*/
export function readFile(filename: string, options: ReadOptions,
                         callback: (error: Error, data: any) => void) {
  setImmediate(() => {
    var data = readFileSync(filename, options);
    callback(null, data);
  });
}
export function readFileSync(filename: string, options: ReadOptions): any {
  var pdf = PDF.open(filename);
  if (options === null) {
    options = {type: 'string'};
  }
  var document = pdf.getDocument();
  if (options.type == 'document') {
    return document.getSections().map(section => {
      return {
        header: section.header,
        paragraphs: section.getParagraphs().map(paragraph => paragraph.toString()),
      };
    });
  }
  // default: plain string
  return document.getSections().map(section => {
    var paragraphs = section.getParagraphs().map(paragraph => paragraph.toString());
    return [section.header].concat(paragraphs).join('\n');
  }).join('\n');
}
