// each action function has the BufferedLexer instance bound as `this`,
// allowing manipulating this.states, or this.lexer.reader (a BufferedReader)
//
// interface Rule<T> {
//   condition: string;
//   pattern: RegExp;
//   action: (match: RegExpMatchArray) => [string, any];
// }
module.exports = [
  {
    condition: 'INITIAL',
    pattern: /^$/,
    action: function(match) {
      return ['EOF', null];
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^<([A-Fa-f0-9]+)>/,
    action: function(match) {
      // handle implied final 0 (PDF32000_2008.pdf:16)
      // by adding 0 character to end of odd-length strings
      var hexstring = match[1];
      var padded = (hexstring.length % 2 === 0) ? hexstring : hexstring + '0';
      var bytes = padded.match(/.{2}/g).map(function(pair) { return parseInt(pair, 16); });
      return ['HEXSTRING', bytes];
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^true/,
    action: function(match) {
      return ['BOOLEAN', true];
    },
  },
  {
    condition: 'INITIAL',
    pattern: /^false/,
    action: function(match) {
      return ['BOOLEAN', false];
    },
  },
  {
    condition: 'INITIAL',
    pattern: /^null/,
    action: function(match) {
      return ['NULL', null];
    },
  },
  {
    condition: 'INITIAL',
    pattern: /^\s+/,
    action: function(match) {
      // skip over whitespace
      return null;
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^\(/,
    action: function(match) {
      this.states.push('INPARENS');
      return ['OPENPARENS', null];
    },
  },
  {
    condition: 'INITIAL',
    pattern: /^\/([!-'*-.0-;=?-Z\\^-z|~]+)/,
    action: function(match) {
      return ['NAME', match[1]];
    },
  },
  {
    condition: 'INITIAL',
    pattern: /^<</,
    action: function(match) {
      return ['<<', match[0]];
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^>>/,
    action: function(match) {
      return ['>>', match[0]];
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^\[/,
    action: function(match) {
      return ['[', match[0]];
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^\]/,
    action: function(match) {
      return [']', match[0]];
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^([0-9]+)\s+([0-9]+)\s+R/,
    action: function(match) {
      return ['REFERENCE', {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
      }];
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^([0-9]+)\s+([0-9]+)\s+obj/,
    action: function(match) {
      return ['INDIRECT_OBJECT_IDENTIFIER', {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
      }];
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^endobj/,
    action: function(match) {
      return ['END_INDIRECT_OBJECT', match[0]];
    }
  },
  {
    condition: 'INITIAL',
    pattern: /^-?[0-9]+\.[0-9]+/,
    action: function(match) {
      return ['NUMBER', parseFloat(match[0])];
    },
  },
  {
    condition: 'INITIAL',
    pattern: /^-?[0-9]+/,
    action: function(match) {
      return ['NUMBER', parseInt(match[0], 10)];
    },
  },
  /*  trailer
      << /Info 2 0 R /Root 1 0 R /Size 105 >>
      startxref
      123456
      %%EOF
  */
  {
    condition: 'INITIAL',
    pattern: /^trailer/,
    action: function(match) {
      return ['TRAILER', match[0]];
    },
  },
  {
    condition: 'INITIAL',
    pattern: /^startxref/,
    action: function(match) {
      return ['STARTXREF', match[0]];
    },
  },
  {
    condition: 'INITIAL',
    pattern: /^%%EOF/,
    action: function(match) {
      // not really EOF, but we never want to read past it in one go,
      // so we might as well treat it like one
      return ['EOF', match[0]];
    },
  },

  {
    condition: 'INITIAL',
    pattern: /^xref\s*(\r\n|\n|\r)/,
    action: function(match) {
      this.states.push('XREF');
      return ['XREF_START', match[0]];
    },
  },
  // XREF conditions
  {
    condition: 'XREF',
    pattern: /^(\d+)\s+(\d+)\s*(\r\n|\n|\r)/,
    action: function(match) {
      // this.states.pop();
      var object_count = parseInt(match[2], 10);
      for (var i = 0; i < object_count; i++) {
        this.states.push('XREF_SUBSECTION');
      }

      return ['XREF_SUBSECTION_HEADER', parseInt(match[1], 10)];
    },
  },
  {
    condition: 'XREF',
    pattern: /^/,
    action: function(match) {
      this.states.pop();
      return ['XREF_END', null];
    },
  },
  // XREF_SUBSECTION conditions
  {
    condition: 'XREF_SUBSECTION',
    pattern: /^(\d{10}) (\d{5}) (f|n)( \r| \n|\r\n)/,
    action: function(match) {
      this.states.pop();
      return ['XREF_REFERENCE', {
        // object_number: object_number,
        offset: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
        in_use: match[3] === 'n',
      }];
    },
  },
  // STREAM handling
  /**
  From PDF32000_2008.pdf:7.3.8
  > The keyword stream that follows the stream dictionary shall be followed by an end-of-line marker consisting of either a CARRIAGE RETURN and a LINE FEED or just a LINE FEED, and not by a CARRIAGE RETURN alone.
  */
  {
    condition: 'INITIAL',
    pattern: /^stream(\r\n|\n)/,
    action: function(match) {
      this.states.push('STREAM');
      return ['START_STREAM', match[0]];
    },
  },
  /**
  From PDF32000_2008.pdf:7.3.8
  > There should be an end-of-line marker after the data and before endstream; this marker shall not be included in the stream length. There shall not be any extra bytes, other than white space, between endstream and endobj.

  That "should be" is a recommendation. Sometimes there isn't anything, not even
  a newline, before the "endstream" marker.
  */
  {
    condition: 'STREAM',
    pattern: /^\s*endstream/,
    action: function(match) {
      this.states.pop();
      return ['END_STREAM', match[0]];
    },
  },
  /**
  From PDF32000_2008.pdf:7.3.8
  > The sequence of bytes that make up a stream lie between the end-of-line marker following the stream keyword and the endstream keyword; the stream dictionary specifies the exact number of bytes.
  */
  {
    condition: 'STREAM',
    pattern: /^/,
    action: function(match) {
      // other side of the dirty lexer<->parser hack
      var buffer = this.reader.readBuffer(this.stream_length);
      this.stream_length = null;
      return ['STREAM_BUFFER', buffer];
    },
  },
  // INPARENS conditions
  {
    condition: 'INPARENS',
    pattern: /^\(/,
    action: function(match) {
      this.states.push('INPARENS');
      return ['CHAR', match[0]];
    },
  },
  {
    condition: 'INPARENS',
    pattern: /^\)/,
    action: function(match) {
      this.states.pop();
      if (this.states.top === 'INITIAL') {
        return ['CLOSEPARENS', null];
      }
      else {
        return ['CHAR', match[0]];
      }
    },
  },
  {
    condition: 'INPARENS',
    pattern: /^(.|\r|\n)/,
    action: function(match) {
      return ['CHAR', match[0]];
    }
  },
];
