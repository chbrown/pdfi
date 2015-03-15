var chalk = require('chalk');
var logger = require('loge');
var lexing = require('lexing');
var File = require('./File');
var decoders = require('./filters/decoders');
var PDFObjectParser = require('./parsers/PDFObjectParser');
var graphics = require('./parsers/graphics');
var util = require('util-enhanced');
var PDF = (function () {
    function PDF(file) {
        this.file = file;
        this._cross_references = [];
        this._pages = [];
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
    /** Since the trailers and crossreferences overlap so much,
    we might as well read them all at once.
    */
    PDF.prototype.readTrailers = function () {
        // Find the offset of the first item in the xref-trailer chain
        var startxref_position = this.file.lastIndexOf('startxref');
        if (startxref_position === null) {
            throw new Error('Could not find "startxref" marker in file');
        }
        var next_xref_position = this.parseObjectAt(startxref_position, "STARTXREF_ONLY");
        while (next_xref_position) {
            // XREF_TRAILER_ONLY -> "return {cross_references: $1, trailer: $3, startxref: $5};"
            var xref_trailer = this.parseObjectAt(next_xref_position, "XREF_TRAILER_ONLY");
            // TODO: are there really chains of trailers and multiple `Prev` links?
            next_xref_position = xref_trailer['trailer']['Prev'];
            // merge the cross references
            var cross_references = xref_trailer['cross_references'];
            Array.prototype.push.apply(this._cross_references, cross_references);
            // merge the trailer (but the later trailer's values should be preferred)
            this._trailer = util.extend(xref_trailer['trailer'], this._trailer);
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
        var indirect_object = this.parseObjectAt(cross_reference.offset, "INDIRECT_OBJECT");
        // indirect_object is a pdfdom.IndirectObject, but we already knew the object number
        // and generation number; that's how we found it. We only want the value of
        // the object. But we might as well double check that what we got is what
        // we were looking for:
        if (indirect_object.object_number != cross_reference.object_number) {
            throw new Error("PDF cross references are incorrect; the offset\n        " + cross_reference.offset + " does not lead to an object numbered\n        " + cross_reference.object_number + "; instead, the object at that offset is\n        " + indirect_object.object_number);
        }
        var object = indirect_object.value;
        // if it looks like a stream, and it has a Filter field, decode it
        if (object['dictionary'] && object['dictionary']['Filter'] && object['buffer']) {
            object = decodeStream(object);
        }
        return object;
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
        if (input !== undefined && input['object_number'] !== undefined && input['generation_number'] !== undefined) {
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
                throw new Error("Unknown Kid type: " + Kid['Type']);
            }
        });
        // flatten pdfdom.Page[][] into pdfdom.Page[]
        return Array.prototype.concat.apply([], PageGroups);
    };
    Object.defineProperty(PDF.prototype, "catalog", {
        get: function () {
            if (this._catalog === undefined) {
                this._catalog = this.resolveObject(this.trailer['Root']);
            }
            return this._catalog;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PDF.prototype, "pages", {
        /**
        This returns basic pdfdom.PDFObjects -- not the enhanced PDFPage instance.
        */
        get: function () {
            if (this._pages.length == 0) {
                var Pages = this.resolveObject(this.catalog.Pages);
                this._pages = this.flattenPages(Pages);
            }
            return this._pages;
        },
        enumerable: true,
        configurable: true
    });
    PDF.prototype.getPage = function (index) {
        var page = this.pages[index];
        return new PDFPage(this, page);
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
    PDF.prototype.parseString = function (input, start) {
        if (start === void 0) { start = "OBJECT_HACK"; }
        var iterable = new lexing.StringIterator(input);
        var parser = new PDFObjectParser(this, start);
        return parser.parse(iterable);
    };
    return PDF;
})();
function mergeStreams(streams) {
    var buffers = streams.map(function (stream) { return stream.buffer; });
    var dictionary = streams.map(function (stream) { return stream.dictionary; }).reduce(function (dictionary1, dictionary2) {
        return util.extend({}, dictionary1, dictionary2, { Length: dictionary1.Length + dictionary2.Length });
    });
    return {
        dictionary: dictionary,
        buffer: Buffer.concat(buffers),
    };
}
function decodeStream(stream) {
    var buffer = stream.buffer;
    var filters = [].concat(stream.dictionary.Filter);
    filters.forEach(function (filter) {
        var decoder = decoders[filter];
        if (decoder) {
            try {
                buffer = decoder(buffer);
            }
            catch (exc) {
                var dictionary_string = util.inspect(stream.dictionary);
                throw new Error("Could not decode stream " + dictionary_string + " (" + stream.buffer.length + " bytes): " + exc.stack);
            }
        }
        else {
            throw new Error("Could not find decoder named \"" + filter + "\" to decode stream");
        }
    });
    // TODO: delete the dictionary['Filter'] field?
    return { dictionary: stream.dictionary, buffer: buffer };
}
/** PDFPage is a wrapper around a single page in a PDF that provides aggregates
that page's content from its various Contents or Resources fields.
*/
var PDFPage = (function () {
    function PDFPage(pdf, page) {
        // ignore Parent and the given Type
        this.Type = 'Page';
        this.MediaBox = page['MediaBox'];
        // a page's 'Contents' field may be a single stream or multiple streams.
        // we need to iterate through all of them and concatenate them into a single streams
        var ContentsStreams = [].concat(page['Contents']).map(function (reference) {
            return pdf.findObject(reference);
        });
        this.Contents = mergeStreams(ContentsStreams);
        // The other contents are the `Resources` field. The Resources field is
        // always a single object, as far as I can tell.
        var Resources = pdf.findObject(page['Resources']);
        // `Resources` has a field, `XObject`, which is a mapping from names to
        // references (to streams). I'm pretty sure they're always streams.
        // XObject usually has only one field, but could have several.
        this.XObject = {};
        for (var name in Resources['XObject']) {
            var stream = pdf.findObject(Resources['XObject'][name]);
            this.XObject[name] = stream;
        }
        var canvas = new graphics.Canvas(this.XObject);
        canvas.renderStream(this.Contents);
        this.spans = canvas.spans;
    }
    return PDFPage;
})();
module.exports = PDF;
