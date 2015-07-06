/// <reference path="../type_declarations/index.d.ts" />
import assert = require('assert');
import lexing = require('lexing');

import models = require('../models');
import graphics = require('../parsers/index');
import {Rectangle} from '../graphics/geometry';
import {Canvas} from '../graphics/models';
import {CanvasDrawingContext} from '../graphics/stream';

function createMockResources(): models.Resources {
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

function renderString(content_stream_string: string): string[] {
  // prepare canvas
  var outerBounds = new Rectangle(0, 0, 800, 600);
  var canvas = new Canvas(outerBounds);

  // prepare context
  var resources = createMockResources();
  var context = new CanvasDrawingContext(canvas, resources);
  context.applyContentStream(content_stream_string);

  // extract text spans strings
  return canvas.getElements().map(textSpan => textSpan.string);
}

describe('Graphics text parsing:', function() {

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
