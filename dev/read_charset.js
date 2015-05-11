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
      StandardEncoding: parseOctal(cells[2]),
      MacRomanEncoding: parseOctal(cells[3]),
      WinAnsiEncoding: parseOctal(cells[4]),
      PDFDocEncoding: parseOctal(cells[5]),
    });
  });
  process.stdout.write(JSON.stringify(characters, null, ' '));
});
