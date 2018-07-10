import test from 'ava';

import {flatMap} from 'tarry';

import {Resources} from '../models';
import {renderLayout} from '../graphics/index';
import {makeRectangle} from '../graphics/geometry';

function createMockResources(): Resources {
  const font_object = {
    Type: 'Font',
    Subtype: 'Type1',
    Encoding: {
      Type: 'Encoding',
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
  const paragraphs = renderLayout(outerBounds, Buffer.from(content_stream_string), resources);

  // extract text spans strings
  const textSpans = flatMap(paragraphs, paragraph =>
    flatMap(paragraph.elements, line =>
      flatMap(line.elements, wordGroup => wordGroup.elements)
    )
  );
  return textSpans.map(({text}) => text);
}

test('Graphics text: should parse a simple text show operation', t => {
  const actual = renderString('/F10 11 Tf BT (Adjustments must) Tj ET');
  const expected = ['Adjustments must'];
  t.deepEqual(actual, expected);
});

test('Graphics text: should parse a nested string', t => {
  const actual = renderString('/F10 11 Tf BT (In case of \\(dire\\) emergency) Tj ET');
  const expected = ['In case of (dire) emergency'];
  t.deepEqual(actual, expected);
});
