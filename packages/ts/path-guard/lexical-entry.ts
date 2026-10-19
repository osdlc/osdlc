// The `@osdlc/path-guard/lexical` entry: the text-only checks. Nothing here
// loads `node:*`, so it is safe in a browser bundle.
export { PathError, validateRelative, type PathErrorKind } from './lexical.ts'
export { isUnder, toRelative } from './text.ts'
