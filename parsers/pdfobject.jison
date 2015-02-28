%start BODY

%%

BODY
    : OBJECT EOF { return $1 }
    | OBJECT OBJECT { return $1 }
    ;

OBJECT
    : STRING
    | NUMBER
    | REFERENCE
    | BOOLEAN
    | ARRAY
    | DICTIONARY
    | NAME
    | INDIRECT_OBJECT
    | STREAM
    | NULL
    | XREF
    | TRAILER
    ;

objects
    : OBJECT { $$ = [$1] }
    | objects OBJECT { $$ = $1; $1.push($2) }
    ;


ARRAY
    : "[" objects "]" { $$ = $2; }
    | "[" "]" { $$ = []; }
    ;


STRING
    : HEXSTRING
    | OPENPARENS CLOSEPARENS { $$ = "" }
    | OPENPARENS chars CLOSEPARENS { $$ = $2.join("") }
    ;

INDIRECT_OBJECT
    : INDIRECT_OBJECT_IDENTIFIER OBJECT END_INDIRECT_OBJECT {
        $$ = {
          object_number: $1.object_number,
          generation_number: $1.generation_number,
          value: $2,
        }
      }
    ;

STREAM_HEADER
    : DICTIONARY START_STREAM {
        // pretty ugly hack right here
        // yy is the Jison sharedState
        // yy.lexer is the JisonLexer-extends-BufferedLexer instance
        // yy.pdf_reader is the original pdf_reader instance
        yy.lexer.stream_length = yy.pdf_reader.resolveObject($1.Length);
      }
    ;

STREAM
    : STREAM_HEADER STREAM_BUFFER END_STREAM {
        $$ = { dictionary: $1, buffer: $2 }
      }
    ;


DICTIONARY
    : "<<" keyvaluepairs ">>" { $$ = $2 }
    ;

keyvaluepairs
    : NAME OBJECT                { $$ = {}; $$[$1] = $2; }
    | keyvaluepairs NAME OBJECT  { $$ = $1; $1[$2] = $3; }
    ;

chars
    : CHAR { $$ = [$1] }
    | chars CHAR { $$ = $1; $1.push($2) }
    ;

XREF
    : XREF_START XREF_SUBSECTIONS XREF_END {
        // produce single array
        $$ = Array.prototype.concat.apply([], $2);
      }
    ;

XREF_SUBSECTION
    : XREF_SUBSECTION_HEADER XREF_REFERENCES {
        $$ = $2;
        for (var i = 0; i < $$.length; i++) {
          $$[i].object_number = $1 + i;
        }
      }
    ;

XREF_SUBSECTIONS
    : XREF_SUBSECTION { $$ = [$1] }
    | XREF_SUBSECTIONS XREF_SUBSECTION { $$ = $1; $1.push($2) }
    ;

XREF_REFERENCES
    : XREF_REFERENCE { $$ = [$1] }
    | XREF_REFERENCES XREF_REFERENCE { $$ = $1; $1.push($2) }
    ;

TRAILER
    : TRAILER_START DICTIONARY TRAILER_STARTXREF NUMBER TRAILER_END {
        $$ = $2;
        $$.startxref = $4;
      }
    ;
