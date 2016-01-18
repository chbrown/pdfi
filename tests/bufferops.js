import assert from 'assert';
import {describe, it} from 'mocha';

import bufferops from '../bufferops';

describe('bufferops', () => {
  describe('#compare', () => {
    var haystack = new Buffer('<< /Name (hello) >>');
    it('should start with <<', () => {
      assert(bufferops.compare(haystack, new Buffer('<<')));
    });
    it('should not start with "other"', () => {
      assert.equal(bufferops.compare(haystack, new Buffer('other')), false);
    });
  });

  describe('#indexOf', () => {
    var haystack = new Buffer('<< /Name (hello) >>');
    it('should have hello at index 0', () => {
      assert.equal(bufferops.indexOf(haystack, new Buffer('hello')), 10);
    });
    it('should not have other at index 0', () => {
      assert.equal(bufferops.indexOf(haystack, new Buffer('other')), null);
    });
  });

  describe('#equalTo', () => {
    var haystack = new Buffer('hello world');
    it('should equal hello at 0:5', () => {
      assert.equal(bufferops.equalTo(haystack, new Buffer('hello'), 0, 5), true);
    });
    it('should equal he at 0:2', () => {
      assert.equal(bufferops.equalTo(haystack, new Buffer('he'), 0, 2), true);
    });
    it('should not equal world at index 0:5', () => {
      assert.equal(bufferops.equalTo(haystack, new Buffer('world'), 0, 5), false);
    });
  });
});
