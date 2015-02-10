PEG = $(wildcard parsers/*.pegjs)
TYPESCRIPT = $(wildcard *.ts dev/*.ts)

all: $(PEG:%.pegjs=%.js) $(TYPESCRIPT:%.ts=%.js)

%.js: %.pegjs
	node_modules/.bin/pegjs $+ $@

%.js: %.ts
	tsc -m commonjs -t ES5 $+

DT_GITHUB := https://raw.githubusercontent.com/borisyankov/DefinitelyTyped/master
DT_RAWGIT := https://rawgit.com/borisyankov/DefinitelyTyped/master

# e.g., make -B type_declarations/DefinitelyTyped/async/async.d.ts
type_declarations/DefinitelyTyped/%:
	mkdir -p $(shell dirname $@)
	curl $(DT_GITHUB)/$* > $@

.PHONY: external

EXTERNAL := async/async.d.ts lodash/lodash.d.ts mocha/mocha.d.ts node/node.d.ts yargs/yargs.d.ts chalk/chalk.d.ts
external: $(EXTERNAL:%=type_declarations/DefinitelyTyped/%)
