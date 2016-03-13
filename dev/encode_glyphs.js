var fs = require('fs');
var path = require('path');

var dev = require('./index');

var glyphlist_data = fs.readFileSync(path.join(__dirname, '..', 'encoding', 'glyphlist.txt'));
// glyphlist is a list of [glyphname: string, alternatives: string]-tuples
var glyphlist = dev.parseGlyphlist(glyphlist_data.toString('ascii'));
// glyphs is a mapping from glyphnames to alternatives
var glyphs = new Map(glyphlist);

var chunks = [];
process.stdin.on('readable', function() {
  var chunk = process.stdin.read();
  if (chunk) chunks.push(chunk);
});
process.stdin.on('end', function() {
  // process.stdout.write('read' + JSON.stringify(Buffer.concat(chunks).toJSON()) + 'EOF');
  Buffer.concat(chunks).toString('ascii').split(/\n/).forEach(function(glyphname) {
    var replacement = glyphs.get(glyphname) || '';
    process.stdout.write(replacement + '\n');
  });
});
