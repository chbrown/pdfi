{
  function objectFromPairs(pairs) {
    var obj = {};
    for (var i = 0; i < pairs.length; i++) {
      obj[pairs[i][0]] = pairs[i][1];
    }
    return obj;
  }
}

OBJECT
  = array:ARRAY { return array; }
  / indirect_object:INDIRECTOBJECT { return indirect_object; }
  / reference:REFERENCE { return reference; }
  / dictionary:DICTIONARY { return dictionary; }
  / string:STRING { return string; }
  / name:NAME { return name; }
  / number:NUMBER { return number; }

INDIRECTOBJECT
  = object_number:INT SPACE+ generation_number:INT SPACE+ "obj" SPACE+ value:OBJECT SPACE* {
    return {
      object_number: object_number,
      generation_number: generation_number,
      value: value
    };
  }

OBJECTSPACE
  = object:OBJECT SPACE* { return object; }

ARRAY
  = "[" SPACE* objects:OBJECTSPACE* SPACE* "]" { return objects; }

// [!-~] are the "regular characters" (PDF32000_2008.pdf:17)
// TODO: replace #-escaped characters
NAME
  = "/" name:[!-'*-.0-;=?-Z\\^-z|~]+ { return name.join(""); }

DICTIONARY
  = "<<" SPACE* keyvaluepairs:KEYVALUEPAIR+ ">>" {
    return objectFromPairs(keyvaluepairs);
  }

KEYVALUEPAIR
  = name:NAME SPACE* value:OBJECT SPACE+ {
    return [name, value];
  }

STRING
  = "(" prefix:[^(]+ "(" middle:STRING ")" postfix:[^)] ")" {
    return prefix.join("") + middle + postfix.join("");
  }
  / "(" chars:[^()]+ ")" {
    return chars.join("");
  }
  / "<" chars:HEXBYTE+ ">" {
    return chars;
  }

REFERENCE
  = object_number:INT SPACE+ generation_number:INT SPACE+ "R" {
    return {
      object_number: object_number,
      generation_number: generation_number
    };
  }

NUMBER
  = number:INT { return number; }
  / number:FLOAT { return number; }

INT
  = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

// TODO: handle implied final 0 (PDF32000_2008.pdf:16)
HEXBYTE
  = a:[A-Fa-f0-9] b:[A-Fa-f0-9] { return parseInt(a + b, 16); }

FLOAT
  = characteristic:[0-9]+ "." mantissa:[0-9]+ {
    return parseFloat(characteristic.join("") + "." + mantissa.join(""));
  }

BOOLEAN
  = "true" { return true; }
  / "false" { return false; }

SPACE
  = " "
  / "\t"
  / "\n"
  / "\r"
