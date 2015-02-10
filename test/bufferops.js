/*jslint node: true */ /*globals describe, it */
var assert = require('assert');
var bufferops = require('../bufferops');

describe('bufferops', function() {
  describe('#compare', function() {
    var haystack = new Buffer('<< /Name (hello) >>');
    it('should start with <<', function() {
      assert(bufferops.compare(haystack, new Buffer('<<')));
    });
    it('should not start with "other"', function() {
      assert.equal(bufferops.compare(haystack, new Buffer('other')), false);
    });
  });

  describe('#indexOf', function() {
    var haystack = new Buffer('<< /Name (hello) >>');
    it('should have hello at index 0', function() {
      assert.equal(bufferops.indexOf(haystack, new Buffer('hello')), 10);
    });
    it('should not have other at index 0', function() {
      assert.equal(bufferops.indexOf(haystack, new Buffer('other')), null);
    });
  });

  describe('#equalTo', function() {
    var haystack = new Buffer('hello world');
    it('should equal hello at 0:5', function() {
      assert.equal(bufferops.equalTo(haystack, new Buffer('hello'), 0, 5), true);
    });
    it('should equal he at 0:2', function() {
      assert.equal(bufferops.equalTo(haystack, new Buffer('he'), 0, 2), true);
    });
    it('should not equal world at index 0:5', function() {
      assert.equal(bufferops.equalTo(haystack, new Buffer('world'), 0, 5), false);
    });
  });
});
