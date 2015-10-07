BIN := node_modules/.bin
TYPESCRIPT := $(wildcard *.ts encoding/*.ts filters/*.ts font/*.ts graphics/*.ts parsers/*.ts test/*.ts)
DTS := async/async mocha/mocha node/node chalk/chalk unorm/unorm object-assign/object-assign

all: $(TYPESCRIPT:%.ts=%.js) encoding/glyphlist.json

type_declarations: $(DTS:%=type_declarations/DefinitelyTyped/%.d.ts)

# $(BIN)/tsc --experimentalDecorators -m commonjs -t ES5 $<
%.js: %.ts type_declarations $(BIN)/tsc
	$(BIN)/tsc

# e.g., make -B type_declarations/DefinitelyTyped/async/async.d.ts
type_declarations/DefinitelyTyped/%:
	mkdir -p $(@D)
	curl -s https://raw.githubusercontent.com/chbrown/DefinitelyTyped/master/$* > $@

.PHONY: test
test: all
	$(BIN)/mocha --recursive test/

encoding/glyphlist.txt:
	# glyphlist.txt is pure ASCII
	curl -s http://partners.adobe.com/public/developer/en/opentype/glyphlist.txt >$@

encoding/additional_glyphlist.txt:
	curl -s https://raw.githubusercontent.com/apache/pdfbox/trunk/pdfbox/src/main/resources/org/apache/pdfbox/resources/glyphlist/additional.txt > $@

encoding/texglyphlist.txt:
	curl -s https://www.tug.org/texlive/Contents/live/texmf-dist/fonts/map/glyphlist/texglyphlist.txt > $@

# texglyphlist uses some unconventional characters, so we read the standard glyphlist last
encoding/glyphlist.json: encoding/cmr-glyphlist.txt encoding/additional_glyphlist.txt \
                         encoding/texglyphlist.txt encoding/glyphlist.txt
	cat $^ | node dev/read_glyphlist.js >$@

encoding/latin_charset.json: encoding/latin_charset.tsv
	# encoding/latin_charset.tsv comes from PDF32000_2008.pdf: Appendix D.2
	node dev/read_charset.js <$< >$@
