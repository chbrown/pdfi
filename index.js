var logger_1 = require('./logger');
var PDF_1 = require('./PDF');
function setLoggerLevel(level) {
    logger_1.logger.level = level;
}
exports.setLoggerLevel = setLoggerLevel;
/**
Read a PDF from the given lexing.source.

options.type determines the return value.
- 'pdf': returns the full pdfi.PDF instance.
- 'paper': returns an academia.types.Paper
- 'string': returns a single string, which is like a flattened version of the
  'paper' option, where the section lines have been prefixed with '#',
  paragraphs are joined separated by single line breaks, and sections are
  separated by double line breaks.
- 'metadata': returns the PDF's trailer section
- 'xref': returns the PDF's trailer section
- anything else: returns null
*/
function readSourceSync(source, options) {
    if (options === void 0) { options = { type: 'string' }; }
    var pdf = new PDF_1.PDF(source);
    if (options.type == 'pdf') {
        return pdf;
    }
    if (options.type == 'metadata') {
        return pdf.trailer.toJSON();
    }
    if (options.type == 'xref') {
        return pdf.cross_references;
    }
    // otherwise, we need to extract the paper
    var paper = pdf.renderPaper();
    if (options.type == 'paper') {
        return paper;
    }
    if (options.type == 'string') {
        return paper.sections.map(function (section) {
            return "# " + section.title + "\n" + section.paragraphs.join('\n');
        }).join('\n\n');
    }
    // this maybe should be an error?
    return null;
}
exports.readSourceSync = readSourceSync;
