/// <reference path="../type_declarations/index.d.ts" />
import logger = require('loge');
import lexing = require('lexing');
var jison = require('jison');

import pdfdom = require('../pdfdom');
import PDF = require('../PDF');

import PDFTokenizer = require('./PDFTokenizer');
import JisonLexerWrapper = require('./JisonLexerWrapper');

var bnf = {
  "INDIRECT_OBJECT": [
    [
      "INDIRECT_OBJECT_IDENTIFIER OBJECT END_INDIRECT_OBJECT",
      "return { object_number: $1.object_number, generation_number: $1.generation_number, value: $2 }"
    ]
  ],
  "OBJECT_HACK": [
    [ "OBJECT EOF", "return $1" ],
    [ "OBJECT OBJECT", "return $1" ]
  ],
  "OBJECT": [
    "STRING",
    "NUMBER",
    "REFERENCE",
    "BOOLEAN",
    "ARRAY",
    "DICTIONARY",
    "NAME",
    "STREAM",
    "NULL"
  ],
  "objects": [
    ["OBJECT", "$$ = [$1]"],
    ["objects OBJECT", "$$ = $1; $1.push($2)"]
  ],
  "ARRAY": [
    ["[ objects ]", "$$ = $2"],
    ["[ ]", "$$ = []"]
  ],
  "STRING": [
    "HEXSTRING",
    "EXTENDED_HEXSTRING",
    ["OPENPARENS CLOSEPARENS", "$$ = \"\""],
    ["OPENPARENS chars CLOSEPARENS", "$$ = $2.join(\"\")"]
  ],
  "EXTENDED_HEXSTRING": [
    [ "< bytes >", "$$ = $2" ],
  ],
  "bytes": [
    [ "BYTE", "$$ = [$1]" ],
    [ "bytes BYTE", "$$ = $1; $1.push($2)" ]
  ],
  "STREAM_HEADER": [
    [
      "DICTIONARY START_STREAM",
      "/* pretty ugly hack right here; yy is the Jison sharedState; yy.lexer is the JisonLexerWrapper instance; yy.lexer.lexer is the lexing.BufferedLexer instance*/ yy.stream_length = yy.pdf._resolveObject($1.Length);"
    ]
  ],
  "STREAM": [
    ["STREAM_HEADER STREAM_BUFFER END_STREAM", "$$ = { dictionary: $1, buffer: $2 }"]
  ],
  "DICTIONARY": [
    [ "<< keyvaluepairs >>", "$$ = $2" ],
    [ "<< >>", "$$ = {}" ]
  ],
  "keyvaluepairs": [
    ["NAME OBJECT", "$$ = {}; $$[$1] = $2;"],
    ["keyvaluepairs NAME OBJECT", "$$ = $1; $1[$2] = $3;"]
  ],
  "chars": [
    [ "CHAR", "$$ = [$1]" ],
    [ "chars CHAR", "$$ = $1; $1.push($2)" ]
  ],
  "STARTXREF_ONLY": [
    [ "STARTXREF NUMBER EOF", "return $2" ]
  ],
  "XREF_ONLY": [
    ["CROSS_REFERENCES TRAILER", "return $1"],
    ["CROSS_REFERENCES EOF", "return $1"],
  ],
  "XREF_TRAILER_ONLY": [
    [
      "CROSS_REFERENCES TRAILER DICTIONARY STARTXREF NUMBER EOF",
      "return {cross_references: $1, trailer: $3, startxref: $5};"
    ]
  ],
  "CROSS_REFERENCES": [
    [
      "XREF_START XREF_SUBSECTIONS XREF_END",
      "$$ = Array.prototype.concat.apply([], $2); // produce single array"
    ]
  ],
  "XREF_SUBSECTION": [
    [
      "XREF_SUBSECTION_HEADER XREF_REFERENCES",
      "$$ = $2; for (var i = 0; i < $$.length; i++) { $$[i].object_number = $1 + i; }"
    ]
  ],
  "XREF_SUBSECTIONS": [
    [ "XREF_SUBSECTION", "$$ = [$1]" ],
    [ "XREF_SUBSECTIONS XREF_SUBSECTION", "$$ = $1; $1.push($2)" ]
  ],
  "XREF_REFERENCES": [
    [ "XREF_REFERENCE", "$$ = [$1]" ],
    [ "XREF_REFERENCES XREF_REFERENCE", "$$ = $1; $1.push($2)" ]
  ]
}

/**
Simple Parser instance for REPL inspection:

new jison.Parser({bnf: {"ARRAY": [["[ objects ]", "$$ = $2"], ["[ ]", "$$ = []"] ]}})
*/
class PDFObjectParser {
  jison_parser: any;
  tokenizer = new PDFTokenizer();

  constructor(pdf: PDF, start: string) {
    this.jison_parser = new jison.Parser({start: start, bnf: bnf});
    // jison.Parser instances expect a {lex: () => string} interface attached
    // as Parser#lexer
    this.jison_parser.lexer = new JisonLexerWrapper(this.tokenizer);
    // the stream parser rules need access to the original PDF, so we use the
    // `yy` JisonSharedState object for that.
    this.jison_parser.yy.pdf = pdf;
  }

  parse(iterable: lexing.StringIterable): pdfdom.PDFObject {
    return this.jison_parser.parse(iterable);
  }

}

export = PDFObjectParser;
