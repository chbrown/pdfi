/**
Usage: `node read_glyphlist <glyphlist.txt >glyphlist.ts

Where `glyphlist.txt` comes from
http://partners.adobe.com/public/developer/en/opentype/glyphlist.txt or similar,
and has ;-separated lines like:

nine;0039

Where the first value is the glyphname, and the second value is the unicode
character code.
*/
var dev = require('./index');

var chunks = [];
process.stdin.on('readable', function() {
  var chunk = process.stdin.read();
  if (chunk) chunks.push(chunk);
});
process.stdin.on('end', function() {
  var glyphs = {};
  var glyphlist_data = Buffer.concat(chunks).toString('ascii');
  dev.parseGlyphlist(glyphlist_data).map(function(pair) {
    var glyphname = pair[0];
    var alternatives = pair[1].split(',');
    glyphs[glyphname] = dev.parseUnicodeCharCodes(alternatives[0]);
  });
  process.stdout.write('export default ');
  process.stdout.write(JSON.stringify(glyphs, null, ' '));
  process.stdout.write(';\n');
});
