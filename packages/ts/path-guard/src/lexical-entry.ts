// The `@osdlc/path-guard/lexical` entry. Nothing it loads may import `node:*`;
// tests/entry-imports.test.ts checks the import graph.
export { absolute, isUnder, toRelative, validateRelative } from './lexical.ts'
export { PathError, type PathErrorKind, type PathWarning } from './errors.ts'
