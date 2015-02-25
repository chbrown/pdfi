module.exports = [
  {
    condition: 'INITIAL',
    pattern: /<([A-Fa-f0-9]+)>/,
    action: function(match) {
      // handle implied final 0 (PDF32000_2008.pdf:16)
      // by adding 0 character to end of odd-length strings
      var hexstring = match[1];
      var padded = (hexstring.length % 2 === 0) ? hexstring : hexstring + '0';
      this.yytext = padded.match(/.{2}/g).map(function(pair) { return parseInt(pair, 16); });
      return 'HEXSTRING';
    }
  },
  {
    condition: 'INITIAL',
    pattern: /true/,
    action: function(match) {
      this.yytext = true;
      return 'BOOLEAN';
    },
  },
  {
    condition: 'INITIAL',
    pattern: /false/,
    action: function(match) {
      this.yytext = false;
      return 'BOOLEAN';
    },
  },
  {
    condition: 'INITIAL',
    pattern: /\s+/,
    action: function(match) {
      return null;
    }
  },
  {
    condition: 'INITIAL',
    pattern: /\(/,
    action: function(match) {
      this.pushState('INPARENS');
      return 'OPENPARENS';
    },
  },
  {
    condition: 'INITIAL',
    pattern: /\/[!-'*-.0-;=?-Z\\^-z|~]+/,
    action: function(match) {
      this.yytext = this.yytext.slice(1);
      return 'NAME';
    },
  },
  {
    condition: 'INITIAL',
    pattern: /<</,
    action: function() { return '<<'; }
  },
  {
    condition: 'INITIAL',
    pattern: />>/,
    action: function() { return '>>'; }
  },
  {
    condition: 'INITIAL',
    pattern: /\[/,
    action: function() { return '['; }
  },
  {
    condition: 'INITIAL',
    pattern: /\]/,
    action: function() { return ']'; }
  },
  {
    condition: 'INITIAL',
    pattern: /([0-9]+)\s+([0-9]+)\s+R/,
    action: function(match) {
      this.yytext = {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
      };
      return 'REFERENCE';
    }
  },
  {
    condition: 'INITIAL',
    pattern: /([0-9]+)\s+([0-9]+)\s+obj/,
    action: function(match) {
      this.yytext = {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
      };
      return 'INDIRECT_OBJECT_IDENTIFIER';
    }
  },
  {
    condition: 'INITIAL',
    pattern: /endobj/,
    action: function() { return 'END_INDIRECT_OBJECT'; }
  },
  {
    condition: 'INITIAL',
    pattern: /[0-9]+\.[0-9]+/,
    action: function(match) {
      this.yytext = parseFloat(match[0]);
      return 'NUMBER';
    },
  },
  {
    condition: 'INITIAL',
    pattern: /[0-9]+/,
    action: function(match) {
      this.yytext = parseInt(match[0], 10);
      return 'NUMBER';
    },
  },
  {
    condition: 'INITIAL',
    pattern: /stream(\r\n|\n)/,
    action: function(match) {
      this.pushState('STREAM');
      return 'START_STREAM';
    },
  },
  // this is kind of hack to get around Jison not being able to exit immediately
  {
    condition: 'INITIAL',
    pattern: /xref/,
    action: function(match) {
      return 'EOF';
    },
  },
  // STREAM conditions
  {
    condition: 'STREAM',
    pattern: /endstream/,
    action: function(match) {
      this.popState();
      return 'END_STREAM';
    },
  },
  {
    condition: 'STREAM',
    pattern: /^/,
    action: function(match) {
      // other side of the dirty lexer<->parser hack
      this.yytext = this.reader.readBuffer(this.stream_length);
      // this.buffer = this.buffer.slice(this.yytext.length);
      this.stream_length = null;
      return 'STREAM_BUFFER';
    },
  },
  // INPARENS conditions
  {
    condition: 'INPARENS',
    pattern: /\(/,
    action: function(match) {
      this.pushState('INPARENS');
      return 'CHAR';
    },
  },
  {
    condition: 'INPARENS',
    pattern: /\)/,
    action: function(match) {
      this.state_stack.pop();
      return (this.currentState() == 'INITIAL') ? 'CLOSEPARENS' : 'CHAR';
    },
  },
  {
    condition: 'INPARENS',
    pattern: /./,
    action: function() { return 'CHAR'; }
  },
];
