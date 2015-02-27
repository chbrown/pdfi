var File = require('./File');
var FileReader = require('./readers/FileReader');
var BufferedFileReader = require('./readers/BufferedFileReader');
var pdfobject_parser = require('./parsers/pdfobject');
var PDFReader = (function () {
    function PDFReader(file) {
        this.file = file;
    }
    PDFReader.open = function (filepath) {
        return new PDFReader(File.open(filepath));
    };
    Object.defineProperty(PDFReader.prototype, "size", {
        get: function () {
            return this.file.size;
        },
        enumerable: true,
        configurable: true
    });
    /**
    read the trailer, which gives the location of the cross-reference table and of certain special objects within the body of the file (PDF32000_2008.pdf:7.5.1). For example:
  
        trailer
        << /Info 2 0 R /Root 1 0 R /Size 105 >>
        startxref
        123456
        %%EOF
  
    The trailer dictionary will generally have two important fields: "Root" and
    "Info", both of which are object references. Size is the number of objects in
    the document (or maybe just those in the cross references section that
    immediately follows the trailer?)
  
    TODO: figure out where the trailer starts more intelligently
    */
    PDFReader.prototype.readTrailer = function () {
        // the trailer should happen somewhere in the last 256 bytes or so
        var simple_reader = new FileReader(this.file, this.file.size - 256);
        var trailer_index = simple_reader.indexOf('trailer');
        if (trailer_index === null) {
            throw new Error('Could not find "trailer" marker in last 256 bytes of the file');
        }
        var reader = new BufferedFileReader(this.file, trailer_index);
        return pdfobject_parser.parse(reader);
    };
    Object.defineProperty(PDFReader.prototype, "trailer", {
        get: function () {
            if (!this._trailer) {
                this._trailer = this.readTrailer();
            }
            return this._trailer;
        },
        enumerable: true,
        configurable: true
    });
    /**
    Reads the xref section referenced from the trailer.
    */
    PDFReader.prototype.readCrossReferences = function () {
        // requires reading the trailer, if it hasn't already been read.
        var reader = new BufferedFileReader(this.file, this.trailer['startxref']);
        return pdfobject_parser.parse(reader);
    };
    Object.defineProperty(PDFReader.prototype, "cross_references", {
        get: function () {
            if (!this._cross_references) {
                this._cross_references = this.readCrossReferences();
            }
            return this._cross_references;
        },
        enumerable: true,
        configurable: true
    });
    /**
    Helper for finding a CrossReference in a list of cross references,
    given an IndirectReference, throwing an error if no match is found.
    */
    PDFReader.prototype.findCrossReference = function (reference) {
        for (var i = 0, cross_reference; (cross_reference = this.cross_references[i]); i++) {
            if (cross_reference.in_use && cross_reference.object_number === reference.object_number && cross_reference.generation_number === reference.generation_number) {
                return cross_reference;
            }
        }
        throw new Error("Could not find a cross reference for " + reference.object_number + ":" + reference.generation_number);
    };
    /**
    Read a specific object from a PDF, given a desired reference and list of cross
    references.
    */
    PDFReader.prototype.findObject = function (reference) {
        var cross_reference = this.findCrossReference(reference);
        // TODO: only match endobj at the beginning of lines
        // var object_content = reader.readRangeUntilString(cross_reference.offset, 'endobj');
        // var object_string = object_content.buffer.toString('ascii');
        var reader = new BufferedFileReader(this.file, cross_reference.offset);
        var object = pdfobject_parser.parse(reader);
        // object is a pdfdom.IndirectObject, but we already knew the object number
        // and generation number; that's how we found it. We only want the value of
        // the object. But we might as well double check that what we got is what
        // we were looking for:
        if (object.object_number != cross_reference.object_number) {
            throw new Error("PDF cross references are incorrect; the offset\n        " + cross_reference.offset + " does not lead to an object numbered\n        " + cross_reference.object_number + "; instead, the object at that offset is\n        " + object.object_number);
        }
        return object.value;
    };
    return PDFReader;
})();
module.exports = PDFReader;
