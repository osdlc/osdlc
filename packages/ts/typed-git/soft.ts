/**
 * The soft door's table — the one place that says which verbs have a
 * tolerant form and what they fall back to.
 *
 * Typed against `Git` and `AsyncGit` both, so adding a list-, nullable- or
 * boolean-returning verb to either client is a compile error here until it
 * is declared, and the two clients cannot grow different soft doors.
 * Mutations have no soft form, so `configRemoveSection` is not here.
 */

import type { AsyncGit } from './async.ts'
import type { SoftTableFor } from './outcome.ts'
import type { Git } from './sync.ts'

export const SOFT_TABLE = {
  showAtRev: 'null',
  revParse: 'null',
  resolveRef: 'null',
  hasHistory: 'false',
  headRef: 'null',
  topLevel: 'null',
  gitCommonDir: 'null',
  gitDir: 'null',
  symbolicRef: 'null',
  mainCheckout: 'null',
  currentBranch: 'null',
  statusPorcelain: 'empty',
  statusEntries: 'empty',
  isDirty: 'false',
  branches: 'empty',
  branchExists: 'false',
  worktrees: 'empty',
  mergeBase: 'null',
  logSubject: 'null',
  configGet: 'null',
  configGetAll: 'empty',
  configGetBool: 'null',
  objectExists: 'false',
  lsRemote: 'empty',
  lsFiles: 'empty',
  lsFilesTagged: 'empty',
  refs: 'empty',
  forEachRef: 'empty',
  diffNameOnly: 'empty',
  diffNameStatus: 'empty',
  logLines: 'empty',
  lsTree: 'empty',
  diffTree: 'empty',
  diffTreeNumstat: 'empty',
  grep: 'empty',
  isAncestor: 'false',
  remotes: 'empty',
  remote: 'empty',
  remoteGetUrl: 'null',
  remoteGetUrls: 'empty',
  remoteHead: 'null',
  remoteOwnerRepo: 'null',
  lsFilesUnmerged: 'empty',
  checkIgnoreVerbose: 'empty',
} as const satisfies SoftTableFor<Git> & SoftTableFor<AsyncGit>
