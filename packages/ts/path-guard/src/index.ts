// The `@osdlc/path-guard` entry. Nothing it loads may import `node:fs`; it may
// import `node:path`. tests/entry-imports.test.ts checks the import graph.
export * as lexical from './lexical.ts'
export { PathError, type PathErrorKind, type PathWarning } from './errors.ts'
export { PathGuard } from './guard.ts'
export { MAX_LINK_HOPS, type Resolver } from './resolve.ts'
