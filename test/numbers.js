import assert from 'assert';
import {describe, it} from 'mocha';

describe('Numbers', () => {
  it('that should look numeric', () => {
    assert(!isNaN('3'));
    assert(!isNaN('34'));
    assert(!isNaN('-1'));
    assert(!isNaN('100.0'));
    assert(!isNaN(3));
    assert(!isNaN(34));
    assert(!isNaN(-1));
    assert(!isNaN(100.0));
  });
  it('that should not look numeric', () => {
    assert(isNaN('3g'));
    assert(isNaN('10K'));
    assert(isNaN('four'));
    assert(isNaN(undefined));
    assert(isNaN('-5-6-8'));
  });
  it('that should not look numeric but do', () => {
    assert(!isNaN(null));
    assert(!isNaN(false));
  });
});
