// The `@osdlc/path-guard/lexical` entry. Nothing it loads may import `node:*`;
// tests/lexical-entry.test.ts checks the built graph.
export { PathError, isUnder, toRelative, validateRelative, type PathErrorKind } from './lexical.ts'
