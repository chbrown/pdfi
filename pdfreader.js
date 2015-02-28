var File = require('./File');
var FileReader = require('./readers/FileReader');
var BufferedFileReader = require('./readers/BufferedFileReader');
var PDFObjectParser = require('./parsers/PDFObjectParser');
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
    Final the offset of the final trailer. Used by readTrailer().
  
    TODO: figure out where the trailer starts more intelligently.
    */
    PDFReader.prototype.findFinalTrailerPosition = function () {
        // the trailer should happen somewhere in the last 256 bytes or so
        var simple_reader = new FileReader(this.file, this.file.size - 256);
        var trailer_index = simple_reader.indexOf('trailer');
        if (trailer_index === null) {
            throw new Error('Could not find "trailer" marker in last 256 bytes of the file');
        }
        return trailer_index;
    };
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
    */
    PDFReader.prototype.readTrailer = function () {
        var trailer_index = this.findFinalTrailerPosition();
        return this.parseObjectAt(trailer_index);
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
        var cross_references = this.parseObjectAt(this.trailer['startxref']);
        if (this.trailer['Prev'] !== undefined) {
            var Prev_cross_references = this.parseObjectAt(this.trailer['Prev']);
            Array.prototype.push.apply(cross_references, Prev_cross_references);
        }
        return cross_references;
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
    Find the CrossReference matching the given IndirectReference, parsing the
    PDF's cross references if needed.
  
    Throws an Error if no match is found.
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
    Resolves a object reference to the original object from the PDF, parsing the
    PDF's cross references if needed.
  
    Throws an Error (from findCrossReference) if there is no CrossReference
    matching the requested IndirectReference.
  
    Also throws an Error if the matched CrossReference points to an IndirectObject
    that doesn't match the originally requested IndirectReference.
    */
    PDFReader.prototype.findObject = function (reference) {
        var cross_reference = this.findCrossReference(reference);
        var object = this.parseObjectAt(cross_reference.offset);
        // object is a pdfdom.IndirectObject, but we already knew the object number
        // and generation number; that's how we found it. We only want the value of
        // the object. But we might as well double check that what we got is what
        // we were looking for:
        if (object.object_number != cross_reference.object_number) {
            throw new Error("PDF cross references are incorrect; the offset\n        " + cross_reference.offset + " does not lead to an object numbered\n        " + cross_reference.object_number + "; instead, the object at that offset is\n        " + object.object_number);
        }
        return object.value;
    };
    /**
    Resolves a potential IndirectReference to the target object.
  
    1. If input is an IndirectReference, uses findObject to resolve it to the
       actual object.
    2. Otherwise, returns the input object.
    */
    PDFReader.prototype.resolveObject = function (input) {
        // logger.info('PDFReader#resolveObject(%j)', input);
        // type-assertion hack, sry. Why do you make it so difficult, TypeScript?
        if (input['object_number'] !== undefined && input['generation_number'] !== undefined) {
            var resolution = this.findObject(input);
            // logger.info('PDFReader#resolveObject => %j', resolution);
            return resolution;
        }
        return input;
    };
    PDFReader.prototype.parseObjectAt = function (position) {
        var reader = new BufferedFileReader(this.file, position);
        var parser = new PDFObjectParser();
        parser.yy.pdf_reader = this;
        return parser.parse(reader);
    };
    return PDFReader;
})();
module.exports = PDFReader;
