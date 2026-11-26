/**
 * `@osdlc/code-stats/analysis`: the public API of a source file, and the parse it reads.
 *
 * `diffApi` compares two {@link ApiMap}s, names with their normalised signatures, and says what
 * a change added, removed or changed. `loadTypeScript` finds the optional `typescript` compiler
 * module and `parseSource` parses a file with it, for a caller that builds those maps from its own
 * declarations. Everything here is experimental: the shape may change in any release.
 */

export { diffApi, type ApiDelta, type ApiMap } from './api.ts'
export { loadTypeScript, parseSource } from './typescript.ts'
