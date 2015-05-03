/// <reference path="../type_declarations/index.d.ts" />
import * as lexing from 'lexing';
import * as logger from 'loge';

import {glyphlist, Encoding} from '../encoding/index';
import {Model, ContentStream} from '../models';

/**
See PDF32000_2008.pdf:9.8 Font Descriptors
*/
export class FontDescriptor extends Model {
  get CharSet(): string[] {
    var CharSet = this.object['CharSet'];
    return CharSet ? CharSet.slice(1).split('/') : [];
  }

  get FontName(): string {
    return this.object['FontName'];
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
  get FontWeight(): number {
    return this.object['FontWeight'];
  }

  /**
  From PDF32000_2008.pdf:Table 122
  > The angle, expressed in degrees counterclockwise from the vertical, of the
  > dominant vertical strokes of the font. The 9-o'clock position is 90 degrees,
  > and the 3-o'clock position is –90 degrees. The value shall be negative for
  > fonts that slope to the right, as almost all italic fonts do.
  */
  get ItalicAngle(): number {
    return this.object['ItalicAngle'];
  }

  get MissingWidth(): number {
    return this.object['MissingWidth'];
  }

  /**
  From T1_SPEC.pdf:

  > The tokens following /Encoding may be StandardEncoding def, in which case the Adobe Standard Encoding will be assigned to this font program. For special encodings, assignments must be performed as shown in the example in section 2.3, “Explanation of a Typical Font Program,” using the repetitive sequence:
  >     dup index charactername put
  > where index is an integer corresponding to an entry in the Encoding vector, and charactername refers to a PostScript language name token, such as /Alpha or /A, giving the character name assigned to a particular character code. The Adobe Type Manager parser skips to the first dup token after /Encoding to find the first character encoding assignment. This sequence of assignments must be followed by an instance of the token def or readonly; such a token may not occur within the sequence of assignments.
  */
  getEncoding(): Encoding {
    var FontFile = new ContentStream(this._pdf, this.object['FontFile']);
    var cleartext_length = <number>FontFile.dictionary['Length1'];
    // var string_iterable = lexing.StringIterator.fromBuffer(FontFile.buffer, 'ascii');
    var FontFile_string = FontFile.buffer.toString('ascii', 0, cleartext_length);
    var start_index = FontFile_string.indexOf('/Encoding');
    var Encoding_string = FontFile_string.slice(start_index);

    var mapping: string[] = [];

    var charRegExp = /dup (\d+) \/(\w+) put/g;
    var match;
    while ((match = charRegExp.exec(Encoding_string))) {
      var index = parseInt(match[1], 10);
      var glyphname = match[2];
      mapping[index] = glyphlist[glyphname];
    }

    return new Encoding(mapping);
  }
}
