all: parsers/pdfobject.js parsers/xref.js

export PATH := node_modules/.bin:$(PATH)

parsers/xref.js: parsers/xref.pegjs
	pegjs $+ $@

parsers/pdfobject.js: parsers/pdfobject.pegjs
	pegjs $+ $@
