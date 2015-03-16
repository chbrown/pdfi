var fs = require('fs');
var path = require('path');

function parseOctal(str) {
  if (str === '—') {
    return null;
  }
  return parseInt(str, 8);
}

var chunks = [];
process.stdin.on('readable', function() {
  var chunk = process.stdin.read();
  if (chunk) chunks.push(chunk);
});
process.stdin.on('end', function() {
  var characters = [];
  Buffer.concat(chunks).toString('utf8').split(/\n/).forEach(function(line) {
    var cells = line.split(/\t/); // CHAR GLYPH STD MAC WIN PDF
    if (cells.length !== 6) {
      throw new Error('Incorrect formatting on line: ' + line);
    }
    characters.push({
      char: cells[0],
      glyphname: cells[1],
      std: parseOctal(cells[2]),
      mac: parseOctal(cells[3]),
      win: parseOctal(cells[4]),
      pdf: parseOctal(cells[5]),
    });
  });
  process.stdout.write(JSON.stringify(characters, null, ' '));
});
