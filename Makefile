BIN := node_modules/.bin
TYPESCRIPT := $(shell jq -r '.files[] | select(test("node_modules") | not)' tsconfig.json)
JAVASCRIPT := $(TYPESCRIPT:%.ts=%.js)

all: $(JAVASCRIPT)

%.js: %.ts $(BIN)/tsc
	$(BIN)/tsc

.PHONY: test
test: $(BIN)/mocha
	$(BIN)/mocha --compilers js:babel-core/register --recursive test/

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
