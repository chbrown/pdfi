import test from 'ava';

test('Numbers that should look numeric', t => {
  t.true(!isNaN('3' as any));
  t.true(!isNaN('34' as any));
  t.true(!isNaN('-1' as any));
  t.true(!isNaN('100.0' as any));
  t.true(!isNaN(3));
  t.true(!isNaN(34));
  t.true(!isNaN(-1));
  t.true(!isNaN(100.0));
});
test('Numbers that should not look numeric', t => {
  t.true(isNaN('3g' as any));
  t.true(isNaN('10K' as any));
  t.true(isNaN('four' as any));
  t.true(isNaN(undefined));
  t.true(isNaN('-5-6-8' as any));
});
test('Numbers that should not look numeric but do', t => {
  t.true(!isNaN(null));
  t.true(!isNaN(false as any));
});
