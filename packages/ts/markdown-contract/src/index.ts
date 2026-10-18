/**
 * `@osdlc/markdown-contract`: everything in `./core` (the parser, the contract builders, the
 * typed model and the read helpers) plus the folder runner, which reads files with Node.
 */
export * from './core/index.js'
export { defineConfig, runCorpus } from './runner/index.js'
export type { CorpusConfig, RunStats } from './runner/index.js'
