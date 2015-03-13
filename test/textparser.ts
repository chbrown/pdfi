/// <reference path="../type_declarations/index.d.ts" />
import assert = require('assert');

var TextParser = require('../parsers/TextParser');

describe('TextParser', function() {

  it('should parse a simple text show operation', function() {
    var parser = new TextParser();

    var actual = parser.parseString('(Adjustments must ) Tj');
    var expected = [{text: 'Adjustments must '}];
    assert.deepEqual(actual, expected);
  });

  it('should parse a nested string', function() {
    var parser = new TextParser();

    var actual = parser.parseString('(In case of \\(dire\\) emergency) Tj');
    var expected = [{text: 'In case of (dire) emergency'}];
    assert.deepEqual(actual, expected);
  });

});
