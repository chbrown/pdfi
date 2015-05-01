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
  Buffer.concat(chunks).toString('ascii').split(/\r?\n/).filter(function(line) {
    var comment = line[0] === '#';
    var empty = line.trim().length === 0;
    return !comment && !empty;
  }).forEach(function(line) {
    var pair = line.split(';');
    var glyphname = pair[0];
    var alternatives = pair[1].split(',');
    var charCodes = alternatives[0].split(' ').map(function(s) { return parseInt(s, 16); });
    glyphs[glyphname] = String.fromCharCode.apply(null, charCodes);
  });
  process.stdout.write(JSON.stringify(glyphs, null, ' '));
});
