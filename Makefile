TYPESCRIPT = $(wildcard *.ts bin/*.ts parsers/*.ts filters/*.ts test/*.ts)

all: $(TYPESCRIPT:%.ts=%.js)

# build the pdfobject parser script from Jison grammar
# parsers/pdfobject.parser.js: parsers/pdfobject.jison
# 	node_modules/.bin/jison $+ -m commonjs -p lalr -o $@

%.js: %.ts
	node_modules/.bin/tsc -m commonjs -t ES5 $+

DT_GITHUB := https://raw.githubusercontent.com/borisyankov/DefinitelyTyped/master

# e.g., make -B type_declarations/DefinitelyTyped/async/async.d.ts
type_declarations/DefinitelyTyped/%:
	mkdir -p $(shell dirname $@)
	curl $(DT_GITHUB)/$* > $@

.PHONY: external

EXTERNAL := async/async.d.ts lodash/lodash.d.ts mocha/mocha.d.ts node/node.d.ts yargs/yargs.d.ts chalk/chalk.d.ts
external: $(EXTERNAL:%=type_declarations/DefinitelyTyped/%)

test: all
	node_modules/.bin/mocha --recursive test/

encoding/glyphlist.txt:
	# glyphlist.txt is pure ASCII
	curl -s http://partners.adobe.com/public/developer/en/opentype/glyphlist.txt >$@

encoding/additional_glyphlist.txt:
	curl -s https://raw.githubusercontent.com/apache/pdfbox/trunk/pdfbox/src/main/resources/org/apache/pdfbox/resources/glyphlist/additional.txt > $@

encoding/texglyphlist.txt:
	curl -s https://www.tug.org/texlive/Contents/live/texmf-dist/fonts/map/glyphlist/texglyphlist.txt > $@

# texglyphlist uses some unconventional characters, so we read the standard glyphlist last
encoding/glyphlist.json: encoding/additional_glyphlist.txt encoding/texglyphlist.txt encoding/glyphlist.txt
	cat $^ | node dev/read_glyphlist.js >$@

encoding/latin_charset.json: encoding/latin_charset.tsv
	# encoding/latin_charset.tsv comes from PDF32000_2008.pdf: Appendix D.2
	node dev/read_charset.js <$< >$@
