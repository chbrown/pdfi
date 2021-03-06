import * as glyphmaps from '../encoding/glyphmaps';
import {Model, ContentStream} from '../models';
import {mergeArray} from '../util';

const encodingNameRegExp = /\/Encoding\s+(StandardEncoding|MacRomanEncoding|WinAnsiEncoding|PDFDocEncoding)/;

/**
Parse a Type1 Font Program and return a glyphmap (mapping from character codes to glyphnames)
*/
function parseEncoding(program: string): string[] {
  const Encoding_start_index = program.indexOf('/Encoding');
  const Encoding_string = program.slice(Encoding_start_index);
  const glyphmap: string[] = [];
  // if the program specifies a base encoding, use it as the base
  const encodingNameMatch = Encoding_string.match(encodingNameRegExp);
  if (encodingNameMatch !== null) {
    const encodingName = encodingNameMatch[1];
    mergeArray(glyphmap, glyphmaps[encodingName] || []);
  }
  const charCodeGlyphRegExp = /dup (\d+) \/(\w+) put/g;
  let match;
  while ((match = charCodeGlyphRegExp.exec(Encoding_string))) {
    const [, charCode, glyphname] = match;
    glyphmap[parseInt(charCode, 10)] = glyphname;
  }
  return glyphmap;
}

/**
See PDF32000_2008.pdf:9.8 Font Descriptors
*/
export class FontDescriptor extends Model {
  get CharSet(): string[] {
    const CharSet = this.get('CharSet');
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
    const Type1FontProgram = new ContentStream(this._pdf, this.object['FontFile']);
    if (Type1FontProgram.object) {
      const Length1 = Type1FontProgram.dictionary.Length1 as number;
      return Type1FontProgram.buffer.toString('ascii', 0, Length1);
    }
  }

  getWeight(): string {
    const Type1FontProgram_string = this.getType1FontProgramClearText();
    if (Type1FontProgram_string) {
      const weightRegExp = /\/Weight\s+\(([^\)]+)\)/;
      const weightMatch = Type1FontProgram_string.match(weightRegExp);
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
  getGlyphmap(): string[] {
    const Type1FontProgram_string = this.getType1FontProgramClearText();
    if (Type1FontProgram_string) {
      return parseEncoding(Type1FontProgram_string);
    }
    return [];
  }
}
