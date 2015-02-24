TYPESCRIPT = $(wildcard *.ts dev/*.ts readers/*.ts test/parsers/*.ts)
PARSERS = $(wildcard parsers/*.js)

all: $(TYPESCRIPT:%.ts=%.js) $(PARSERS)

# build the xref parser from TypeScript script
# parsers/xref.js: parsers/xref.ts
# 	tsc -m commonjs -t ES5 $+

# build the pdfobject parser script from Jison grammar
parsers/pdfobject.parser.js: parsers/pdfobject.jison
	node_modules/.bin/jison $+ -m commonjs -p lalr -o $@

# %.js: %.pegjs
# 	node_modules/.bin/pegjs $+ $@

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
