// This file provides the most abstract API to pdfi. The type signatures of
// this module should following proper versioning practices.
import * as academia from 'academia';
import {Source} from 'lexing';

import {logger, Level} from './logger';
import {PDF} from './PDF';
import {IndirectReference, Model, ContentStream} from './models';

export function setLoggerLevel(level: Level) {
  logger.level = level;
}

export interface ReadOptions {
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
export function readSourceSync(source: Source, {type = 'string'}: ReadOptions): any {
  const pdf = new PDF(source);
  if (type == 'pdf') {
    return pdf;
  }
  if (type == 'metadata') {
    return pdf.trailer.toJSON();
  }
  if (type == 'xref') {
    return pdf.cross_references;
  }
  // otherwise, we need to extract the paper
  const paper = pdf.renderPaper();
  if (type == 'paper') {
    return paper;
  }
  if (type == 'string') {
    return paper.sections.map(section => {
      return `# ${section.title}\n${section.paragraphs.join('\n')}`;
    }).join('\n\n')
  }
  // this maybe should be an error?
  return null;
}
