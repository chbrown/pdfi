var fs = require('fs');
var path = require('path');

/**
Usage: `node read_glyphlist <glyphlist.txt >glyphlist.json

Where `glyphlist.txt` comes from http://partners.adobe.com/public/developer/en/opentype/glyphlist.txt
*/

var chunks = [];
process.stdin.on('readable', function() {
  var chunk = process.stdin.read();
  if (chunk) chunks.push(chunk);
});
process.stdin.on('end', function() {
  var glyphs = {};
  Buffer.concat(chunks).toString('ascii').split(/\r\n/).forEach(function(line) {
    if (line[0] !== '#') {
      var pair = line.split(';');
      if (pair[0] !== undefined && pair[1] !== undefined) {
        glyphs[pair[0]] = String.fromCharCode(parseInt(pair[1], 16));
      }
    }
  });
  process.stdout.write(JSON.stringify(glyphs, null, ' '));
});
