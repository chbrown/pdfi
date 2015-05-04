/// <reference path="../type_declarations/index.d.ts" />
var yargs = require('yargs');
var logger = require('loge');
var chalk = require('chalk');
var PDF = require('../PDF');
var models_1 = require('../models');
// import visible = require('visible');
// var escaper = new visible.Escaper({/* literalEOL: false */});
var argvparser = yargs
    .usage('Usage: pdfi -f <filename> <command>')
    .command('text', 'Extract text')
    .command('metadata', 'Print trailer as JSON')
    .command('xref', 'Print cross references as JSON')
    .command('pages', 'Print content for all pages')
    .command('objects', 'Dump specific objects; `pdfi -f Sci.pdf objects 1 14:0 106` prints objects "1:0", "14:0", and "106:0"')
    .describe({
    filename: 'pdf file to open',
    // 'object' options
    decode: 'decode content streams',
    // cli meta
    help: 'print this help message',
    verbose: 'print extra output',
})
    .alias({
    filename: 'f',
    help: 'h',
    verbose: 'v',
})
    .demand(['filename'])
    .string('_')
    .boolean(['help', 'verbose', 'decode']);
var argv = argvparser.argv;
logger.level = argv.verbose ? 'debug' : 'info';
if (argv.verbose) {
    chalk.enabled = true; // dumb
}
function stderr(line) {
    process.stderr.write(chalk.magenta(line) + '\n');
}
function stdout(line) {
    process.stdout.write(line + '\n');
}
if (argv.help) {
    yargs.showHelp();
}
else if (argv.version) {
    console.log(require('../package').version);
}
else {
    var pdf = PDF.open(argv.filename);
    var command = argv._[0];
    if (command === 'text') {
        text(pdf);
    }
    else if (command === 'metadata') {
        stdout(JSON.stringify(pdf.trailer));
    }
    else if (command === 'xref') {
        stdout(JSON.stringify(pdf.cross_references));
    }
    else if (command === 'pages') {
        pdf.pages.forEach(function (page, i, pages) {
            stderr("Page " + i + " of " + pages.length);
            stdout(page.joinContents(' '));
        });
    }
    else if (command === 'objects') {
        var references = argv._.slice(1).map(models_1.IndirectReference.fromString);
        objects(pdf, references, argv.decode);
    }
    else {
        yargs.showHelp();
        stderr("Unrecognized command: \"" + command + "\"");
        process.exit(1);
    }
}
function objects(pdf, references, decode) {
    if (decode === void 0) { decode = false; }
    references.forEach(function (reference) {
        stderr(reference.toString());
        var object = new models_1.Model(pdf, reference).object;
        if (decode) {
            if (models_1.ContentStream.isContentStream(object)) {
                // the buffer getter handles all the decoding
                object = new models_1.ContentStream(pdf, object).buffer;
            }
        }
        process.stdout.write(JSON.stringify(object) + '\n');
    });
}
function text(pdf) {
    var document = pdf.getDocument(2);
    document.sections.forEach(function (section) {
        stdout("#" + section.header);
        section.content.forEach(function (paragraph) {
            stdout("    " + paragraph);
            paragraph.toString();
        });
    });
}
