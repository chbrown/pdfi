/** parseEntry()

input should look like the following examples:

* '0000000000 65535 f \n'
* '0000000096 00000 n\r\n'

*/
function parseEntry(reader, object_number) {
    var match = reader.consumeMatch(/(\d{10}) (\d{5}) ([fn])(?: \r| \n|\r\n)/g);
    if (match === null) {
        throw new Error('xref entry cannot be parsed from input');
    }
    return {
        object_number: object_number,
        offset: parseInt(match[1], 10),
        generation_number: parseInt(match[2], 10),
        in_use: match[3] === 'n',
    };
}
/** parseSubsection()

input should look like the following:

    0 3
    0000000197 00000 n
    0000000556 00000 n
    0001000023 00000 n

*/
function parseSubsection(reader) {
    var header_match = reader.consumeMatch(/(\d+) (\d+)(?:\r\n|\n|\r)/g);
    if (header_match === null) {
        return [];
    }
    var object_number_start = parseInt(header_match[1], 10);
    var object_count = parseInt(header_match[2], 10);
    var cross_references = [];
    for (var object_offset = 0; object_offset < object_count; object_offset++) {
        var cross_reference = parseEntry(reader, object_number_start + object_offset);
        cross_references.push(cross_reference);
    }
    return cross_references;
}
var StringReader = (function () {
    function StringReader(string, position) {
        if (position === void 0) { position = 0; }
        this.string = string;
        this.position = position;
    }
    StringReader.prototype.consumeLine = function () {
        var match = this.consumeMatch(/(.+)(?:\r\n|\n|\r)/g);
        if (match === null)
            return null;
        return match[1];
    };
    StringReader.prototype.consumeMatch = function (regex) {
        regex.lastIndex = this.position;
        var result = regex.exec(this.string);
        if (result === null) {
            return null;
        }
        // only allow matching at the beginning of the string, enforced by checking
        // after the fact, since RegExp#sticky is not yet universally supported.
        if (result.index !== this.position) {
            return null;
        }
        this.position = regex.lastIndex;
        return result;
    };
    return StringReader;
})();
/**

A PDF's cross references (xref) section is easy enough to parse by hand.

    xref
    0 4
    0000000000 65535 f
    0000000015 00000 n
    0000000096 00000 n
    0000000304 00000 n
    100 1
    0000000304 00000 n

*/
function parse(input) {
    // var input = new tokenize.TokenizedBuffer(buffer);
    // advance over the "xref"
    var reader = new StringReader(input);
    var xref_line = reader.consumeLine();
    if (xref_line != 'xref') {
        throw new Error('xref section did not start with "xref" string');
    }
    var cross_references = [];
    while (1) {
        var subsection_cross_references = parseSubsection(reader);
        if (subsection_cross_references.length > 0) {
            Array.prototype.push.apply(cross_references, subsection_cross_references);
        }
        else {
            break;
        }
    }
    return cross_references;
}
exports.parse = parse;
