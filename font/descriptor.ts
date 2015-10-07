/// <reference path="../type_declarations/index.d.ts" />
import * as lexing from 'lexing';

import {logger} from '../logger';
import {Encoding, decodeGlyphname} from '../encoding/index';
import {Model, ContentStream} from '../models';

/**
See PDF32000_2008.pdf:9.8 Font Descriptors
*/
export class FontDescriptor extends Model {
  get CharSet(): string[] {
    var CharSet = this.get('CharSet');
    return CharSet ? CharSet.toString().slice(1).split('/') : [];
  }

  /**
  From PDF32000_2008.pdf:Table 122
  > The weight (thickness) component of the fully-qualified font name or font
  > specifier. The possible values shall be 100, 200, 300, 400, 500, 600, 700,
  > 800, or 900, where each number indicates a weight that is at least as dark
  > as its predecessor. A value of:
  > * 400 shall indicate a normal weight;
  > * 700 shall indicate bold.
  > The specific interpretation of these values varies from font to font.
  */
  // get FontWeight(): number {
  //   return this.get('FontWeight');
  // }

  /**
  From PDF32000_2008.pdf:Table 122
  > The angle, expressed in degrees counterclockwise from the vertical, of the
  > dominant vertical strokes of the font. The 9-o'clock position is 90 degrees,
  > and the 3-o'clock position is –90 degrees. The value shall be negative for
  > fonts that slope to the right, as almost all italic fonts do.
  */
  // get ItalicAngle(): number {
  //   return this.get('ItalicAngle');
  // }

  // get MissingWidth(): number {
  //   return this.get('MissingWidth');
  // }

  private getType1FontProgramClearText(): string {
    var Type1FontProgram = new ContentStream(this._pdf, this.object['FontFile']);
    if (Type1FontProgram.object) {
      var Length1 = <number>Type1FontProgram.dictionary['Length1'];
      return Type1FontProgram.buffer.toString('ascii', 0, Length1);
    }
  }

  getWeight(): string {
    var Type1FontProgram_string = this.getType1FontProgramClearText();
    if (Type1FontProgram_string) {
      var weightRegExp = /\/Weight\s+\(([^\)]+)\)/;
      var weightMatch = Type1FontProgram_string.match(weightRegExp);
      if (weightMatch !== null) {
        return weightMatch[1];
      }
    }
  }

  /**
  From T1_SPEC.pdf:

  > The tokens following /Encoding may be StandardEncoding def, in which case the Adobe Standard Encoding will be assigned to this font program. For special encodings, assignments must be performed as shown in the example in section 2.3, “Explanation of a Typical Font Program,” using the repetitive sequence:
  >     dup index charactername put
  > where index is an integer corresponding to an entry in the Encoding vector, and charactername refers to a PostScript language name token, such as /Alpha or /A, giving the character name assigned to a particular character code. The Adobe Type Manager parser skips to the first dup token after /Encoding to find the first character encoding assignment. This sequence of assignments must be followed by an instance of the token def or readonly; such a token may not occur within the sequence of assignments.
  */
  getEncoding(): Encoding {
    var encoding = new Encoding();

    var Type1FontProgram_string = this.getType1FontProgramClearText();
    if (Type1FontProgram_string) {
      var Encoding_start_index = Type1FontProgram_string.indexOf('/Encoding');
      var Encoding_string = Type1FontProgram_string.slice(Encoding_start_index);

      var encodingNameRegExp = /\/Encoding\s+(StandardEncoding|MacRomanEncoding|WinAnsiEncoding|PDFDocEncoding)/;
      var encodingNameMatch = Encoding_string.match(encodingNameRegExp);
      if (encodingNameMatch !== null) {
        var encodingName = encodingNameMatch[1];
        encoding.mergeLatinCharset(encodingName);
      }

      var charRegExp = /dup (\d+) \/(\w+) put/g;
      var match;
      while ((match = charRegExp.exec(Encoding_string))) {
        var index = parseInt(match[1], 10);
        var glyphname = match[2];
        var str = decodeGlyphname(glyphname);
        if (str !== undefined) {
          encoding.mapping[index] = str;
        }
        else {
          logger.warning(`Ignoring FontDescriptor mapping ${index} -> ${glyphname}, which is not a valid glyphname`);
        }
      }
    }

    return encoding;
  }
}
