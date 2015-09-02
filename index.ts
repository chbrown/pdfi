/// <reference path="type_declarations/index.d.ts" />
// This file provides the most abstract API to pdfi. The type signatures of
// this module should following proper versioning practices.
import {logger, Level} from 'loge';
import * as yargs from 'yargs';
import * as academia from 'academia';
import * as chalk from 'chalk';

import {PDF} from './PDF';
import {IndirectReference, Model, ContentStream} from './models';

import {Source} from 'lexing';
var lexing_fs = require('lexing/fs');

Error['stackTraceLimit'] = 50;

// import visible = require('visible');
// var escaper = new visible.Escaper({/* literalEOL: false */});

export function setLoggerLevel(level: Level) {
  logger.level = level;
}

function stderr(line: string) {
  process.stderr.write(chalk.magenta(line) + '\n');
}

function stdout(line: string) {
  process.stdout.write(line + '\n');
}

interface ReadOptions {
  type?: string;
}

/**
The callback's second argument, `data`,
depends on the passed options. If options is an empty object, null, or
undefined, data will be a string with newlines separating paragraphs.
*/
export function readFile(filename: string,
                         options: ReadOptions,
                         callback: (error: Error, data: any) => void) {
  setImmediate(() => {
    var data = readFileSync(filename, options);
    callback(null, data);
  });
}

/**
Read a PDF from the given file.

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
export function readFileSync(filename: string,
                             options: ReadOptions = {type: 'string'}): any {
  var source: Source = new lexing_fs.FileSystemSource.open(filename);
  var pdf = new PDF(source);
  if (options.type == 'pdf') {
    return pdf;
  }
  if (options.type == 'pdf') {
    return pdf;
  }
  if (options.type == 'metadata') {
    return pdf.trailer.toJSON();
  }
  if (options.type === 'xref') {
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

function objects(filename: string,
                 references: IndirectReference[],
                 decode: boolean = false) {
  var source: Source = new lexing_fs.FileSystemSource.open(filename);
  var pdf = new PDF(source);
  references.forEach(reference => {
    stderr(reference.toString());
    var object = new Model(pdf, reference).object

    if (decode && ContentStream.isContentStream(object)) {
      // the buffer getter handles all the decoding
      var buffer: Buffer = new ContentStream(pdf, object).buffer;
      process.stdout.write(buffer);
      return;
    }

    process.stdout.write(JSON.stringify(object) + '\n');
  });
}

export function main() {
  var argvparser = yargs
    .usage('Usage: pdfi <command> <filename> [<args>]')
    .command('text', 'Extract text')
    .command('paper', 'Extract text as an academia.Paper (JSON format)')
    .command('metadata', 'Print trailer as JSON')
    .command('xref', 'Print cross references as JSON')
    // .command('pages;', 'Print content for all pages')
    .command('objects', 'Dump specific objects')
    .example('pdfi objects Sci.pdf 1 14:0 106', 'print objects "1:0", "14:0", and "106:0"')
    .describe({
      // 'objects' options
      decode: 'decode content streams',
      // cli meta
      help: 'print this help message',
      verbose: 'print extra output',
    })
    .alias({
      help: 'h',
      verbose: 'v',
    })
    .demand(2)
    .string('_')
    .boolean(['help', 'verbose', 'decode']);

  var argv = argvparser.argv;
  setLoggerLevel(argv.verbose ? Level.debug : Level.info);
  if (argv.verbose) {
    chalk.enabled = true; // dumb
  }

  if (argv.help) {
    yargs.showHelp();
  }
  else if (argv.version) {
    console.log(require('../package').version);
  }
  else {
    var command = argv._[0];
    var filename = argv._[1];
    if (command === 'text') {
      var text = readFileSync(filename, {type: 'string'});
      stdout(text);
    }
    else if (command === 'paper' || command === 'metadata' || command === 'xref') {
      var data = readFileSync(filename, {type: command});
      stdout(JSON.stringify(data));
    }
    // else if (command === 'pages') {
    //   pdf.pages.forEach((page, i, pages) => {
    //     stderr(`Page ${i} of ${pages.length}`);
    //     stdout(page.joinContents(' '));
    //   });
    // }
    else if (command === 'objects') {
      var references = argv._.slice(1).map(IndirectReference.fromString);
      objects(filename, references, argv.decode);
    }
    else {
      yargs.showHelp();
      stderr(`Unrecognized command: "${command}"`);
      process.exit(1);
    }
  }
}
