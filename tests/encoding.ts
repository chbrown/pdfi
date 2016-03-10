import {strictEqual} from 'assert';

import {swapEndian} from '../encoding/index';

describe('util', () => {
  it('should swap every two bytes in a Buffer', () => {
    const littleEndianWithBOM = new Buffer('fffe680065006c006c006f00', 'hex');
    const swapped = swapEndian(littleEndianWithBOM);
    strictEqual(swapped.toString('hex'), 'feff00680065006c006c006f');
  });

  it('should swap every two bytes in a Buffer except the last if there are an odd number of bytes', () => {
    const brokenLittleEndianWithBOM = new Buffer('fffe680065006c006c006f', 'hex');
    const swapped = swapEndian(brokenLittleEndianWithBOM);
    strictEqual(swapped.toString('hex'), 'feff00680065006c006c6f');
  });
});
