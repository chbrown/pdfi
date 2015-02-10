#!/usr/bin/env node
var fs = require('fs');
var logger = require('loge');
var run = require('../dev/run');
var structure = require('../structure');

var yargs = require('yargs')
  .usage([
    'Usage: $0 -f ',
  ].join('\n'))
  .describe({
    filename: 'pdf file to open',
    help: 'print this help message',
    verbose: 'print extra output',
  })
  .alias({
    verbose: 'v',
    filename: 'f',
  })
  .demand(['filename'])
  .boolean(['help', 'verbose'])
  .default({
    filename: 'examples/church-qpdf.uncompressed.pdf'
  });

var argv = yargs.argv;
logger.level = argv.verbose ? 'debug' : 'info';

if (require.main == module) run(function(callback) {
  structure.open(argv.filename);
  callback();
});
