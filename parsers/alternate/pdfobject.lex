%x parens
%x reference
%x indirect

%%

"<"[A-Fa-f0-9]+">" return 'HEXSTRING'

"("           { this.pushState('parens'); return 'OPENPARENS'; }
<parens>"("   { this.pushState('parens'); return 'CHAR'; }
<parens>")"   {
                this.popState();
                // if we just popped all the way out of a parens state stack,
                // return CLOSEPARENS; else return CHAR
                // jison-lex needs simple return statements, so we don't use a
                // ternary conditional
                // return (this.topState() == 'INITIAL') ? 'CLOSEPARENS' : 'CHAR';
                if (this.topState() == 'INITIAL') {
                  return 'CLOSEPARENS';
                }
                return 'CHAR';
              }
<parens>.     { return 'CHAR'; }

"/"[!-'*-.0-;=?-Z\\^-z|~]+ { yytext = yytext.slice(1); return 'NAME'; }

/* not sure if there's a better way to avoid conflicts with plain integers */
[0-9]+\s+[0-9]+\s+"R"   { this.pushState('reference'); this.unput(yytext); return 'START_REFERENCE'; }
<reference>[0-9]+       { return 'DIGITS'; }
<reference>\s+          { }
<reference>"R"          { this.popState(); return 'END_REFERENCE'; }

[0-9]+\s+[0-9]+\s+"obj" { this.pushState('indirect'); this.unput(yytext); return 'START_INDIRECT_OBJECT_IDENTIFIER'; }
<indirect>[0-9]+        { return 'DIGITS'; }
<indirect>\s+           { }
<indirect>"obj"         { this.popState(); return 'START_INDIRECT_OBJECT'; }
"endobj"        return 'END_INDIRECT_OBJECT'

[0-9]+"."[0-9]+         { yytext = parseFloat(yytext);   return 'NUMBER'; }
[0-9]+                  { yytext = parseInt(yytext, 10); return 'NUMBER'; }

"true"          return 'TRUE'
"false"         return 'FALSE'

"<<"            return '<<'
">>"            return '>>'
"["             return '['
"]"             return ']'

\s+             { /* ignore whitespace */ }

<*><<EOF>>      return 'EOF'
