var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var index_1 = require('../encoding/index');
var models_1 = require('../models');
/**
See PDF32000_2008.pdf:9.8 Font Descriptors
*/
var FontDescriptor = (function (_super) {
    __extends(FontDescriptor, _super);
    function FontDescriptor() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(FontDescriptor.prototype, "CharSet", {
        get: function () {
            var CharSet = this.object['CharSet'];
            return CharSet ? CharSet.slice(1).split('/') : [];
        },
        enumerable: true,
        configurable: true
    });
    /**
    From T1_SPEC.pdf:
  
    > The tokens following /Encoding may be StandardEncoding def, in which case the Adobe Standard Encoding will be assigned to this font program. For special encodings, assignments must be performed as shown in the example in section 2.3, “Explanation of a Typical Font Program,” using the repetitive sequence:
    >     dup index charactername put
    > where index is an integer corresponding to an entry in the Encoding vector, and charactername refers to a PostScript language name token, such as /Alpha or /A, giving the character name assigned to a particular character code. The Adobe Type Manager parser skips to the first dup token after /Encoding to find the first character encoding assignment. This sequence of assignments must be followed by an instance of the token def or readonly; such a token may not occur within the sequence of assignments.
    */
    FontDescriptor.prototype.getMapping = function () {
        var FontFile = new models_1.ContentStream(this._pdf, this.object['FontFile']);
        var cleartext_length = FontFile.dictionary['Length1'];
        // var string_iterable = lexing.StringIterator.fromBuffer(FontFile.buffer, 'ascii');
        var FontFile_string = FontFile.buffer.toString('ascii', 0, cleartext_length);
        var start_index = FontFile_string.indexOf('/Encoding');
        var Encoding_string = FontFile_string.slice(start_index);
        var mapping = [];
        var charRegExp = /dup (\d+) \/(\w+) put/g;
        var match;
        while ((match = charRegExp.exec(Encoding_string))) {
            var index = parseInt(match[1], 10);
            var glyphname = match[2];
            mapping[index] = index_1.glyphlist[glyphname];
        }
        return new index_1.Mapping(mapping);
    };
    return FontDescriptor;
})(models_1.Model);
exports.FontDescriptor = FontDescriptor;
