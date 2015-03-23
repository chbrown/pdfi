/// <reference path="../type_declarations/index.d.ts" />
import assert = require('assert');
import lexing = require('lexing');

import models = require('../models');
import graphics = require('../parsers/graphics');
import drawing = require('../drawing');

function createResources(): models.Resources {
  var font_object = {
    Type: "Font",
    Subtype: "Type1",
    Encoding: {
      Type: "Encoding",
      Differences: []
    },
    Widths: [],
  };
  var resource_object = {
    Font: {
      F10: font_object,
    }
  };
  return new models.Resources(null, resource_object);
}

function renderString(contents: string): string[] {
  // var contents_string = this.joinContents('\n');
  var iterable = new lexing.StringIterator(contents);
  var resources = createResources();

  var canvas = new drawing.Canvas([0, 0, 800, 600]);
  canvas.render(iterable, resources);

  return canvas.spans.map(span => span.text);
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
