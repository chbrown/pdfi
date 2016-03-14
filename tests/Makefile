BIN := ../node_modules/.bin
TYPESCRIPT := $(shell jq -r '.files[]' tsconfig.json | grep -Fv .d.ts)

all: $(TYPESCRIPT:%.ts=%.js) .gitignore

.gitignore: tsconfig.json
	echo $(TYPESCRIPT:%.ts=%.js) | tr ' ' '\n' > $@

%.js: %.ts $(BIN)/tsc
	$(BIN)/tsc

compile:
	$(BIN)/tsc

clean:
	rm -f $(TYPESCRIPT:%.ts=%.js)
