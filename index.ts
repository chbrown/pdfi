// This file provides the most abstract API to pdfi. The type signatures of
// this module should following proper versioning practices.
import * as academia from 'academia';
import * as chalk from 'chalk';
import {Source} from 'lexing';

import {Level} from 'loge';
import {logger} from './logger';
import {PDF} from './PDF';
import {IndirectReference, Model, ContentStream} from './models';

export function setLoggerLevel(level: Level) {
  logger.level = level;
}

interface ReadOptions {
  type?: string;
}

/**
Read a PDF from the given lexing.source.

options.type determines the return value.
- 'pdf': returns the full pdfi.PDF instance.
- 'paper': returns an academia.types.Paper
- 'string': returns a single string, which is like a flattened version of the
  'paper' option, where the section lines have been prefixed with '#',
  paragraphs are joined separated by single line breaks, and sections are
  separated by double line breaks.
- 'metadata': returns the PDF's trailer section
- 'xref': returns the PDF's trailer section
- anything else: returns null
*/
export function readSourceSync(source: Source,
                               options: ReadOptions = {type: 'string'}): any {
  var pdf = new PDF(source);
  if (options.type == 'pdf') {
    return pdf;
  }
  if (options.type == 'metadata') {
    return pdf.trailer.toJSON();
  }
  if (options.type == 'xref') {
    return pdf.cross_references;
  }
  // otherwise, we need to extract the paper
  var paper = pdf.renderPaper();
  if (options.type == 'paper') {
    return paper;
  }
  if (options.type == 'string') {
    return paper.sections.map(section => {
      return `# ${section.title}\n${section.paragraphs.join('\n')}`;
    }).join('\n\n')
  }
  // this maybe should be an error?
  return null;
}
