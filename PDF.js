var chalk = require('chalk');
var logger = require('loge');
var File = require('./File');
var FileReader = require('./readers/FileReader');
var BufferedFileReader = require('./readers/BufferedFileReader');
var BufferedStringReader = require('./readers/BufferedStringReader');
var PDFObjectParser = require('./parsers/PDFObjectParser');
var PDF = (function () {
    function PDF(file) {
        this.file = file;
    }
    PDF.open = function (filepath) {
        return new PDF(File.open(filepath));
    };
    Object.defineProperty(PDF.prototype, "size", {
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
    PDF.prototype.findFinalTrailerPosition = function () {
        // the trailer should happen somewhere in the last 256 bytes or so
        var simple_reader = new FileReader(this.file, this.file.size - 256);
        var trailer_index = simple_reader.indexOf('trailer');
        if (trailer_index === null) {
            throw new Error('Could not find "trailer" marker in last 256 bytes of the file');
        }
        return trailer_index;
    };
    Object.defineProperty(PDF.prototype, "trailer", {
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
        get: function () {
            if (!this._trailer) {
                var trailer_index = this.findFinalTrailerPosition();
                this._trailer = this.parseObjectAt(trailer_index);
            }
            return this._trailer;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PDF.prototype, "cross_references", {
        /**
        Reads the xref section referenced from the trailer.
      
        Requires reading the trailer, if it hasn't already been read.
        */
        get: function () {
            if (!this._cross_references) {
                this._cross_references = this.parseObjectAt(this.trailer['startxref']);
                // TODO: can there be a chain of trailers and Prev's?
                if (this.trailer['Prev'] !== undefined) {
                    var cross_references = this.parseObjectAt(this.trailer['Prev']);
                    Array.prototype.push.apply(this._cross_references, cross_references);
                }
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
    PDF.prototype.findCrossReference = function (reference) {
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
    PDF.prototype.findObject = function (reference) {
        var cross_reference = this.findCrossReference(reference);
        // logger.info(chalk.green(`findObject(${reference.object_number}:${reference.generation_number}): offset=${cross_reference.offset}`));
        var object = this.parseObjectAt(cross_reference.offset, "INDIRECT_OBJECT");
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
    PDF.prototype.resolveObject = function (input) {
        // logger.info('PDFReader#resolveObject(%j)', input);
        // type-assertion hack, sry. Why do you make it so difficult, TypeScript?
        if (input['object_number'] !== undefined && input['generation_number'] !== undefined) {
            var resolution = this.findObject(input);
            // logger.info('PDFReader#resolveObject => %j', resolution);
            return resolution;
        }
        return input;
    };
    /**
    "Pages"-type objects have a field, Kids: IndirectReference[].
    Each indirect reference will resolve to a Page or Pages object.
  
    This function will flatten the page list breadth-first, returning
    */
    PDF.prototype.flattenPages = function (Pages) {
        var _this = this;
        var PageGroups = Pages.Kids.map(function (KidReference) {
            var Kid = _this.resolveObject(KidReference);
            if (Kid['Type'] == 'Pages') {
                return _this.flattenPages(Kid);
            }
            else if (Kid['Type'] == 'Page') {
                return [Kid];
            }
            else {
                throw new Error('Unknown Kid type: ' + Kid['Type']);
            }
        });
        return Array.prototype.concat.apply([], PageGroups);
    };
    Object.defineProperty(PDF.prototype, "catalog", {
        get: function () {
            return this.resolveObject(this.trailer['Root']);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PDF.prototype, "pages", {
        get: function () {
            var Pages = this.resolveObject(this.catalog.Pages);
            return this.flattenPages(Pages);
        },
        enumerable: true,
        configurable: true
    });
    PDF.prototype.printContext = function (start_position, error_position, margin) {
        if (margin === void 0) { margin = 256; }
        logger.error('Context (%d:%d:%d)', start_position, error_position, error_position + margin);
        // File#readBuffer(length: number, position: number): Buffer
        var preface_buffer = this.file.readBuffer(error_position - start_position, start_position);
        var preface_string = preface_buffer.toString('ascii');
        var error_buffer = this.file.readBuffer(margin, error_position);
        var error_string = error_buffer.toString('ascii');
        logger.error('%s%s', chalk.yellow(preface_string), chalk.red(error_string));
    };
    PDF.prototype.parseObjectAt = function (position, start) {
        if (start === void 0) { start = "OBJECT_HACK"; }
        var reader = new BufferedFileReader(this.file, position);
        var parser = new PDFObjectParser(this, start);
        try {
            return parser.parse(reader);
        }
        catch (exc) {
            logger.error('%s', chalk.red(exc.message));
            this.printContext(position, reader.position);
            throw exc;
        }
    };
    PDF.prototype.parseString = function (input) {
        var reader = new BufferedStringReader(input);
        var parser = new PDFObjectParser(this, "OBJECT_HACK");
        return parser.parse(reader);
    };
    return PDF;
})();
module.exports = PDF;
