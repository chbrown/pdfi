import assert from 'assert';
import {describe, it} from 'mocha';

import {Resources} from '../models';
import {Rectangle} from '../graphics/geometry';
import {Canvas} from '../graphics/models';
import {CanvasDrawingContext} from '../graphics/stream';

function createMockResources(): Resources {
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
  return new Resources(null, resource_object);
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

describe('Graphics text parsing:', () => {

  it('should parse a simple text show operation', () => {
    var actual = renderString('/F10 11 Tf BT (Adjustments must) Tj ET');
    var expected = ['Adjustments must'];
    assert.deepEqual(actual, expected);
  });

  it('should parse a nested string', () => {
    var actual = renderString('/F10 11 Tf BT (In case of \\(dire\\) emergency) Tj ET');
    var expected = ['In case of (dire) emergency'];
    assert.deepEqual(actual, expected);
  });

});
