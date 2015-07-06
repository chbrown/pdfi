/// <reference path="../type_declarations/index.d.ts" />
var assert = require('assert');
var models = require('../models');
var geometry_1 = require('../graphics/geometry');
var models_1 = require('../graphics/models');
var stream_1 = require('../graphics/stream');
function createMockResources() {
    var font_object = {
        Type: "Font",
        Subtype: "Type1",
        Encoding: {
            Type: "Encoding",
            Differences: []
        },
        Widths: [],
        FontDescriptor: {
            MissingWidth: 1000,
        }
    };
    var resource_object = {
        Font: {
            F10: font_object,
        }
    };
    return new models.Resources(null, resource_object);
}
function renderString(content_stream_string) {
    // prepare canvas
    var outerBounds = new geometry_1.Rectangle(0, 0, 800, 600);
    var canvas = new models_1.Canvas(outerBounds);
    // prepare context
    var resources = createMockResources();
    var context = new stream_1.CanvasDrawingContext(canvas, resources);
    context.applyContentStream(content_stream_string);
    // extract text spans strings
    return canvas.getElements().map(function (textSpan) { return textSpan.string; });
}
describe('Graphics text parsing:', function () {
    it('should parse a simple text show operation', function () {
        var actual = renderString('/F10 11 Tf BT (Adjustments must) Tj ET');
        var expected = ['Adjustments must'];
        assert.deepEqual(actual, expected);
    });
    it('should parse a nested string', function () {
        var actual = renderString('/F10 11 Tf BT (In case of \\(dire\\) emergency) Tj ET');
        var expected = ['In case of (dire) emergency'];
        assert.deepEqual(actual, expected);
    });
});
