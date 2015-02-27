/// <reference path="../type_declarations/index.d.ts" />
var logger = require('loge');
var chalk = require('chalk');
var term = require('../dev/term');
var BufferedStringReader = require('../readers/BufferedStringReader');
var JisonLexer = require('./JisonLexer');
function printParseException(reader, exception) {
    console.error(chalk.red(exception.message));
    return;
    logger.error('(%d,%d): [%d/%d] %s', exception.line, exception.column, exception.offset, reader.length, exception.toString());
    // 32 4 1 [ { type: 'class', value: '[0-9]', description: '[0-9]' },
    var margin = 256; // reader.length > 256 ? 64 : 256;
    var prefix = reader.slice(Math.max(0, exception.offset - margin), exception.offset);
    var position = reader.slice(exception.offset, exception.offset + 1);
    var postfix = reader.slice(exception.offset + 1, exception.offset + margin);
    term.print(term.escape(prefix) + chalk.bgRed(term.escape(position)) + term.escape(postfix));
    // exception.offset, exception.line, exception.column, exception.expected, exception.found);
    // term.print(exc.offset, exc.line, exc.column, exc.expected, exc.found, exc.name, Object.keys(exc));
}
// load the precompiled Jison parser
var Parser = require('./pdfobject.parser').Parser;
// and the lexing rules
var pdfrules = require('./pdfrules');
function parseString(input) {
    var reader = new BufferedStringReader(input);
    return parse(reader);
}
exports.parseString = parseString;
function parse(reader) {
    var parser = new Parser();
    parser.lexer = new JisonLexer(pdfrules);
    try {
        return parser.parse(reader);
    }
    catch (exc) {
        printParseException(reader, exc);
        throw exc;
    }
}
exports.parse = parse;
