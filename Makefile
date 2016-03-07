BIN := node_modules/.bin
# TYPESCRIPT := $(shell find . -name '*.ts' -not -name '*.d.ts' -not -path '*/node_modules/*' | cut -c 3-)
TYPESCRIPT := $(shell jq -r '.files[]' tsconfig.json | grep -Fv .d.ts)

all: $(TYPESCRIPT:%.ts=%.js) $(TYPESCRIPT:%.ts=%.d.ts) .npmignore .gitignore

$(BIN)/tsc $(BIN)/_mocha $(BIN)/istanbul $(BIN)/coveralls:
	npm install

.npmignore: tsconfig.json
	echo $(TYPESCRIPT) Makefile tsconfig.json coverage/ | tr ' ' '\n' > $@

.gitignore: tsconfig.json
	echo $(TYPESCRIPT:%.ts=/%.js) $(TYPESCRIPT:%.ts=/%.d.ts) coverage/ | tr ' ' '\n' > $@

%.js: %.ts $(BIN)/tsc
	$(BIN)/tsc

%.js %.d.ts: %.ts $(BIN)/tsc
	$(BIN)/tsc -d

compile:
	$(BIN)/tsc -d

test: $(TYPESCRIPT:%.ts=%.js) $(BIN)/istanbul $(BIN)/_mocha $(BIN)/coveralls
	$(BIN)/istanbul cover $(BIN)/_mocha -- --compilers js:babel-core/register tests/ -R spec
	cat coverage/lcov.info | $(BIN)/coveralls || true

encoding/glyphlist.txt:
	# glyphlist.txt is pure ASCII
	curl -s http://partners.adobe.com/public/developer/en/opentype/glyphlist.txt >$@

encoding/additional_glyphlist.txt:
	curl -s https://raw.githubusercontent.com/apache/pdfbox/trunk/pdfbox/src/main/resources/org/apache/pdfbox/resources/glyphlist/additional.txt > $@

encoding/texglyphlist.txt:
	curl -s https://www.tug.org/texlive/Contents/live/texmf-dist/fonts/map/glyphlist/texglyphlist.txt > $@

# texglyphlist uses some unconventional characters, so we read the standard glyphlist last
encoding/glyphlist.ts: encoding/cmr-glyphlist.txt encoding/additional_glyphlist.txt \
                       encoding/texglyphlist.txt encoding/glyphlist.txt
	cat $^ | node dev/read_glyphlist.js >$@

encoding/latin_charset.ts: encoding/latin_charset.tsv
	# encoding/latin_charset.tsv comes from PDF32000_2008.pdf: Appendix D.2
	node dev/read_charset.js <$< >$@

clean:
	rm -f $(TYPESCRIPT:%.ts=%.d.ts) $(TYPESCRIPT:%.ts=%.js)
