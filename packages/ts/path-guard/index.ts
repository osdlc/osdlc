export { PathError, validateRelative, type PathErrorKind } from './lexical.ts'
export {
  canonicalExistingPrefix,
  contains,
  lexicalAbsolute,
  MAX_LINK_HOPS,
  nodeResolver,
  realpathOrSelf,
  resolveInside,
  toRelative,
  tryResolveInside,
  type Resolver,
} from './resolve.ts'
export {
  existingPathInside,
  isInside,
  openContainedFile,
  readContainedFile,
  realPathInside,
  type ContainedFile,
  type ContainedPath,
} from './contained.ts'
