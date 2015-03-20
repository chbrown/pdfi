var chalk = require('chalk');
var logger = require('loge');
var lexing = require('lexing');
var File = require('./File');
var models = require('./models');
var PDFObjectParser = require('./parsers/PDFObjectParser');
var util = require('util-enhanced');
/**
The Trailer is not a typical models.Model, because it is not backed by a single
PDFObject, but by a collection of them.
*/
var Trailer = (function () {
    function Trailer(_pdf, _object) {
        if (_object === void 0) { _object = {}; }
        this._pdf = _pdf;
        this._object = _object;
    }
    /**
    The PDF's trailers are read from newer to older. The newer trailers' values
    should be preferred, so we merge the older trailers under the newer ones.
    */
    Trailer.prototype.merge = function (object) {
        this._object = util.extend(object, this._object);
    };
    Object.defineProperty(Trailer.prototype, "Size", {
        get: function () {
            return this._object['Size'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Trailer.prototype, "Root", {
        get: function () {
            return new models.Catalog(this._pdf, this._object['Root']);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Trailer.prototype, "Info", {
        get: function () {
            return new models.Model(this._pdf, this._object['Info']).object;
        },
        enumerable: true,
        configurable: true
    });
    Trailer.prototype.toJSON = function () {
        return {
            Size: this.Size,
            Root: this.Root,
            Info: this.Info,
        };
    };
    return Trailer;
})();
var PDF = (function () {
    function PDF(file) {
        this.file = file;
        this._cross_references = [];
        // _objects is a cache of PDF objects indexed by
        // "${object_number}:${generation_number}" identifiers
        this._objects = {};
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
    /** Since the trailers and cross references overlap so much,
    we might as well read them all at once.
    */
    PDF.prototype.readTrailers = function () {
        // Find the offset of the first item in the xref-trailer chain
        var startxref_position = this.file.lastIndexOf('startxref');
        if (startxref_position === null) {
            throw new Error('Could not find "startxref" marker in file');
        }
        var next_xref_position = this.parseObjectAt(startxref_position, "STARTXREF_ONLY");
        this._trailer = new Trailer(this);
        while (next_xref_position) {
            // XREF_TRAILER_ONLY -> "return {cross_references: $1, trailer: $3, startxref: $5};"
            var xref_trailer = this.parseObjectAt(next_xref_position, "XREF_TRAILER_ONLY");
            // TODO: are there really chains of trailers and multiple `Prev` links?
            next_xref_position = xref_trailer['trailer']['Prev'];
            // merge the cross references
            var cross_references = xref_trailer['cross_references'];
            Array.prototype.push.apply(this._cross_references, cross_references);
            this._trailer.merge(xref_trailer['trailer']);
        }
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
            if (this._trailer === undefined) {
                this.readTrailers();
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
            if (this._cross_references.length == 0) {
                this.readTrailers();
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
    PDF.prototype.findCrossReference = function (object_number, generation_number) {
        for (var i = 0, cross_reference; (cross_reference = this.cross_references[i]); i++) {
            if (cross_reference.in_use && cross_reference.object_number === object_number && cross_reference.generation_number === generation_number) {
                return cross_reference;
            }
        }
        throw new Error("Could not find a cross reference for " + object_number + ":" + generation_number);
    };
    PDF.prototype.getObject = function (object_number, generation_number) {
        var object_id = "" + object_number + ":" + generation_number;
        if (!(object_id in this._objects)) {
            this._objects[object_id] = this._readObject(object_number, generation_number);
        }
        return this._objects[object_id];
    };
    /**
    Resolves a object reference to the original object from the PDF, parsing the
    PDF's cross references if needed.
  
    Throws an Error (from findCrossReference) if there is no CrossReference
    matching the requested IndirectReference.
  
    Also throws an Error if the matched CrossReference points to an IndirectObject
    that doesn't match the originally requested IndirectReference.
    */
    PDF.prototype._readObject = function (object_number, generation_number) {
        var cross_reference = this.findCrossReference(object_number, generation_number);
        var indirect_object = this.parseIndirectObjectAt(cross_reference.offset);
        // indirect_object is a pdfdom.IndirectObject, but we already knew the object number
        // and generation number; that's how we found it. We only want the value of
        // the object. But we might as well double check that what we got is what
        // we were looking for:
        if (indirect_object.object_number != cross_reference.object_number) {
            throw new Error("PDF cross references are incorrect; the offset\n        " + cross_reference.offset + " does not lead to an object numbered\n        " + cross_reference.object_number + "; instead, the object at that offset is\n        " + indirect_object.object_number);
        }
        return indirect_object.value;
    };
    Object.defineProperty(PDF.prototype, "pages", {
        /**
        This resolves the Root Catalog's Pages tree into an Array of all its leaves.
        */
        get: function () {
            return this.trailer.Root.Pages.getLeaves();
        },
        enumerable: true,
        configurable: true
    });
    /**
    Resolves a potential IndirectReference to the target object.
  
    1. If input is an IndirectReference, uses getObject to resolve it to the
       actual object.
    2. Otherwise, returns the input object.
  
    This is useful in the PDFObjectParser stream hack, but shouldn't be used elsewhere.
    */
    PDF.prototype._resolveObject = function (object) {
        // type-assertion hack, sry. Why do you make it so difficult, TypeScript?
        if (models.IndirectReference.isIndirectReference(object)) {
            var reference = object;
            return this.getObject(reference.object_number, reference.generation_number);
        }
        return object;
    };
    PDF.prototype.printContext = function (start_position, error_position, margin) {
        if (margin === void 0) { margin = 256; }
        logger.error("context preface=" + chalk.cyan(start_position) + " error=" + chalk.yellow(error_position) + "...");
        // File#readBuffer(length: number, position: number): Buffer
        var preface_buffer = this.file.readBuffer(error_position - start_position, start_position);
        var preface_string = preface_buffer.toString('ascii').replace(/\r\n?/g, '\r\n');
        var error_buffer = this.file.readBuffer(margin, error_position);
        var error_string = error_buffer.toString('ascii').replace(/\r\n?/g, '\r\n');
        // console.log(chalk.cyan(preface_string) + chalk.yellow(error_string));
        console.log('%s%s', chalk.cyan(preface_string), chalk.yellow(error_string));
    };
    PDF.prototype.parseObjectAt = function (position, start) {
        if (start === void 0) { start = "OBJECT_HACK"; }
        var iterable = new lexing.FileStringIterator(this.file.fd, 'ascii', position);
        var parser = new PDFObjectParser(this, start);
        try {
            return parser.parse(iterable);
        }
        catch (exc) {
            console.log(chalk.red(exc.message));
            this.printContext(position, iterable.position);
            throw exc;
        }
    };
    PDF.prototype.parseIndirectObjectAt = function (position) {
        return this.parseObjectAt(position, "INDIRECT_OBJECT");
    };
    PDF.prototype.parseString = function (input, start) {
        if (start === void 0) { start = "OBJECT_HACK"; }
        var iterable = new lexing.StringIterator(input);
        var parser = new PDFObjectParser(this, start);
        return parser.parse(iterable);
    };
    return PDF;
})();
module.exports = PDF;
