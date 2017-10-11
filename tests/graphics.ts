import {ok, deepEqual} from 'assert';
import {assign} from 'tarry';

import {Rectangle, makeRectangle, distanceToRectangle, formatRectangle, containsRectangle} from '../graphics/geometry';
import {Container, mergeContainer} from '../graphics/geometry';

describe('graphics', () => {
  it('should measure distances between rectangles', () => {
    const unitRect = makeRectangle(0, 0, 1, 1);
    const unitRectAt22 = makeRectangle(2, 2, 3, 3);
    deepEqual([1, 1], distanceToRectangle(unitRect, unitRectAt22));
    deepEqual([1, 1], distanceToRectangle(unitRectAt22, unitRect));
  });

  it('should format rectangle string', () => {
    const unitRect = makeRectangle(0, 0, 1, 1);
    deepEqual("[0, 0, 1, 1]", formatRectangle(unitRect));
  });

  it('should detect rectangle containment', () => {
    const unitRect = makeRectangle(0, 0, 1, 1);
    const tenRect = makeRectangle(0, 0, 10, 10);
    ok(containsRectangle(tenRect, unitRect));
  });
});
