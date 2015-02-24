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
        yy.lexer.stream_length = $1.Length;
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
