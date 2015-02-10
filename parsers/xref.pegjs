SECTION
  = "xref" NEWLINE subsections:SUBSECTION+ NEWLINE? {
      return Array.prototype.concat.apply([], subsections);
    }

SUBSECTION
  = object_number_start:INT SPACE+ number_of_objects:INT SPACE* objects:OBJECT+ {
      if (number_of_objects != objects.length) {
        var message = 'Expected the specified number of objects to be followed by that many objects. ' +
          'Instead, the subsection header specified ' + number_of_objects + ' but only contained ' +
          objects.length + ' objects.';
        expected(message);
      }
      // object_number
      for (var object_offset = 0; object_offset < objects.length; object_offset++) {
        objects[object_offset].object_number = object_number_start + object_offset;
      }
      return objects;
    }

OBJECT
  = NEWLINE offset:INT SPACE+ generation_number:INT SPACE+ use:[fn] SPACE* {
      return {
        offset: offset,
        generation_number: generation_number,
        in_use: use == 'n'
      };
    }

INT
  = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

SPACE
  = " "
  / "\t"

NEWLINE
  = "\r\n"
  / "\n"
  / "\r"
