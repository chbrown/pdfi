interface ErrorCallback { (err?: Error): void }
interface StringMap { [index: string]: string; }
interface ErrorResultCallback<T> { (err?: Error, result?: T): void }
