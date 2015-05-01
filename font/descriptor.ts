/// <reference path="../type_declarations/index.d.ts" />
import * as lexing from 'lexing';
import * as logger from 'loge';

import {glyphlist, Mapping} from '../encoding/index';
import {Model, ContentStream} from '../models';

/**
See PDF32000_2008.pdf:9.8 Font Descriptors
*/
export class FontDescriptor extends Model {
  get CharSet(): string[] {
    var CharSet = this.object['CharSet'];
    return CharSet ? CharSet.slice(1).split('/') : [];
  }

  /**
  From T1_SPEC.pdf:

  > The tokens following /Encoding may be StandardEncoding def, in which case the Adobe Standard Encoding will be assigned to this font program. For special encodings, assignments must be performed as shown in the example in section 2.3, “Explanation of a Typical Font Program,” using the repetitive sequence:
  >     dup index charactername put
  > where index is an integer corresponding to an entry in the Encoding vector, and charactername refers to a PostScript language name token, such as /Alpha or /A, giving the character name assigned to a particular character code. The Adobe Type Manager parser skips to the first dup token after /Encoding to find the first character encoding assignment. This sequence of assignments must be followed by an instance of the token def or readonly; such a token may not occur within the sequence of assignments.
  */
  getMapping(): Mapping {
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

    return new Mapping(mapping);
  }
}
