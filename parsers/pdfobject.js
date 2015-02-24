/// <reference path="../type_declarations/index.d.ts" />
var logger = require('loge');
var chalk = require('chalk');
var term = require('../dev/term');
var File = require('../File');
var BufferedFileReader = require('../readers/BufferedFileReader');
var BufferedStringReader = require('../readers/BufferedStringReader');
var BufferedLexer = require('./BufferedLexer');
function printParseException(input, exception) {
    logger.error('(%d,%d): [%d/%d] %s', exception.line, exception.column, exception.offset, input.length, exception.toString());
    // 32 4 1 [ { type: 'class', value: '[0-9]', description: '[0-9]' },
    var margin = 256; // input.length > 256 ? 64 : 256;
    var prefix = input.slice(Math.max(0, exception.offset - margin), exception.offset);
    var position = input.slice(exception.offset, exception.offset + 1);
    var postfix = input.slice(exception.offset + 1, exception.offset + margin);
    term.print(term.escape(prefix) + chalk.bgRed(term.escape(position)) + term.escape(postfix));
    // exception.offset, exception.line, exception.column, exception.expected, exception.found);
    // term.print(exc.offset, exc.line, exc.column, exc.expected, exc.found, exc.name, Object.keys(exc));
}
// load the precompiled Jison parser
var Parser = require('./pdfobject.parser').Parser;
var pdfrules = require('./pdfrules');
function createReader(input) {
    if (input instanceof File) {
        return new BufferedFileReader(input);
    }
    else {
        return new BufferedStringReader(input);
    }
}
function parse(input) {
    var reader = createReader(input);
    var parser = new Parser();
    parser.lexer = new BufferedLexer(pdfrules);
    try {
        return parser.parse(reader);
    }
    catch (exc) {
        // printParseException(reader, exc);
        console.error(exc.message);
        throw exc;
    }
}
exports.parse = parse;
