import test from 'ava';

test('Numbers that should look numeric', t => {
  t.true(!isNaN(<any>'3'));
  t.true(!isNaN(<any>'34'));
  t.true(!isNaN(<any>'-1'));
  t.true(!isNaN(<any>'100.0'));
  t.true(!isNaN(3));
  t.true(!isNaN(34));
  t.true(!isNaN(-1));
  t.true(!isNaN(100.0));
});
test('Numbers that should not look numeric', t => {
  t.true(isNaN(<any>'3g'));
  t.true(isNaN(<any>'10K'));
  t.true(isNaN(<any>'four'));
  t.true(isNaN(undefined));
  t.true(isNaN(<any>'-5-6-8'));
});
test('Numbers that should not look numeric but do', t => {
  t.true(!isNaN(null));
  t.true(!isNaN(<any>false));
});
