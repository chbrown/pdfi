/// <reference path="type_declarations/index.d.ts" />
// This file provides the most abstract API to pdfi. The type signatures of
// this module should following proper versioning practices.
var logger = require('loge');
function setLoggerLevel(level) {
    logger.level = level;
}
exports.setLoggerLevel = setLoggerLevel;
var PDF = require('./PDF');
/**
Read a PDF from the given filepath. The callback's second argument, `data`,
depends on the passed options. If options is an empty object, null, or
undefined, data will be a string with newlines separating paragraphs.

If options.type == "paper", data will be structured, e.g.:

    {
      sections: [
        {title: 'Abstract', paragraphs: ['This paper...']},
        {title: 'Introduction', paragraphs: ['We hypothesize...', 'We prove...']}
      ]
    }

Or in terms of the types:

    interface Section {
      title: string;
      paragraphs: string[];
    }
    interface Document {
      sections: Section[];
    }

With readFile(filename, {type: 'paper'}, ...), `data` will be an academia.types.Paper.
*/
function readFile(filename, options, callback) {
    setImmediate(function () {
        var data = readFileSync(filename, options);
        callback(null, data);
    });
}
exports.readFile = readFile;
function readFileSync(filename, options) {
    var pdf = PDF.open(filename);
    if (options === null) {
        options = { type: 'string' };
    }
    var paper = pdf.renderPaper();
    if (options.type == 'paper') {
        return paper;
    }
    // default: plain string
    return paper.sections.map(function (section) {
        var paragraphs = section.paragraphs.map(function (paragraph) { return paragraph.toString(); });
        return [section.title].concat(paragraphs).join('\n');
    }).join('\n');
}
exports.readFileSync = readFileSync;
