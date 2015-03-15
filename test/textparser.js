/// <reference path="../type_declarations/index.d.ts" />
var assert = require('assert');
var graphics = require('../parsers/graphics');
describe('graphics text parsing', function () {
    it('should parse a simple text show operation', function () {
        var canvas = new graphics.Canvas({});
        canvas.renderString('BT (Adjustments must ) Tj ET');
        var actual = canvas.spans.map(function (span) { return span.text; });
        var expected = ['Adjustments must '];
        assert.deepEqual(actual, expected);
    });
    it('should parse a nested string', function () {
        var canvas = new graphics.Canvas({});
        canvas.renderString('BT (In case of \\(dire\\) emergency) Tj ET');
        var actual = canvas.spans.map(function (span) { return span.text; });
        var expected = ['In case of (dire) emergency'];
        assert.deepEqual(actual, expected);
    });
});
