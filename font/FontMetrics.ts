/// <reference path="../type_declarations/index.d.ts" />
import fs = require('fs');
import path = require('path');

/**
See PDF32000_2008.pdf:9.6.2.2

In alphabetical order.
*/
var Core14 = [
  'Courier',
  'Courier-Bold',
  'Courier-BoldOblique',
  'Courier-Oblique',
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-BoldOblique',
  'Helvetica-Oblique',
  'Symbol',
  'Times-Bold',
  'Times-BoldItalic',
  'Times-Italic',
  'Times-Roman',
  'ZapfDingbats',
];

/**
> `C integer`: Decimal value of default character code (−1 if not encoded).
> `CH` hex`: Same as C, but the character code is given in hexadecimal.
               Either C or CH is required
> `WX number`: Width of character.
> `N name`: (Optional.) PostScript language character name.
*/
class CharMetrics {
  constructor(public charCode: number, public width: number, public name: string) { }
  static parse(line: string): CharMetrics {
    var charCode_match = line.match(/C\s+(\d+|-1)/);
    var width_match = line.match(/WX\s+(\d+)/);
    var name_match = line.match(/N\s+(\w+)/);
    var charCode = charCode_match ? parseInt(charCode_match[1], 10) : null;
    var width = width_match ? parseInt(width_match[1], 10) : null;
    var name = name_match ? name_match[1] : null;
    return new CharMetrics(charCode, width, name);
  }
}

/**
Partial representation of an AFM (Adobe Font Metrics) file.
*/
class FontMetrics {
  constructor(public characters: CharMetrics[]) { }
  static readFile(filename: string): FontMetrics {
    var afm_data = fs.readFileSync(filename, {encoding: 'ascii'});
    return FontMetrics.read(afm_data);
  }
  static read(afm_data: string): FontMetrics {
    var start_match = afm_data.match(/^StartCharMetrics\s+(\d+)/m);
    var end_match = afm_data.match(/^EndCharMetrics/m);

    var char_metrics_data = afm_data.slice(start_match.index + start_match[0].length, end_match.index);
    var char_metrics_lines = char_metrics_data.trim().split(/\r\n|\r|\n|\t/);

    var characters = char_metrics_lines.map(CharMetrics.parse)
    return new FontMetrics(characters);
  }
  static loadCore14(name: string): FontMetrics {
    if (!FontMetrics.isCore14(name)) {
      throw new Error(`"${name}" is not a Core14 font`);
    }
    var filename = path.join(__dirname, 'Core14', name + '.afm');
    return FontMetrics.readFile(filename);
  }
  static isCore14(name: string): boolean {
    return Core14.indexOf(name) > -1;
  }
}

export = FontMetrics;
