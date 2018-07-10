import chalk from 'chalk';
import {
  BufferIterable, BufferIterator,
  Source, SourceBufferIterator,
} from 'lexing';

import {logger} from '../logger';
import {
  CONTENT_STREAM,
  CMAP,
  ContentStreamOperation,
  CMap,
} from './states';
import {PDF} from '../models';

import {MachineStateConstructor} from './machine';

export type ContentStreamOperation = ContentStreamOperation;

export interface PDFBufferIterable extends BufferIterable {
  pdf: PDF;
}
export class PDFSourceBufferIterator extends SourceBufferIterator implements PDFBufferIterable {
  constructor(source: Source, position: number, public pdf: PDF) {
    super(source, position);
  }
}
export class PDFBufferIterator extends BufferIterator implements PDFBufferIterable {
  constructor(buffer: Buffer, position: number, public pdf: PDF) {
    super(buffer, position);
  }
}

export function parseContentStream(buffer: Buffer): ContentStreamOperation[] {
  const bufferIterable = new PDFBufferIterator(buffer, 0, null);
  return new CONTENT_STREAM(bufferIterable, 'binary', 1024).read();
}

export function parseCMap(buffer: Buffer): CMap {
  const bufferIterable = new PDFBufferIterator(buffer, 0, null);
  return new CMAP(bufferIterable, 'binary', 1024).read();
}

export function printContext(source: Source,
                             start_position: number,
                             error_position: number,
                             margin = 256,
                             encoding = 'binary'): void {
  logger.error(`context preface=${chalk.cyan(start_position.toString())} error=${chalk.yellow(error_position.toString())}...`)
  // logger.error(`source.readBuffer(${error_position - start_position}, ${start_position})...`);
  const prefaceBuffer = source.readBuffer(error_position - start_position, start_position);
  const prefaceString = prefaceBuffer.toString(encoding).replace(/\r\n?/g, '\r\n');
  const errorBuffer = source.readBuffer(margin, error_position);
  const errorString = errorBuffer.toString(encoding).replace(/\r\n?/g, '\r\n');
  logger.error(chalk.cyan(prefaceString) + chalk.yellow(errorString));
}

export function parseStateAt<T, I>(source: Source,
                                   STATE: MachineStateConstructor<T, I>,
                                   position: number,
                                   pdf: PDF,
                                   encoding = 'binary',
                                   peekLength = 1024): T {
  const iterable = new PDFSourceBufferIterator(source, position, pdf);
  try {
    return new STATE(iterable, encoding, peekLength).read();
  }
  catch (exc) {
    logger.error(`Error trying to parse ${STATE.name}: ${chalk.red(exc.message)}`);
    printContext(source, position, iterable.position);

    throw exc;
  }
}
