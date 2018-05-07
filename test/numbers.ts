import {ok as assert} from 'assert';

describe('Numbers', () => {
  it('that should look numeric', () => {
    assert(!isNaN(<any>'3'));
    assert(!isNaN(<any>'34'));
    assert(!isNaN(<any>'-1'));
    assert(!isNaN(<any>'100.0'));
    assert(!isNaN(3));
    assert(!isNaN(34));
    assert(!isNaN(-1));
    assert(!isNaN(100.0));
  });
  it('that should not look numeric', () => {
    assert(isNaN(<any>'3g'));
    assert(isNaN(<any>'10K'));
    assert(isNaN(<any>'four'));
    assert(isNaN(undefined));
    assert(isNaN(<any>'-5-6-8'));
  });
  it('that should not look numeric but do', () => {
    assert(!isNaN(null));
    assert(!isNaN(<any>false));
  });
});
