/// <reference path="../type_declarations/index.d.ts" />
var PDF = require('../PDF');
var models = require('../models');
var chalk = require('chalk');
chalk.enabled = true; // dumb
var visible = require('visible');
function stderr(line) {
    process.stderr.write(chalk.magenta(line) + '\n');
}
var escaper = new visible.Escaper({});
function enhanceObject(pdf, object) {
    if (models.ContentStream.isContentStream(object)) {
        var content_stream = new models.ContentStream(pdf, object);
        return content_stream.buffer;
    }
    if (models.Type1Font.isType1Font(object)) {
        return new models.Type1Font(pdf, object);
    }
    if (models.Type0Font.isType0Font(object)) {
        return new models.Type0Font(pdf, object);
    }
    if (models.Font.isFont(object)) {
        return new models.Font(pdf, object);
    }
    if (models.Encoding.isEncoding(object)) {
        return new models.Encoding(pdf, object);
    }
    stderr("Could not enhance object");
    return object;
}
function dump(filename, trailer, catalog, info, xref, pages, objects, enhance) {
    if (trailer === void 0) { trailer = true; }
    if (catalog === void 0) { catalog = false; }
    if (info === void 0) { info = false; }
    if (xref === void 0) { xref = false; }
    if (pages === void 0) { pages = false; }
    if (objects === void 0) { objects = []; }
    if (enhance === void 0) { enhance = false; }
    var pdf = PDF.open(filename);
    if (trailer) {
        stderr("[" + filename + "] Trailer");
        process.stdout.write(JSON.stringify(pdf.trailer) + '\n');
    }
    if (catalog) {
        stderr("[" + filename + "] Catalog");
        var Root = escaper.simplify(pdf.trailer.Root);
        process.stdout.write(JSON.stringify(Root) + '\n');
    }
    if (info) {
        stderr("[" + filename + "] Info");
        var Info = escaper.simplify(pdf.trailer.Info);
        process.stdout.write(JSON.stringify(Info) + '\n');
    }
    if (xref) {
        stderr("[" + filename + "] Cross References");
        process.stdout.write(JSON.stringify(pdf.cross_references) + '\n');
    }
    if (pages) {
        // iterate through the page objects
        pdf.pages.forEach(function (page, i, pages) {
            stderr("Page " + i + " of " + pages.length);
            process.stdout.write(page.joinContents('\n'));
        });
    }
    objects.forEach(function (reference) {
        stderr(reference.toString());
        var model = new models.Model(pdf, reference);
        var object = model.object;
        if (enhance) {
            object = enhanceObject(pdf, object);
        }
        process.stdout.write(JSON.stringify(object) + '\n');
    });
}
exports.dump = dump;
function extract(filename, sections) {
    if (sections === void 0) { sections = []; }
    var pdf = PDF.open(filename);
    pdf.pages.forEach(function (page, page_index, pages) {
        stderr("Rendering Page " + page_index + " of " + pages.length);
        var lines = page.getParagraphStrings(sections);
        process.stdout.write(lines.join('\n') + '\n');
    });
}
exports.extract = extract;
