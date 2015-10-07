/// <reference path="DefinitelyTyped/async/async.d.ts" />
/// <reference path="DefinitelyTyped/chalk/chalk.d.ts" />
/// <reference path="DefinitelyTyped/mocha/mocha.d.ts" />
/// <reference path="DefinitelyTyped/node/node.d.ts" />
/// <reference path="DefinitelyTyped/object-assign/object-assign.d.ts" />
/// <reference path="DefinitelyTyped/unorm/unorm.d.ts" />

// self-declaring packages:
/// <reference path="../node_modules/academia/academia.d.ts" />
/// <reference path="../node_modules/adts/adts.d.ts" />
/// <reference path="../node_modules/afm/afm.d.ts" />
/// <reference path="../node_modules/arrays/arrays.d.ts" />
/// <reference path="../node_modules/lexing/lexing.d.ts" />
/// <reference path="../node_modules/loge/loge.d.ts" />
/// <reference path="../node_modules/unidata/unidata.d.ts" />
/// <reference path="../node_modules/visible/visible.d.ts" />

// common global types
interface ErrorCallback { (err?: Error): void }
interface StringMap { [index: string]: string; }
interface ErrorResultCallback<T> { (err?: Error, result?: T): void }
