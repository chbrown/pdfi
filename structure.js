var File = require('./File');
var FileReader = require('./readers/FileReader');
var BufferedFileReader = require('./readers/BufferedFileReader');
var term = require('./dev/term');
var pdfobject_parser = require('./parsers/pdfobject');
var xref_parser = require('./parsers/xref');
/** parseStartXref(buffer)
 *
 * Read a snippet like
 *
 *    startxref
 *    123456
 *    %%EOF
 *
 * And return the index specified, e.g., 123456.
 */
function parseStartXref(buffer) {
    // \s+ matches newlines
    var xref_offset_match = buffer.toString('utf8').match(/startxref\s+(\d+)/);
    if (xref_offset_match == null)
        throw new Error('Could not find final startxref');
    return parseInt(xref_offset_match[1], 10);
}
/** findCrossReference()

Helper function for finding a CrossReference in a list of cross references,
given an IndirectReference, throwing an error if no match is found.
*/
function findCrossReference(reference, cross_references) {
    for (var i = 0, cross_reference; (cross_reference = cross_references[i]); i++) {
        // for (var cross_reference in cross_references) {
        if (cross_reference.in_use && cross_reference.object_number === reference.object_number && cross_reference.generation_number === reference.generation_number) {
            return cross_reference;
        }
    }
    throw new Error("Could not find a cross reference for\n    " + reference.object_number + ":" + reference.generation_number);
}
/**
Reads the final xref and trailer from the opened PDF file, returning a
minimal pdfdom.PDF structure (just trailer and cross_references)

The trailer will generally have two important fields: "Root" and "Info",
both of which are object references.
*/
function readMetadata(reader) {
    // 1. find the final "startxref <offset> %%EOF", which should happen in the last 64 bytes
    var footer = reader.readRangeUntilString(reader.size - 64, '%%EOF');
    if (footer == null)
        throw new Error('Could not find final %%EOF');
    var xref_offset = parseStartXref(footer.buffer);
    // 2. seek to that xref and read until the trailer
    var xref_content = reader.readRangeUntilString(xref_offset, 'trailer');
    var xref_string = xref_content.buffer.toString('ascii');
    // term.print('xref_string: %j', xref_string);
    var cross_references = xref_parser.parse(xref_string);
    // 3. read the trailer
    var trailer_content = reader.readRangeUntilString(xref_content.end, 'startxref');
    // skip over the "trailer" marker
    var trailer_string = trailer_content.buffer.slice(7).toString('ascii').trim();
    // term.print('trailer_string: %j', trailer_string);
    var trailer_object = pdfobject_parser.parseString(trailer_string);
    // term.print('trailer_object: %j', trailer_object);
    var trailer = trailer_object;
    //var next_xref = indexed_file.readRangeUntil(trailer_content.end, '%%EOF');
    // next_xref is just the XREF from the first lookup
    return {
        cross_references: cross_references,
        trailer: trailer,
    };
}
/**
Read a specific object from a PDF, given a desired reference and list of cross
references.
*/
function findObject(file, reference, cross_references) {
    var cross_reference = findCrossReference(reference, cross_references);
    // TODO: only match endobj at the beginning of lines
    // var object_content = reader.readRangeUntilString(cross_reference.offset, 'endobj');
    // var object_string = object_content.buffer.toString('ascii');
    var reader = new BufferedFileReader(file, cross_reference.offset);
    var object = pdfobject_parser.parse(reader);
    // object is a pdfdom.IndirectObject, but we already knew the object number
    // and generation number; that's how we found it. We only want the value of
    // the object. But we might as well double check that what we got is what
    // we were looking for:
    if (object.object_number != cross_reference.object_number) {
        throw new Error("PDF cross references are incorrect; the offset\n      " + cross_reference.offset + " does not lead to an object numbered\n      " + cross_reference.object_number + "; instead, the object at that offset is\n      " + object.object_number);
    }
    return object.value;
}
function open(filepath) {
    var file = File.open(filepath);
    var reader = new FileReader(file);
    var pdf = readMetadata(reader);
    term.print('cross_references', term.inspect(pdf.cross_references));
    term.print('trailer', pdf.trailer);
    var Info = findObject(file, pdf.trailer['Info'], pdf.cross_references);
    term.print('trailer->Info', Info);
    var Root = findObject(file, pdf.trailer['Root'], pdf.cross_references);
    term.print('trailer->Root', Root);
    var Pages = findObject(file, Root['Pages'], pdf.cross_references);
    term.print('trailer->Root->Pages', Pages);
    var pages = Pages['Kids'];
    term.print('Found %d pages', pages.length);
    // iterate through the page objects
    var page_objects = [];
    for (var i = 0, page; (page = pages[i]); i++) {
        var page_object = findObject(file, page, pdf.cross_references);
        page_objects.push(page_object);
        term.print('Page %d', i, page_object);
    }
    for (var i = 0, page_object; (page_object = page_objects[i]); i++) {
        // page_object.Contents is a list of IndirectReference instances, or maybe just one
        var page_contents = Array.isArray(page_object['Contents']) ? page_object['Contents'] : [page_object['Contents']];
        for (var j = 0, page_content; (page_content = page_contents[j]); j++) {
            var content_object = findObject(file, page_content, pdf.cross_references);
            term.print('Page %d:%d', i, j, content_object);
        }
    }
}
exports.open = open;
