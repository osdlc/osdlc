/**
 * `@osdlc/command-seam/quote`: the quoting functions alone. Nothing here
 * imports from Node, so a browser bundle can use them.
 */

export { commandString, shellJoin, shellQuote, type CommandStringOptions } from './quote.ts'
