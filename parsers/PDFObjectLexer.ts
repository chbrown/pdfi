/// <reference path="../type_declarations/index.d.ts" />
import lexing = require('lexing');
var Token = lexing.Token;

// each action function has the BufferedLexer instance bound as `this`,
// allowing manipulating this.states, or this.reader (a BufferedReader)
var default_rules: lexing.RegexRule<any>[] = [
  [/^$/, match => Token('EOF') ],
  [/^<([A-Fa-f0-9]+)>/, function(match) {
    // handle implied final 0 (PDF32000_2008.pdf:16)
    // by adding 0 character to end of odd-length strings
    var hexstring = match[1];
    var padded = (hexstring.length % 2 === 0) ? hexstring : hexstring + '0';
    var bytes = padded.match(/.{2}/g).map(function(pair) { return parseInt(pair, 16); });
    return Token('HEXSTRING', bytes);
  }],
  [/^true/, match => Token('BOOLEAN', true) ],
  [/^false/, match => Token('BOOLEAN', false) ],
  [/^null/, match => Token('NULL', null) ],
  [/^\s+/, match => null ], // skip over whitespace
  [/^\(/, function(match) {
    this.states.push('INPARENS');
    return Token('OPENPARENS', null);
  }],
  [/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, match => Token('NAME', match[1]) ],
  [/^<</, match => Token('<<', match[0]) ],
  [/^>>/, match => Token('>>', match[0]) ],
  [/^\[/, match => Token('[', match[0]) ],
  [/^\]/, match => Token(']', match[0]) ],
  [/^([0-9]+)\s+([0-9]+)\s+R/, match => Token('REFERENCE', {
      object_number: parseInt(match[1], 10),
      generation_number: parseInt(match[2], 10),
    })
  ],
  [/^([0-9]+)\s+([0-9]+)\s+obj/, match => Token('INDIRECT_OBJECT_IDENTIFIER', {
      object_number: parseInt(match[1], 10),
      generation_number: parseInt(match[2], 10),
    })
  ],
  [/^endobj/, match => Token('END_INDIRECT_OBJECT', match[0]) ],
  [/^-?[0-9]+\.[0-9]+/, match => Token('NUMBER', parseFloat(match[0])) ],
  [/^-?[0-9]+/, match => Token('NUMBER', parseInt(match[0], 10)) ],
  [/^trailer/, match => Token('TRAILER', match[0]) ],
  [/^startxref/, match => Token('STARTXREF', match[0]) ],
  // %%EOF isn't really EOF, but we never want to read past it in one go,
  // so we might as well treat it like one
  [/^%%EOF/, match => Token('EOF', match[0]) ],
  [/^xref\s*(\r\n|\n|\r)/, function(match) {
    this.states.push('XREF');
    return Token('XREF_START', match[0]);
  }],
  // STREAM handling
  /**
  From PDF32000_2008.pdf:7.3.8
  > The keyword stream that follows the stream dictionary shall be followed by an end-of-line marker consisting of either a CARRIAGE RETURN and a LINE FEED or just a LINE FEED, and not by a CARRIAGE RETURN alone.
  */
  [/^stream(\r\n|\n)/, function(match) {
    this.states.push('STREAM');
    return Token('START_STREAM', match[0]);
  }],
];

var state_rules: {[index: string]: lexing.RegexRule<any>[]} = {};

// XREF conditions
state_rules['XREF'] = [
  [/^(\d+)\s+(\d+)\s*(\r\n|\n|\r)/, function(match) {
      // this.states.pop();
    var object_count = parseInt(match[2], 10);
    for (var i = 0; i < object_count; i++) {
      this.states.push('XREF_SUBSECTION');
    }

    return Token('XREF_SUBSECTION_HEADER', parseInt(match[1], 10));
  }],
  [/^/, function(match) {
    this.states.pop();
    return Token('XREF_END', null);
  }],
];

// XREF_SUBSECTION conditions
state_rules['XREF_SUBSECTION'] = [
  [/^(\d{10}) (\d{5}) (f|n)( \r| \n|\r\n)/, function(match) {
    this.states.pop();
    return Token('XREF_REFERENCE', {
      // object_number: object_number,
      offset: parseInt(match[1], 10),
      generation_number: parseInt(match[2], 10),
      in_use: match[3] === 'n',
    });
  }],
];

state_rules['STREAM'] = [
  /**
  From PDF32000_2008.pdf:7.3.8
  > There should be an end-of-line marker after the data and before endstream; this marker shall not be included in the stream length. There shall not be any extra bytes, other than white space, between endstream and endobj.

  That "should be" is a recommendation. Sometimes there isn't anything, not even
  a newline, before the "endstream" marker.
  */
  [/^\s*endstream/, function(match) {
    this.states.pop();
    return Token('END_STREAM', match[0]);
  }],
  /**
  From PDF32000_2008.pdf:7.3.8
  > The sequence of bytes that make up a stream lie between the end-of-line marker following the stream keyword and the endstream keyword; the stream dictionary specifies the exact number of bytes.
  */
  [/^/, function(match) {
    // other side of the dirty lexer<->parser hack
    var buffer = this.iterable.next(this['yy'].stream_length);
    this['yy'].stream_length = null;
    return Token('STREAM_BUFFER', buffer);
  }],
];

state_rules['INPARENS'] = [
  // INPARENS conditions
  [/^\(/, function(match) {
    this.states.push('INPARENS');
    return Token('CHAR', match[0]);
  }],
  [/^\)/, function(match) {
    this.states.pop();
    if (this.states.length === 0) {
      return Token('CLOSEPARENS', null);
    }
    else {
      return Token('CHAR', match[0]);
    }
  }],
  // escaped newline: skip over it.
  // This is from a real-world example; I'm not sure it's in the spec.
  [/^\\(\r\n|\n|\r)/, match => null ],
  // literal newline: is this in the spec? Or is there a real-world example?
  // [/^(\r\n|\n|\r)/, match => ['CHAR', match[0]] ],
  [/^./, match => Token('CHAR', match[0]) ],
];

class PDFObjectLexer extends lexing.Tokenizer<any> {
  constructor() {
    super(default_rules, state_rules);
  }
}

export = PDFObjectLexer;
