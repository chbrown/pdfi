/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');
import chalk = require('chalk');

import pdfdom = require('../pdfdom');
import BufferedReader = require('../readers/BufferedReader');
import BufferedStringReader = require('../readers/BufferedStringReader');

import JisonLexer = require('./JisonLexer');

// load the precompiled Jison parser
var JisonParser = require('./pdfobject.parser').Parser;
// and the lexing rules
var pdfrules = require('./pdfrules');

class PDFObjectParser {
  jison_parser: any;

  constructor() {
    this.jison_parser = new JisonParser();
    this.jison_parser.lexer = new JisonLexer(pdfrules);
  }

  get yy(): any {
    return this.jison_parser.yy;
  }

  parseString(input: string): pdfdom.PDFObject {
    var reader = new BufferedStringReader(input);
    return this.parse(reader);
  }

  parse(reader: BufferedReader): pdfdom.PDFObject {
    try {
      return this.jison_parser.parse(reader);
    }
    catch (exc) {
      logger.error(chalk.red(exc.message).toString());
      throw exc;
    }
  }
}

export = PDFObjectParser;
