var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/// <reference path="type_declarations/index.d.ts" />
var logger = require('loge');
var lexing = require('lexing');
var graphics = require('./parsers/graphics');
var cmap = require('./parsers/cmap');
var decoders = require('./filters/decoders');
var drawing = require('./drawing');
var shapes = require('./shapes');
var unorm = require('unorm');
/**
glyphlist is a mapping from PDF glyph names to unicode strings
*/
var glyphlist = require('./encoding/glyphlist');
var latin_charset = require('./encoding/latin_charset');
var IndirectReference = (function () {
    function IndirectReference(object_number, generation_number) {
        this.object_number = object_number;
        this.generation_number = generation_number;
    }
    IndirectReference.isIndirectReference = function (object) {
        if (object === undefined || object === null)
            return false;
        // return ('object_number' in object) && ('generation_number' in object);
        var object_number = object['object_number'];
        var generation_number = object['generation_number'];
        return (object_number !== undefined) && (generation_number !== undefined);
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
        return "" + this.object_number + ":" + this.generation_number;
    };
    return IndirectReference;
})();
exports.IndirectReference = IndirectReference;
/**
_pdf: PDF -- the base PDF
_object: the original plain old javascript object parsed from the PDF

The _object may be an IndirectReference; if so, it will not be resolved
immediately, but only when the `object` getter is called.
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
                return (kid_object['Type'] === 'Pages') ? new Pages(_this._pdf, kid_object) : new Page(_this._pdf, kid_object);
            });
        },
        enumerable: true,
        configurable: true
    });
    /**
    "Pages"-type objects have a field, Kids: IndirectReference[].
    Each indirect reference will resolve to a Page or Pages object.
  
    This function will flatten the page list breadth-first, returning
    */
    Pages.prototype.getLeaves = function () {
        var PageGroups = this.Kids.map(function (Kid) {
            // return (Kid instanceof Pages) ? Kid.getLeaves() : [Kid];
            if (Kid instanceof Pages) {
                return Kid.getLeaves();
            }
            else if (Kid instanceof Page) {
                return [Kid];
            }
        });
        // flatten Page[][] into Page[]
        return Array.prototype.concat.apply([], PageGroups);
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
            return this.object['MediaBox'];
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
  
    > If the value is an array, the effect shall be as if all of the streams in the array were concatenated, in order, to form a single stream. Conforming writers can create image objects and other resources as they occur, even though they interrupt the content stream. The division between streams may occur only at the boundaries between lexical tokens but shall be unrelated to the page’s logical content or organization. Applications that consume or produce PDF files need not preserve the existing structure of the Contents array. Conforming writers shall not create a Contents array containing no elements.
  
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
    /**
    When we render a page, we specify a ContentStream as well as a Resources
    dictionary. That Resources dictionary may contain XObject streams that are
    embedded as `Do` operations in the main contents, as well as sub-Resources
    in those XObjects.
    */
    Page.prototype.renderCanvas = function () {
        var pageBox = new shapes.Rectangle(this.MediaBox[0], this.MediaBox[1], this.MediaBox[2], this.MediaBox[3]);
        var canvas = new drawing.Canvas(pageBox);
        var contents_string = this.joinContents('\n');
        var contents_string_iterable = new lexing.StringIterator(contents_string);
        var context = new graphics.DrawingContext(this.Resources);
        context.render(contents_string_iterable, canvas);
        return canvas;
    };
    /**
    Returns one string (one line) for each paragraph.
    */
    Page.prototype.getParagraphStrings = function (section_names) {
        var canvas = this.renderCanvas();
        var sections = canvas.getSections();
        var selected_sections = sections.filter(function (section) { return section_names.indexOf(section.name) > -1; });
        var selected_sections_paragraphs = selected_sections.map(function (section) { return section.getParagraphs(); });
        // flatten selected_sections_paragraphs into a single Array of Paragraphs
        var paragraphs = selected_sections_paragraphs.reduce(function (a, b) { return a.concat(b); }, []);
        // render each Paragraph into a single string with any pre-existing EOL
        // markers stripped out
        return paragraphs.map(function (paragraph) {
            var parargraph_text = paragraph.getText();
            var line = parargraph_text.replace(/(\r\n|\r|\n|\t)/g, ' ');
            var visible_line = parargraph_text.replace(/[\x00-\x1F]/g, '');
            var normalized_line = unorm.nfkc(visible_line);
            return normalized_line;
        });
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
    Object.defineProperty(ContentStream.prototype, "Filter", {
        get: function () {
            return [].concat(this.object['dictionary']['Filter'] || []);
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
            var buffer = this.object['buffer'];
            this.Filter.forEach(function (filter) {
                var decoder = decoders[filter];
                if (decoder) {
                    buffer = decoder(buffer);
                }
                else {
                    var message = "Could not find decoder named \"" + filter + "\" to fully decode stream";
                    logger.error(message);
                }
            });
            // TODO: delete the dictionary['Filter'] field?
            return buffer;
        },
        enumerable: true,
        configurable: true
    });
    ContentStream.prototype.toJSON = function () {
        return {
            Length: this.Length,
            Filter: this.Filter,
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
Pages that render to text are defined by their `Contents` field, but
that field sometimes references objects or fonts in the `Resources` field,
which in turns has a field, `XObject`, which is a mapping from names object
names to nested streams of content. I'm pretty sure they're always streams.

Despite being plural, the `Resources` field is always a single object, as far as I can tell.

None of the fields are required.

Caches Fonts (which is pretty hot when rendering a page)
*/
var Resources = (function (_super) {
    __extends(Resources, _super);
    function Resources() {
        _super.apply(this, arguments);
        this._cached_fonts = {};
    }
    Object.defineProperty(Resources.prototype, "ExtGState", {
        get: function () {
            return this.object['ExtGState'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Resources.prototype, "ColorSpace", {
        get: function () {
            return this.object['ColorSpace'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Resources.prototype, "Pattern", {
        get: function () {
            return this.object['Pattern'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Resources.prototype, "Shading", {
        get: function () {
            return this.object['Shading'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Resources.prototype, "ProcSet", {
        get: function () {
            return this.object['ProcSet'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Resources.prototype, "Properties", {
        get: function () {
            return this.object['Properties'];
        },
        enumerable: true,
        configurable: true
    });
    Resources.prototype.getXObject = function (name) {
        var XObject_dictionary = new Model(this._pdf, this.object['XObject']).object;
        var object = XObject_dictionary[name];
        return object ? new ContentStream(this._pdf, object) : undefined;
    };
    /**
    Retrieve a Font instance from the Resources' Font dictionary.
  
    Returns null if the dictionary has no `name` key.
  
    Caches fonts, even missing ones (as null).
    */
    Resources.prototype.getFont = function (name) {
        var cached_font = this._cached_fonts[name];
        if (cached_font === undefined) {
            var Font_dictionary = new Model(this._pdf, this.object['Font']).object;
            var Font_model = (name in Font_dictionary) ? new Font(this._pdf, Font_dictionary[name]) : null;
            // See Table 110 – Font types:
            // Type0 | Type1 | MMType1 | Type3 | TrueType | CIDFontType0 | CIDFontType2
            if (Type0Font.isType0Font(Font_model.object)) {
                Font_model = new Type0Font(this._pdf, Font_model.object);
            }
            else if (Type1Font.isType1Font(Font_model.object)) {
                Font_model = new Type1Font(this._pdf, Font_model.object);
            }
            // TODO: add the others...
            cached_font = this._cached_fonts[name] = Font_model;
        }
        return cached_font;
    };
    Resources.prototype.toJSON = function () {
        return {
            ExtGState: this.ExtGState,
            ColorSpace: this.ColorSpace,
            Pattern: this.Pattern,
            Shading: this.Shading,
            XObject: this.object['XObject'],
            Font: this.object['Font'],
            ProcSet: this.ProcSet,
            Properties: this.Properties,
        };
    };
    return Resources;
})(Model);
exports.Resources = Resources;
/**
`_charCodeMapping` is a cached mapping from in-PDF character codes to native
Javascript (unicode) strings.
`_widthMapping` is a cached mapping from charCodes to character widths
(numbers).
`_defaultWidth` is a cached number representing the default character width,
when the character code cannot be found in `_widthMapping`.
*/
var Font = (function (_super) {
    __extends(Font, _super);
    function Font() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(Font.prototype, "Subtype", {
        get: function () {
            return this.object['Subtype'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Font.prototype, "BaseFont", {
        get: function () {
            return this.object['BaseFont'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Font.prototype, "FontDescriptor", {
        get: function () {
            // I don't think I need any of the FontDescriptor stuff for text extraction
            var model = new Model(this._pdf, this.object['FontDescriptor']);
            return model.object;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Font.prototype, "Encoding", {
        get: function () {
            var object = this.object['Encoding'];
            return object ? new Encoding(this._pdf, object) : undefined;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Font.prototype, "ToUnicode", {
        get: function () {
            var object = this.object['ToUnicode'];
            return object ? new ToUnicode(this._pdf, object) : undefined;
        },
        enumerable: true,
        configurable: true
    });
    Font.prototype.getDefaultWidth = function () {
        return 1000;
    };
    Font.prototype.getWidthMapping = function () {
        return [];
    };
    /**
    We need the Font's Encoding (not always specified) to read its Differences,
    which we use to map character codes into the glyph name (which can then easily
    be mapped to the unicode string representation of that glyph).
    */
    Font.prototype.getCharCodeMapping = function () {
        // try the ToUnicode object first
        if (this.ToUnicode) {
            return this.ToUnicode.Mapping;
        }
        // No luck? Try the Encoding dictionary
        if (this.Encoding) {
            return this.Encoding.Mapping;
        }
        // Neither Encoding nor ToUnicode are specified; that's bad!
        logger.warn("Could not find any character code mapping for font; using default mapping");
        return Encoding.getDefaultMapping('std');
    };
    /**
    Returns a native (unicode) Javascript string representing the given character
    codes.
  
    Caches the required Mapping.
  
    Uses ES6-like `\u{...}`-style escape sequences if the character code cannot
    be resolved to a string.
    */
    Font.prototype.decodeString = function (charCodes, skipMissing) {
        var _this = this;
        if (skipMissing === void 0) { skipMissing = false; }
        // initialize if needed
        if (this._charCodeMapping === undefined) {
            this._charCodeMapping = this.getCharCodeMapping();
        }
        return charCodes.map(function (charCode) {
            var string = _this._charCodeMapping[charCode];
            if (string === undefined) {
                logger.error("Could not decode character code: " + charCode);
                if (skipMissing) {
                    return '';
                }
                return '\\u{' + charCode.toString(16) + '}';
            }
            return string;
        }).join('');
    };
    Font.prototype.measureString = function (charCodes) {
        var _this = this;
        if (this._widthMapping === undefined) {
            this._widthMapping = this.getWidthMapping();
            this._defaultWidth = this.getDefaultWidth();
        }
        var total_width = 0;
        charCodes.forEach(function (charCode) {
            var width = _this._widthMapping[charCode];
            total_width += (width !== undefined) ? width : _this._defaultWidth;
        });
        return total_width;
    };
    Font.prototype.toJSON = function () {
        return {
            Type: 'Font',
            Subtype: this.Subtype,
            Encoding: this.Encoding,
            FontDescriptor: this.FontDescriptor,
            BaseFont: this.BaseFont,
            Mapping: this.getCharCodeMapping(),
            defaultWidth: this.getDefaultWidth(),
            widthMapping: this.getWidthMapping(),
        };
    };
    Font.isFont = function (object) {
        if (object === undefined || object === null)
            return false;
        return object['Type'] === 'Font';
    };
    return Font;
})(Model);
exports.Font = Font;
var Type1Font = (function (_super) {
    __extends(Type1Font, _super);
    function Type1Font() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(Type1Font.prototype, "Widths", {
        /**
        The PDF spec actually recommends that Widths is an indirect reference.
        */
        get: function () {
            var model = new Model(this._pdf, this.object['Widths']);
            return model.object;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Type1Font.prototype, "FirstChar", {
        get: function () {
            return this.object['FirstChar'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Type1Font.prototype, "LastChar", {
        get: function () {
            return this.object['LastChar'];
        },
        enumerable: true,
        configurable: true
    });
    Type1Font.prototype.getDefaultWidth = function () {
        return this.FontDescriptor['MissingWidth'];
    };
    Type1Font.prototype.getWidthMapping = function () {
        var mapping = [];
        var FirstChar = this.FirstChar;
        this.Widths.forEach(function (width, width_index) {
            mapping[FirstChar + width_index] = width;
        });
        return mapping;
    };
    Type1Font.isType1Font = function (object) {
        if (object === undefined || object === null)
            return false;
        return object['Type'] === 'Font' && object['Subtype'] === 'Type1';
    };
    return Type1Font;
})(Font);
exports.Type1Font = Type1Font;
/**
Composite font (PDF32000_2008.pdf:9.7)

> Type: 'Font'
> Subtype: 'Type0'
*/
var Type0Font = (function (_super) {
    __extends(Type0Font, _super);
    function Type0Font() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(Type0Font.prototype, "DescendantFont", {
        /**
        > DescendantFonts: array (Required): A one-element array specifying the
        > CIDFont dictionary that is the descendant of this Type 0 font.
        */
        get: function () {
            return new CIDFont(this._pdf, this.object['DescendantFonts'][0]);
        },
        enumerable: true,
        configurable: true
    });
    Type0Font.prototype.getDefaultWidth = function () {
        return this.DescendantFont.getDefaultWidth();
    };
    Type0Font.prototype.getWidthMapping = function () {
        return this.DescendantFont.getWidthMapping();
    };
    Type0Font.isType0Font = function (object) {
        if (object === undefined || object === null)
            return false;
        return object['Type'] === 'Font' && object['Subtype'] === 'Type0';
    };
    return Type0Font;
})(Font);
exports.Type0Font = Type0Font;
/**
CIDFonts (PDF32000_2008.pdf:9.7.4)

Goes well with Type 0 fonts.

> Type: 'Font'
> Subtype: 'CIDFontType0' or 'CIDFontType2'
> CIDSystemInfo: dictionary (Required)
> DW: integer (Optional) The default width for glyphs in the CIDFont. Default
    value: 1000 (defined in user units).
> W: array (Optional) A description of the widths for the glyphs in the CIDFont.
    The array’s elements have a variable format that can specify individual
    widths for consecutive CIDs or one width for a range of CIDs. Default
    value: none (the DW value shall be used for all glyphs).

*/
var CIDFont = (function (_super) {
    __extends(CIDFont, _super);
    function CIDFont() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(CIDFont.prototype, "CIDSystemInfo", {
        get: function () {
            return this.object['CIDSystemInfo'];
        },
        enumerable: true,
        configurable: true
    });
    CIDFont.prototype.getDefaultWidth = function () {
        return this.object['DW'];
    };
    /**
    The W array allows the definition of widths for individual CIDs. The elements of the array shall be organized in groups of two or three, where each group shall be in one of these two formats:
    `c [w1 w2 ... wn]`: c shall be an integer specifying a starting CID value; it shall be followed by an array of n numbers that shall specify the widths for n consecutive CIDs, starting with c.
    `c_first c_last w`: define the same width, w, for all CIDs in the range c_first to c_last.
    */
    CIDFont.prototype.getWidthMapping = function () {
        var mapping = [];
        var addConsecutive = function (starting_cid_value, widths) {
            widths.forEach(function (width, width_offset) {
                mapping[starting_cid_value + width_offset] = width;
            });
        };
        var addRange = function (c_first, c_last, width) {
            for (var cid = c_first; cid <= c_last; cid++) {
                mapping[cid] = width;
            }
        };
        var W_object = new Model(this._pdf, this.object['W']).object;
        var cid_widths = (W_object || []);
        var index = 0;
        var length = cid_widths.length;
        while (index < length) {
            if (Array.isArray(cid_widths[index + 1])) {
                var starting_cid_value = cid_widths[index];
                var widths = cid_widths[index + 1];
                addConsecutive(starting_cid_value, widths);
                index += 2;
            }
            else {
                var c_first = cid_widths[index];
                var c_last = cid_widths[index + 1];
                var width = cid_widths[index + 2];
                addRange(c_first, c_last, width);
                index += 3;
            }
        }
        return mapping;
    };
    return CIDFont;
})(Font);
exports.CIDFont = CIDFont;
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
    Object.defineProperty(Catalog.prototype, "Names", {
        get: function () {
            return this.object['Names'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Catalog.prototype, "PageMode", {
        get: function () {
            return this.object['PageMode'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Catalog.prototype, "OpenAction", {
        get: function () {
            return this.object['OpenAction'];
        },
        enumerable: true,
        configurable: true
    });
    Catalog.prototype.toJSON = function () {
        return {
            Type: 'Catalog',
            Pages: this.Pages,
            Names: this.Names,
            PageMode: this.PageMode,
            OpenAction: this.OpenAction,
        };
    };
    return Catalog;
})(Model);
exports.Catalog = Catalog;
/**
interface Encoding {
  Type: 'Encoding';
  BaseEncoding: string;
  Differences: Array<number | string>;
}
*/
var Encoding = (function (_super) {
    __extends(Encoding, _super);
    function Encoding() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(Encoding.prototype, "BaseEncoding", {
        get: function () {
            return this.object['BaseEncoding'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Encoding.prototype, "Differences", {
        get: function () {
            return this.object['Differences'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Encoding.prototype, "Mapping", {
        /**
        Mapping returns an object mapping character codes to unicode strings.
      
        If there are no `Differences` specified, return a default mapping.
        */
        get: function () {
            var mapping = Encoding.getDefaultMapping('std');
            var current_character_code = 0;
            (this.Differences || []).forEach(function (difference) {
                if (typeof difference === 'number') {
                    current_character_code = difference;
                }
                else {
                    // difference is a glyph name, but we want a mapping from character
                    // codes to native unicode strings, so we resolve the glyphname via the
                    // PDF standard glyphlist
                    // TODO: handle missing glyphnames
                    mapping[current_character_code++] = glyphlist[difference];
                }
            });
            return mapping;
        },
        enumerable: true,
        configurable: true
    });
    Encoding.prototype.toJSON = function () {
        return {
            Type: 'Encoding',
            BaseEncoding: this.BaseEncoding,
            Differences: this.Differences,
            Mapping: this.Mapping,
        };
    };
    /**
    This loads the character codes listed in encoding/latin_charset.json into
    a (sparse?) Array of strings mapping indices (character codes) to unicode
    strings (not glyphnames).
  
    `base` should be one of 'std', 'mac', 'win', or 'pdf'
    */
    Encoding.getDefaultMapping = function (base) {
        var mapping = [];
        latin_charset.forEach(function (charspec) {
            var charCode = charspec[base];
            if (charCode !== null) {
                mapping[charspec[base]] = glyphlist[charspec.glyphname];
            }
        });
        return mapping;
    };
    Encoding.isEncoding = function (object) {
        if (object === undefined || object === null)
            return false;
        return object['Type'] === 'Encoding';
    };
    return Encoding;
})(Model);
exports.Encoding = Encoding;
var ToUnicode = (function (_super) {
    __extends(ToUnicode, _super);
    function ToUnicode() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(ToUnicode.prototype, "Mapping", {
        get: function () {
            var string_iterable = lexing.StringIterator.fromBuffer(this.buffer, 'ascii');
            var parser = new cmap.CMapParser();
            return parser.parse(string_iterable);
        },
        enumerable: true,
        configurable: true
    });
    ToUnicode.prototype.toJSON = function () {
        return {
            Mapping: this.Mapping,
        };
    };
    return ToUnicode;
})(ContentStream);
exports.ToUnicode = ToUnicode;
