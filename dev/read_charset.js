function parseOctal(str) {
  return (str === '—') ? null : parseInt(str, 8);
}

var chunks = [];
process.stdin.on('readable', function() {
  var chunk = process.stdin.read();
  if (chunk) chunks.push(chunk);
});
process.stdin.on('end', function() {
  var StandardEncoding = [];
  var MacRomanEncoding = [];
  var WinAnsiEncoding = [];
  var PDFDocEncoding = [];
  Buffer.concat(chunks).toString('utf8').split(/\n/).forEach(function(line) {
    var cells = line.split(/\t/); // CHAR GLYPH STD MAC WIN PDF
    if (cells.length !== 6) {
      throw new Error('Incorrect formatting on line: ' + line);
    }
    var glyphname = cells[1];
    var Standard = parseOctal(cells[2]);
    var MacRoman = parseOctal(cells[3]);
    var WinAnsi = parseOctal(cells[4]);
    var PDFDoc = parseOctal(cells[5]);
    if (Standard !== null) {
      StandardEncoding[Standard] = glyphname;
    }
    if (MacRoman !== null) {
      MacRomanEncoding[MacRoman] = glyphname;
    }
    if (WinAnsi !== null) {
      WinAnsiEncoding[WinAnsi] = glyphname;
    }
    if (PDFDoc !== null) {
      PDFDocEncoding[PDFDoc] = glyphname;
    }
  });
  [
    {name: 'StandardEncoding', value: StandardEncoding},
    {name: 'MacRomanEncoding', value: MacRomanEncoding},
    {name: 'WinAnsiEncoding', value: WinAnsiEncoding},
    {name: 'PDFDocEncoding', value: PDFDocEncoding},
  ].forEach(function(character_set) {
    process.stdout.write('export const ' + character_set.name + ' = ');
    process.stdout.write(JSON.stringify(character_set.value).replace(/null/g, ''));
    process.stdout.write(';\n');
  });
});
