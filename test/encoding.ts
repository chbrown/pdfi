import test from 'ava';

import {swapEndian} from '../util';

test('util should swap every two bytes in a Buffer', t => {
  const littleEndianWithBOM = Buffer.from('fffe680065006c006c006f00', 'hex');
  const swapped = swapEndian(littleEndianWithBOM);
  t.deepEqual(swapped.toString('hex'), 'feff00680065006c006c006f');
});

test('util should swap every two bytes in a Buffer except the last if there are an odd number of bytes', t => {
  const brokenLittleEndianWithBOM = Buffer.from('fffe680065006c006c006f', 'hex');
  const swapped = swapEndian(brokenLittleEndianWithBOM);
  t.deepEqual(swapped.toString('hex'), 'feff00680065006c006c6f');
});
