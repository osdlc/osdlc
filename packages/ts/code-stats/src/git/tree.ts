import { guardCommand } from '../error.ts'
import {
  attributeDirs,
  infoAttributes,
  linguistAttributesFrom,
  readLinguistAttributes,
} from '../files/attributes.ts'
import type { LinguistAttributes } from '../types.ts'
import { readAt } from './blobs.ts'
import type { Repo } from './repo.ts'

/** A regular file in a commit's tree. */
export interface TreeFile {
  path: string
  sha: string
}

const REGULAR_FILE = new Set(['100644', '100755'])

/** The regular files of `rev` under `paths` (pathspecs; empty is the whole tree). Symlinks and submodules are left out. */
export function listTree(repo: Repo, rev: string, paths: readonly string[]): TreeFile[] {
  const entries = guardCommand(`could not list ${rev}`, () =>
    repo.git.lsTree(rev, { recursive: true, paths: [...paths] }),
  )
  return entries
    .filter((e) => e.type === 'blob' && REGULAR_FILE.has(e.mode))
    .map((e) => ({ path: e.path, sha: e.sha }))
}

const attributesFileIn = (dir: string): string =>
  dir === '' ? '.gitattributes' : `${dir}/.gitattributes`

/**
 * The linguist attributes of `paths` at `rev`, or in the working tree when
 * `rev` is null, from the `.gitattributes` files and the git directory's
 * `info/attributes` (see {@link linguistAttributesFrom}). At a commit, the
 * `.gitattributes` files that can apply are read in one batch, so it needs
 * no particular git version.
 */
export function linguistAttributes(
  repo: Repo,
  paths: readonly string[],
  rev: string | null,
): Map<string, LinguistAttributes> {
  if (rev === null) return readLinguistAttributes(repo.root, paths)
  const files = readAt(repo, rev, attributeDirs(paths).map(attributesFileIn), undefined)
  const textIn = (dir: string): string | null => {
    const c = files.get(attributesFileIn(dir))
    return c?.kind === 'text' ? c.text : null
  }
  return linguistAttributesFrom(paths, textIn, infoAttributes(repo.root))
}
