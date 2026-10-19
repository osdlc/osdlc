export { PathError, validateRelative, type PathErrorKind } from './lexical.ts'
export {
  canonicalExistingPrefix,
  contains,
  lexicalAbsolute,
  MAX_LINK_HOPS,
  nodeResolver,
  realpathOrSelf,
  resolveInside,
  tryResolveInside,
  type Resolver,
} from './resolve.ts'
export { toRelative } from './text.ts'
export {
  existingPathInside,
  isInside,
  openContainedFile,
  readContainedFile,
  realPathInside,
  type ContainedFile,
  type ContainedPath,
} from './contained.ts'
