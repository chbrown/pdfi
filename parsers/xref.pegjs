SECTION
  = "xref" NEWLINE subsections:SUBSECTION+ NEWLINE? { return subsections; }

SUBSECTION
  = object_number_start:INT SPACE number_of_objects:INT objects:OBJECT+ {
      return {
        object_number_start: object_number_start,
        number_of_objects: number_of_objects,
        objects: objects
      };
    }

OBJECT
  = NEWLINE offset:INT SPACE generation_number:INT SPACE use:[fn] {
      return {
        offset: offset,
        generation_number: generation_number,
        in_use: use == 'n'
      };
    }

INT
  = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

SPACE
  = [ \t]+

NEWLINE
  = "\n"
  / "\r"
