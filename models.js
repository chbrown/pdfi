var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
/// <reference path="type_declarations/index.d.ts" />
var lexing_1 = require('lexing');
var arrays_1 = require('arrays');
var objectAssign = require('object-assign');
var states_1 = require('./parsers/states');
var decoders_1 = require('./filters/decoders');
/**
Most of the classes in this module are wrappers for typed objects in a PDF,
where the object's Type indicates useful ways it may be processed.
*/
var IndirectReference = (function () {
    function IndirectReference(object_number, generation_number) {
        this.object_number = object_number;
        this.generation_number = generation_number;
    }
    IndirectReference.isIndirectReference = function (object) {
        if (object === undefined || object === null)
            return false;
        return (object['object_number'] !== undefined) && (object['generation_number'] !== undefined);
    };
    /**
    Create an IndirectReference from an "object[:reference=0]" string.
    */
    IndirectReference.fromString = function (reference) {
        var reference_parts = reference.split(':');
        var object_number = parseInt(reference_parts[0], 10);
        var generation_number = (reference_parts.length > 1) ? parseInt(reference_parts[1], 10) : 0;
        return new IndirectReference(object_number, generation_number);
    };
    IndirectReference.prototype.toString = function () {
        return this.object_number + ":" + this.generation_number;
    };
    return IndirectReference;
})();
exports.IndirectReference = IndirectReference;
/**
_pdf: PDF -- the base PDF
_object: the original plain old javascript object parsed from the PDF

The _object may be an IndirectReference; if so, it will not be resolved
immediately, but only when the `object` getter is called.

If a new Model is constructed with a null `_object`, it will create the Model,
but Model#object will return null.
*/
var Model = (function () {
    function Model(_pdf, _object) {
        this._pdf = _pdf;
        this._object = _object;
        // if the given _object looks like an indirect reference, mark it unresolved
        this._resolved = !IndirectReference.isIndirectReference(_object);
    }
    Object.defineProperty(Model.prototype, "object", {
        get: function () {
            if (!this._resolved) {
                var object_number = this._object['object_number'];
                var generation_number = this._object['generation_number'];
                this._object = this._pdf.getObject(object_number, generation_number);
                this._resolved = true;
            }
            return this._object;
        },
        enumerable: true,
        configurable: true
    });
    /**
    Read a value from the `object` mapping (assuming `this` is a PDFDictionary or
    behaves like one), resolving indirect references as needed.
  
    Much like `new Model(this._pdf, this.object[key]).object`, but avoids creating
    a whole new Model.
    */
    Model.prototype.get = function (key) {
        var value = this.object[key];
        if (value !== undefined && value['object_number'] !== undefined && value['generation_number'] !== undefined) {
            value = this._pdf.getObject(value['object_number'], value['generation_number']);
        }
        return value;
    };
    /**
    This is an (icky?) hack to get around circular dependencies with subclasses
    of Model (like Font).
    */
    Model.prototype.asType = function (ctor) {
        return new ctor(this._pdf, this.object);
    };
    Model.prototype.toJSON = function () {
        return this.object;
    };
    return Model;
})();
exports.Model = Model;
/**
interface Pages {
  Type: 'Pages';
  Kids: IndirectReference[]; // -> Array<Pages | Page>
}
*/
var Pages = (function (_super) {
    __extends(Pages, _super);
    function Pages() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(Pages.prototype, "Kids", {
        get: function () {
            var _this = this;
            return this.object['Kids'].map(function (Kid) {
                var kid_object = new Model(_this._pdf, Kid).object;
                return (kid_object['Type'] === 'Pages') ?
                    new Pages(_this._pdf, kid_object) : new Page(_this._pdf, kid_object);
            });
        },
        enumerable: true,
        configurable: true
    });
    /**
    "Pages"-type objects have a field, Kids: IndirectReference[].
    Each indirect reference will resolve to a Page or Pages object.
  
    This will flatten the page list breadth-first, returning only the Page objects
    at the leaves of the pages tree.
    */
    Pages.prototype.getLeaves = function () {
        return arrays_1.flatMap(this.Kids, function (Kid) {
            // return (Kid instanceof Pages) ? Kid.getLeaves() : [Kid];
            if (Kid instanceof Pages) {
                return Kid.getLeaves();
            }
            else if (Kid instanceof Page) {
                return [Kid];
            }
        });
    };
    Pages.prototype.toJSON = function () {
        return {
            Type: 'Pages',
            Kids: this.Kids,
        };
    };
    return Pages;
})(Model);
exports.Pages = Pages;
/**
Only `Type`, `Parent`, `Resources`, and `MediaBox` are required.

Optional fields:

    LastModified?: string; // actually Date
    Annots?: IndirectReference;
    CropBox?: Rectangle;
    BleedBox?: Rectangle;
    TrimBox?: Rectangle;
    ArtBox?: Rectangle;
    BoxColorInfo?: DictionaryObject;
    Contents?: IndirectReference | IndirectReference[];
    Rotate?: number;
    Group?: DictionaryObject;
    Thumb?: Stream;

See "Table 30 – Entries in a page object".
*/
var Page = (function (_super) {
    __extends(Page, _super);
    function Page() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(Page.prototype, "Parent", {
        get: function () {
            return new Pages(this._pdf, this.object['Parent']);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Page.prototype, "MediaBox", {
        get: function () {
            return this.get('MediaBox');
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Page.prototype, "Resources", {
        get: function () {
            return new Resources(this._pdf, this.object['Resources']);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Page.prototype, "Contents", {
        /**
        The Contents field may be a reference to a Stream object, an array of
        references to Stream objects, or a reference to an array (of references to
        stream objects)
        */
        get: function () {
            return new Model(this._pdf, this.object['Contents']);
        },
        enumerable: true,
        configurable: true
    });
    /**
    A page's 'Contents' field may be a single stream or an array of streams. We
    need to iterate through all of them and concatenate them into a single stream.
  
    From the spec:
  
    > If the value is an array, the effect shall be as if all of the streams in the array were concatenated, in order, to form a single stream. Conforming writers can create image objects and other resources as they occur, even though they interrupt the content stream. The division between streams may occur only at the boundaries between lexical tokens but shall be unrelated to the page's logical content or organization. Applications that consume or produce PDF files need not preserve the existing structure of the Contents array. Conforming writers shall not create a Contents array containing no elements.
  
    Merging the streams would be pretty simple, except that the separations
    between them count as token separators, so we can't feed the result of
    `Buffer.concat(...)` directly into the StackOperationParser (via Canvas).
  
    TODO: don't combine the strings (more complex)
          see MultiStringIterator in scratch.txt
    */
    Page.prototype.joinContents = function (separator) {
        var _this = this;
        var strings = [].concat(this.Contents.object).map(function (stream) {
            return new ContentStream(_this._pdf, stream).buffer.toString('binary');
        });
        return strings.join(separator);
    };
    Page.prototype.toJSON = function () {
        return {
            Type: 'Page',
            // Parent: this.Parent, // try to avoid circularity
            MediaBox: this.MediaBox,
            Resources: this.Resources,
            Contents: this.Contents,
        };
    };
    return Page;
})(Model);
exports.Page = Page;
/**
interface ContentStream {
  dictionary: {
    Length: number;
    Filter?: string | string[];
  };
  buffer: Buffer;
}
*/
var ContentStream = (function (_super) {
    __extends(ContentStream, _super);
    function ContentStream() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(ContentStream.prototype, "Length", {
        get: function () {
            return new Model(this._pdf, this.object['dictionary']['Length']).object;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ContentStream.prototype, "Resources", {
        get: function () {
            var object = this.object['dictionary']['Resources'];
            return object ? new Resources(this._pdf, object) : undefined;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ContentStream.prototype, "Subtype", {
        get: function () {
            // this may be 'Form' or 'Image', etc., in Resources.XObject values
            return this.object['dictionary']['Subtype'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ContentStream.prototype, "dictionary", {
        get: function () {
            return this.object['dictionary'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ContentStream.prototype, "buffer", {
        /**
        Return the object's buffer, decoding if necessary.
        */
        get: function () {
            var filters = [].concat(this.object['dictionary']['Filter'] || []);
            var decodeParmss = [].concat(this.object['dictionary']['DecodeParms'] || []);
            return decoders_1.decodeBuffer(this.object['buffer'], filters, decodeParmss);
        },
        enumerable: true,
        configurable: true
    });
    ContentStream.prototype.toJSON = function () {
        return {
            Length: this.Length,
            buffer: this.buffer,
        };
    };
    ContentStream.isContentStream = function (object) {
        if (object === undefined || object === null)
            return false;
        return (object['dictionary'] !== undefined) && (object['buffer'] !== undefined);
    };
    return ContentStream;
})(Model);
exports.ContentStream = ContentStream;
/**
An ObjectStream is denoted by Type='ObjStm', and documented in PDF32000_2008.pdf:7.5.7 Object Streams
*/
var ObjectStream = (function (_super) {
    __extends(ObjectStream, _super);
    function ObjectStream() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(ObjectStream.prototype, "objects", {
        get: function () {
            var _this = this;
            var buffer = this.buffer;
            // the prefix designates where each object in the stream occurs in the content
            var prefix = buffer.slice(0, this.dictionary.First);
            // var content = buffer.slice(this.dictionary.First)
            var object_number_index_pairs = arrays_1.groups(prefix.toString('ascii').trim().split(/\s+/).map(function (x) { return parseInt(x, 10); }), 2);
            return object_number_index_pairs.map(function (_a) {
                var object_number = _a[0], offset = _a[1];
                var iterable = lexing_1.StringIterator.fromBuffer(buffer, 'binary', _this.dictionary.First + offset);
                var value = new states_1.OBJECT(iterable, 1024).read();
                return { object_number: object_number, generation_number: 0, value: value };
            });
        },
        enumerable: true,
        configurable: true
    });
    ObjectStream.prototype.toJSON = function () {
        return {
            Length: this.Length,
            buffer: this.buffer,
        };
    };
    return ObjectStream;
})(ContentStream);
exports.ObjectStream = ObjectStream;
var index_1 = require('./font/index');
/**
Pages that render to text are defined by their `Contents` field, but
that field sometimes references objects or fonts in the `Resources` field,
which in turns has a field, `XObject`, which is a mapping from names object
names to nested streams of content. I'm pretty sure they're always streams.

Despite being plural, the `Resources` field is always a single object,
as far as I can tell.

None of the fields are required.
*/
var Resources = (function (_super) {
    __extends(Resources, _super);
    function Resources() {
        _super.apply(this, arguments);
        this._cached_fonts = {};
    }
    /**
    returns `undefined` if no matching XObject is found.
    */
    Resources.prototype.getXObject = function (name) {
        var XObject_dictionary = this.get('XObject');
        var object = XObject_dictionary[name];
        return object ? new ContentStream(this._pdf, object) : undefined;
    };
    /**
    Retrieve a Font instance from the given Resources' Font dictionary.
  
    Caches Fonts (which is pretty hot when rendering a page),
    even missing ones (as null).
  
    Using PDF#getModel() allows reuse of all the memoizing each Font instance does.
    Otherwise, we have to create a new Font instance (albeit, perhaps using the
    PDF's object cache, which is helpful) for each Resources.
  
    throws an Error if the Font dictionary has no matching `name` key.
    */
    Resources.prototype.getFont = function (name) {
        var cached_font = this._cached_fonts[name];
        if (cached_font === undefined) {
            var Font_dictionary = this.get('Font');
            var dictionary_value = Font_dictionary[name];
            var font_object = new Model(this._pdf, dictionary_value).object;
            if (font_object === undefined) {
                throw new Error("Cannot find font object for name=" + name);
            }
            var ctor = index_1.Font.getConstructor(font_object['Subtype']);
            // this `object` will usually be an indirect reference.
            if (IndirectReference.isIndirectReference(dictionary_value)) {
                cached_font = this._cached_fonts[name] = this._pdf.getModel(dictionary_value['object_number'], dictionary_value['generation_number'], ctor);
                cached_font.Name = name;
            }
            else if (font_object) {
                // if `object` is not an indirect reference, the only caching we can do
                // is on this Resources object.
                cached_font = this._cached_fonts[name] = new ctor(this._pdf, font_object);
            }
            else {
                throw new Error("Cannot find font \"" + name + "\" in Resources: " + JSON.stringify(this));
            }
        }
        return cached_font;
    };
    /**
    return a Model since the values may be indirect references.
    returns `undefined` if no matching ExtGState is found.
    */
    Resources.prototype.getExtGState = function (name) {
        var ExtGState_dictionary = this.get('ExtGState');
        var object = ExtGState_dictionary[name];
        return object ? new Model(this._pdf, object) : undefined;
    };
    Resources.prototype.toJSON = function () {
        return {
            ExtGState: this.get('ExtGState'),
            ColorSpace: this.get('ColorSpace'),
            Pattern: this.get('Pattern'),
            Shading: this.get('Shading'),
            XObject: this.get('XObject'),
            Font: this.get('Font'),
            ProcSet: this.get('ProcSet'),
            Properties: this.get('Properties'),
        };
    };
    return Resources;
})(Model);
exports.Resources = Resources;
/**
The PDF points to its catalog object with its trailer's `Root` reference.

interface Catalog {
  Type: 'Catalog';
  Pages: IndirectReference; // reference to a {type: 'Pages', ...} object
  Names?: IndirectReference;
  PageMode?: string;
  OpenAction?: IndirectReference;
}
*/
var Catalog = (function (_super) {
    __extends(Catalog, _super);
    function Catalog() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(Catalog.prototype, "Pages", {
        get: function () {
            return new Pages(this._pdf, this.object['Pages']);
        },
        enumerable: true,
        configurable: true
    });
    Catalog.prototype.toJSON = function () {
        return {
            Type: 'Catalog',
            // Pages: this.Pages,
            Names: this.get('Names'),
            PageMode: this.get('PageMode'),
            OpenAction: this.get('OpenAction'),
        };
    };
    return Catalog;
})(Model);
exports.Catalog = Catalog;
/**
The Trailer is not a typical extension of models.Model, because it is not
backed by a single PDFObject, but by a collection of PDFObjects.
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
        this._object = objectAssign(object, this._object);
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
            return new Catalog(this._pdf, this._object['Root']);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Trailer.prototype, "Info", {
        get: function () {
            return new Model(this._pdf, this._object['Info']).object;
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
exports.Trailer = Trailer;
