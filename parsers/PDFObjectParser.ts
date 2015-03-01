/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');
import chalk = require('chalk');

import pdfdom = require('../pdfdom');
import BufferedReader = require('../readers/BufferedReader');
import PDF = require('../PDF');

var jison = require('jison');
var bnf = require('./bnf.json');

import JisonLexer = require('./JisonLexer');
// load the precompiled Jison parser
// import JisonParser = require('./JisonParser');
// and the lexing rules
var pdfrules = require('./pdfrules');

class PDFObjectParser {
  jison_parser: any;

  constructor(pdf: PDF, start: string) {
    this.jison_parser = new jison.Parser({
      start: start,
      bnf: bnf,
    });
    this.jison_parser.lexer = new JisonLexer(pdfrules);
    this.jison_parser.yy = {pdf: pdf};
  }

  parse(reader: BufferedReader): pdfdom.PDFObject {
    return this.jison_parser.parse(reader);
  }
}

export = PDFObjectParser;
