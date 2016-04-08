BIN := node_modules/.bin
TYPESCRIPT := $(shell jq -r '.files[]' tsconfig.json | grep -Fv .d.ts)
SHELL := bash

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

dev:
	$(BIN)/tsc -d -w

test: $(TYPESCRIPT:%.ts=%.js) $(BIN)/istanbul $(BIN)/_mocha $(BIN)/coveralls
	$(MAKE) -C tests
	$(BIN)/istanbul cover $(BIN)/_mocha -- tests/ -R spec
	cat coverage/lcov.info | $(BIN)/coveralls || true

node_modules/pdfi-dev/build/glyphlist.ts node_modules/pdfi-dev/build/glyphmaps.ts:
	npm install

encoding/glyphlist.ts: node_modules/pdfi-dev/build/glyphlist.ts
	cp $< $@

encoding/glyphmaps.ts: node_modules/pdfi-dev/build/glyphmaps.ts
	cp $< $@

clean:
	$(MAKE) -C tests
	rm -f $(TYPESCRIPT:%.ts=%.d.ts) $(TYPESCRIPT:%.ts=%.js)
