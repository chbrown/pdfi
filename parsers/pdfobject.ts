/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');
import chalk = require('chalk');
import term = require('../dev/term');

import File = require('../File');
import pdfdom = require('../pdfdom');
import BufferedReader = require('../readers/BufferedReader');
import BufferedFileReader = require('../readers/BufferedFileReader');
import BufferedStringReader = require('../readers/BufferedStringReader');

import BufferedLexer = require('./BufferedLexer');

function printParseException(reader, exception) {
  console.error(chalk.red(exception.message));
  return;
  logger.error('(%d,%d): [%d/%d] %s', exception.line, exception.column,
    exception.offset, reader.length, exception.toString());
  // 32 4 1 [ { type: 'class', value: '[0-9]', description: '[0-9]' },
  var margin = 256; // reader.length > 256 ? 64 : 256;
  var prefix = reader.slice(Math.max(0, exception.offset - margin), exception.offset);
  var position = reader.slice(exception.offset, exception.offset + 1)
  var postfix = reader.slice(exception.offset + 1, exception.offset + margin);
  term.print(term.escape(prefix) + chalk.bgRed(term.escape(position)) + term.escape(postfix));
  // exception.offset, exception.line, exception.column, exception.expected, exception.found);
  // term.print(exc.offset, exc.line, exc.column, exc.expected, exc.found, exc.name, Object.keys(exc));
}

// load the precompiled Jison parser
var Parser = require('./pdfobject.parser').Parser;

var pdfrules = require('./pdfrules');

export function parseString(input: string): pdfdom.PDFObject {
  var reader = new BufferedStringReader(input);
  return parse(reader);
}

export function parse(reader: BufferedReader): pdfdom.PDFObject {
  var parser = new Parser();
  parser.lexer = new BufferedLexer(pdfrules);

  try {
    return parser.parse(reader);
  }
  catch (exc) {
    printParseException(reader, exc);
    throw exc;
  }
}
