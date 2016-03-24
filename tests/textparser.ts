import {deepEqual} from 'assert';
import {flatMap} from 'tarry';

import {Resources} from '../models';
import {renderLayout} from '../graphics/index';
import {makeRectangle} from '../graphics/geometry';

function createMockResources(): Resources {
  const font_object = {
    Type: "Font",
    Subtype: "Type1",
    Encoding: {
      Type: "Encoding",
      Differences: [],
    },
    Widths: [],
    FontDescriptor: {
      MissingWidth: 1000,
    },
  };
  const resource_object = {
    Font: {
      F10: font_object,
    },
  };
  return new Resources(null, resource_object);
}

function renderString(content_stream_string: string): string[] {
  // prepare canvas
  const outerBounds = makeRectangle(0, 0, 800, 600);

  // prepare context
  const resources = createMockResources();
  const paragraphs = renderLayout(outerBounds, new Buffer(content_stream_string), resources);

  // extract text spans strings
  const textSpans = flatMap(paragraphs, paragraph =>
    flatMap(paragraph.elements, line =>
      flatMap(line.elements, wordGroup => wordGroup.elements)
    )
  );
  return textSpans.map(({text}) => text);
}

describe('Graphics text parsing:', () => {
  it('should parse a simple text show operation', () => {
    const actual = renderString('/F10 11 Tf BT (Adjustments must) Tj ET');
    const expected = ['Adjustments must'];
    deepEqual(actual, expected);
  });

  it('should parse a nested string', () => {
    const actual = renderString('/F10 11 Tf BT (In case of \\(dire\\) emergency) Tj ET');
    const expected = ['In case of (dire) emergency'];
    deepEqual(actual, expected);
  });
});
