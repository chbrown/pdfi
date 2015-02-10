all: parsers/pdfobject.js parsers/xref.js

export PATH := node_modules/.bin:$(PATH)

%.js: %.pegjs
	pegjs $+ $@
