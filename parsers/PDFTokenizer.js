var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
var Token = lexing.Token;
// each action function has the BufferedLexer instance bound as `this`,
// allowing manipulating this.states, or this.reader (a BufferedReader)
var default_rules = [
    [/^$/, function (match) { return Token('EOF'); }],
    [/^<([A-Fa-f0-9]+)>/, function (match) {
        // handle implied final 0 (PDF32000_2008.pdf:16)
        // by adding 0 character to end of odd-length strings
        var hexstring = match[1];
        var padded = (hexstring.length % 2 === 0) ? hexstring : hexstring + '0';
        var bytes = padded.match(/.{2}/g).map(function (pair) {
            return parseInt(pair, 16);
        });
        return Token('HEXSTRING', bytes);
    }],
    [/^true/, function (match) { return Token('BOOLEAN', true); }],
    [/^false/, function (match) { return Token('BOOLEAN', false); }],
    [/^null/, function (match) { return Token('NULL', null); }],
    [/^\s+/, function (match) { return null; }],
    [/^\(/, function (match) {
        this.states.push('INPARENS');
        return Token('OPENPARENS', null);
    }],
    [/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, function (match) { return Token('NAME', match[1]); }],
    [/^<</, function (match) { return Token('<<', match[0]); }],
    [/^>>/, function (match) { return Token('>>', match[0]); }],
    [/^\[/, function (match) { return Token('[', match[0]); }],
    [/^\]/, function (match) { return Token(']', match[0]); }],
    [/^([0-9]+)\s+([0-9]+)\s+R/, function (match) { return Token('REFERENCE', {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
    }); }],
    [/^([0-9]+)\s+([0-9]+)\s+obj/, function (match) { return Token('INDIRECT_OBJECT_IDENTIFIER', {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
    }); }],
    [/^endobj/, function (match) { return Token('END_INDIRECT_OBJECT', match[0]); }],
    [/^-?[0-9]+\.[0-9]+/, function (match) { return Token('NUMBER', parseFloat(match[0])); }],
    [/^-?[0-9]+/, function (match) { return Token('NUMBER', parseInt(match[0], 10)); }],
    [/^trailer/, function (match) { return Token('TRAILER', match[0]); }],
    [/^startxref/, function (match) { return Token('STARTXREF', match[0]); }],
    [/^%%EOF/, function (match) { return Token('EOF', match[0]); }],
    [/^xref\s*(\r\n|\n|\r)/, function (match) {
        this.states.push('XREF');
        return Token('XREF_START', match[0]);
    }],
    [/^stream(\r\n|\n)/, function (match) {
        this.states.push('STREAM');
        return Token('START_STREAM', match[0]);
    }],
];
var state_rules = {};
// XREF conditions
state_rules['XREF'] = [
    [/^(\d+)\s+(\d+)\s*(\r\n|\n|\r)/, function (match) {
        // this.states.pop();
        var object_count = parseInt(match[2], 10);
        for (var i = 0; i < object_count; i++) {
            this.states.push('XREF_SUBSECTION');
        }
        return Token('XREF_SUBSECTION_HEADER', parseInt(match[1], 10));
    }],
    [/^/, function (match) {
        this.states.pop();
        return Token('XREF_END', null);
    }],
];
// XREF_SUBSECTION conditions
state_rules['XREF_SUBSECTION'] = [
    [/^(\d{10}) (\d{5}) (f|n)( \r| \n|\r\n)/, function (match) {
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
    [/^\s*endstream/, function (match) {
        this.states.pop();
        return Token('END_STREAM', match[0]);
    }],
    [/^/, function (match) {
        // other side of the dirty lexer<->parser hack
        var buffer;
        if (this.iterable.nextBytes) {
            // this is what will usually be called, when this.iterable is a
            // FileStringIterator.
            buffer = this.iterable.nextBytes(this['yy'].stream_length);
        }
        else {
            // hack to accommodate the string-based tests, where the iterable is not a
            // FileStringIterator, but a stubbed StringIterator.
            buffer = new Buffer(this.iterable.next(this['yy'].stream_length), 'ascii');
        }
        this['yy'].stream_length = null;
        return Token('STREAM_BUFFER', buffer);
    }],
];
state_rules['INPARENS'] = [
    [/^\(/, function (match) {
        this.states.push('INPARENS');
        return Token('CHAR', match[0]);
    }],
    [/^\)/, function (match) {
        this.states.pop();
        if (this.states.length === 0) {
            return Token('CLOSEPARENS', null);
        }
        else {
            return Token('CHAR', match[0]);
        }
    }],
    [/^\\(\r\n|\n|\r)/, function (match) { return null; }],
    [/^./, function (match) { return Token('CHAR', match[0]); }],
];
var PDFTokenizer = (function (_super) {
    __extends(PDFTokenizer, _super);
    function PDFTokenizer() {
        _super.call(this, default_rules, state_rules);
    }
    return PDFTokenizer;
})(lexing.Tokenizer);
module.exports = PDFTokenizer;
