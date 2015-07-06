/// <reference path="../type_declarations/index.d.ts" />
import assert = require('assert');
import lexing = require('lexing');

import models = require('../models');
import graphics = require('../parsers/index');
import drawing = require('../drawing');
import shapes = require('../shapes');

function createResources(): models.Resources {
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

function renderString(contents: string): string[] {
  // prepare content stream string
  var contents_string_iterable = new lexing.StringIterator(contents);

  // prepare canvas
  var bounds = new shapes.Rectangle(0, 0, 800, 600);
  var canvas = new drawing.Canvas(bounds);

  // prepare context
  var resources = createResources();
  var context = new graphics.DrawingContext(resources);
  context.render(contents_string_iterable, canvas);

  // extract text spans strings
  return canvas.spans.map(span => span.string);
}

describe('graphics text parsing', function() {

  it('should parse a simple text show operation', function() {
    var actual = renderString('/F10 11 Tf BT (Adjustments must) Tj ET');
    var expected = ['Adjustments must'];
    assert.deepEqual(actual, expected);
  });

  it('should parse a nested string', function() {
    var actual = renderString('/F10 11 Tf BT (In case of \\(dire\\) emergency) Tj ET');
    var expected = ['In case of (dire) emergency'];
    assert.deepEqual(actual, expected);
  });

});
