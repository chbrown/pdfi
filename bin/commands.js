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
function dump(filename, trailer, catalog, info, xref, pages, object, stream) {
    if (trailer === void 0) { trailer = true; }
    if (catalog === void 0) { catalog = false; }
    if (info === void 0) { info = false; }
    if (xref === void 0) { xref = false; }
    if (pages === void 0) { pages = false; }
    if (object === void 0) { object = []; }
    if (stream === void 0) { stream = []; }
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
    var eachObject = function (reference_arguments, func) {
        reference_arguments.forEach(function (reference_argument) {
            var object_parts = reference_argument.toString().split(':');
            var object_number = parseInt(object_parts[0], 10);
            var generation_number = parseInt(object_parts[1] || '0', 10);
            var object = pdf.getObject(object_number, generation_number);
            func(object_number, generation_number, object);
        });
    };
    if (pages) {
        // iterate through the page objects
        pdf.pages.forEach(function (page, i, pages) {
            stderr("Page " + i + " of " + pages.length);
            process.stdout.write(page.joinContents('\n'));
        });
    }
    if (object) {
        eachObject(object, function (object_number, generation_number, object) {
            stderr("" + object_number + ":" + generation_number);
            process.stdout.write(JSON.stringify(object) + '\n');
        });
    }
    if (stream) {
        eachObject(stream, function (object_number, generation_number, object) {
            var content_stream = new models.ContentStream(pdf, object);
            stderr("" + object_number + ":" + generation_number);
            process.stdout.write(content_stream.buffer);
        });
    }
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
