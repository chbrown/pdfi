var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/// <reference path="../type_declarations/index.d.ts" />
var lexing = require('lexing');
// each action function has the BufferedLexer instance bound as `this`,
// allowing manipulating this.states, or this.reader (a BufferedReader)
var default_rules = [
    [/^$/, function (match) { return ['EOF', null]; }],
    [/^<([A-Fa-f0-9]+)>/, function (match) {
        // handle implied final 0 (PDF32000_2008.pdf:16)
        // by adding 0 character to end of odd-length strings
        var hexstring = match[1];
        var padded = (hexstring.length % 2 === 0) ? hexstring : hexstring + '0';
        var bytes = padded.match(/.{2}/g).map(function (pair) {
            return parseInt(pair, 16);
        });
        return ['HEXSTRING', bytes];
    }],
    [/^true/, function (match) { return ['BOOLEAN', true]; }],
    [/^false/, function (match) { return ['BOOLEAN', false]; }],
    [/^null/, function (match) { return ['NULL', null]; }],
    [/^\s+/, function (match) { return null; }],
    [/^\(/, function (match) {
        this.states.push('INPARENS');
        return ['OPENPARENS', null];
    }],
    [/^\/([!-'*-.0-;=?-Z\\^-z|~]+)/, function (match) { return ['NAME', match[1]]; }],
    [/^<</, function (match) { return ['<<', match[0]]; }],
    [/^>>/, function (match) { return ['>>', match[0]]; }],
    [/^\[/, function (match) { return ['[', match[0]]; }],
    [/^\]/, function (match) { return [']', match[0]]; }],
    [/^([0-9]+)\s+([0-9]+)\s+R/, function (match) { return ['REFERENCE', {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
    }]; }],
    [/^([0-9]+)\s+([0-9]+)\s+obj/, function (match) { return ['INDIRECT_OBJECT_IDENTIFIER', {
        object_number: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
    }]; }],
    [/^endobj/, function (match) { return ['END_INDIRECT_OBJECT', match[0]]; }],
    [/^-?[0-9]+\.[0-9]+/, function (match) { return ['NUMBER', parseFloat(match[0])]; }],
    [/^-?[0-9]+/, function (match) { return ['NUMBER', parseInt(match[0], 10)]; }],
    [/^trailer/, function (match) { return ['TRAILER', match[0]]; }],
    [/^startxref/, function (match) { return ['STARTXREF', match[0]]; }],
    [/^%%EOF/, function (match) { return ['EOF', match[0]]; }],
    [/^xref\s*(\r\n|\n|\r)/, function (match) {
        this.states.push('XREF');
        return ['XREF_START', match[0]];
    }],
    [/^stream(\r\n|\n)/, function (match) {
        this.states.push('STREAM');
        return ['START_STREAM', match[0]];
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
        return ['XREF_SUBSECTION_HEADER', parseInt(match[1], 10)];
    }],
    [/^/, function (match) {
        this.states.pop();
        return ['XREF_END', null];
    }],
];
// XREF_SUBSECTION conditions
state_rules['XREF_SUBSECTION'] = [
    [/^(\d{10}) (\d{5}) (f|n)( \r| \n|\r\n)/, function (match) {
        this.states.pop();
        return ['XREF_REFERENCE', {
            // object_number: object_number,
            offset: parseInt(match[1], 10),
            generation_number: parseInt(match[2], 10),
            in_use: match[3] === 'n',
        }];
    }],
];
state_rules['STREAM'] = [
    [/^\s*endstream/, function (match) {
        this.states.pop();
        return ['END_STREAM', match[0]];
    }],
    [/^/, function (match) {
        // other side of the dirty lexer<->parser hack
        var buffer = this.reader.readBuffer(this.stream_length);
        console.log('lexer.stream_length', this.stream_length);
        this.stream_length = null;
        return ['STREAM_BUFFER', buffer];
    }],
];
state_rules['INPARENS'] = [
    [/^\(/, function (match) {
        this.states.push('INPARENS');
        return ['CHAR', match[0]];
    }],
    [/^\)/, function (match) {
        this.states.pop();
        if (this.states.length === 0) {
            return ['CLOSEPARENS', null];
        }
        else {
            return ['CHAR', match[0]];
        }
    }],
    [/^\\(\r\n|\n|\r)/, function (match) { return null; }],
    [/^./, function (match) { return ['CHAR', match[0]]; }],
];
var PDFObjectLexer = (function (_super) {
    __extends(PDFObjectLexer, _super);
    function PDFObjectLexer() {
        _super.call(this, default_rules, state_rules);
    }
    return PDFObjectLexer;
})(lexing.BufferedLexer);
module.exports = PDFObjectLexer;
