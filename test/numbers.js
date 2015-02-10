/*jslint node: true */ /*globals describe, it */
var assert = require('assert');

describe('Numbers', function() {
  it('that should look numeric', function() {
    assert(!isNaN('3'));
    assert(!isNaN('34'));
    assert(!isNaN('-1'));
    assert(!isNaN('100.0'));
    assert(!isNaN(3));
    assert(!isNaN(34));
    assert(!isNaN(-1));
    assert(!isNaN(100.0));
  });
  it('that should not look numeric', function() {
    assert(isNaN('3g'));
    assert(isNaN('10K'));
    assert(isNaN('four'));
    assert(isNaN(undefined));
    assert(isNaN('-5-6-8'));
  });
  it('that should not look numeric but do', function() {
    assert(!isNaN(null));
    assert(!isNaN(false));
  });
});
