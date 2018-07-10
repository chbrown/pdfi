import test from 'ava';

import {makeRectangle, distanceToRectangle, formatRectangle, containsRectangle} from '../graphics/geometry';

test('graphics should measure distances between rectangles', t => {
  const unitRect = makeRectangle(0, 0, 1, 1);
  const unitRectAt22 = makeRectangle(2, 2, 3, 3);
  t.deepEqual([1, 1], distanceToRectangle(unitRect, unitRectAt22));
  t.deepEqual([1, 1], distanceToRectangle(unitRectAt22, unitRect));
});

test('graphics should format rectangle string', t => {
  const unitRect = makeRectangle(0, 0, 1, 1);
  t.deepEqual('[0, 0, 1, 1]', formatRectangle(unitRect));
});

test('graphics should detect rectangle containment', t => {
  const unitRect = makeRectangle(0, 0, 1, 1);
  const tenRect = makeRectangle(0, 0, 10, 10);
  t.true(containsRectangle(tenRect, unitRect));
});
