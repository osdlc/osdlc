/**
 * The checkout as the flags see it: the paths git knows about, and their
 * contents read from disk once. The working directory is the checkout, so a
 * flag about a PR is only as good as the checkout being at (or near) its head;
 * the changed files themselves are always read at the head revision.
 */

import { lstatSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { createGroupClassifier, type FileGroup } from '../groups.ts'
import { detectLanguage } from '../scan/language.ts'
import { nodeGuard } from '@osdlc/path-guard/node'
import type { Git } from '@osdlc/typed-git'

/** Files larger than this are not parsed: a bundle or a data dump is not worth the time. */
const MAX_BYTES = 400_000

const classify = createGroupClassifier()

/**
 * The code-stats group of a path, by its name alone (no linguist attributes,
 * no content): enough to tell a test file from a source file among the
 * checkout's files, which the change's own report does not cover.
 */
export function groupOf(path: string): FileGroup {
  return classify({ path, category: detectLanguage(path)?.category ?? null })
}

export class Checkout {
  private listed: readonly string[] | undefined
  private readonly cache = new Map<string, string | null>()
  private readonly root: string

  constructor(
    readonly cwd: string,
    private readonly git: Git,
  ) {
    this.root = resolve(cwd)
  }

  /**
   * Tracked paths plus untracked, non-ignored ones: what a reader of the tree
   * can open. Listed on first use, so a change with no TypeScript never pays.
   */
  get files(): readonly string[] {
    if (this.listed === undefined) {
      this.listed = [
        ...new Set(this.git.lsFiles({ cached: true, others: true, excludeStandard: true })),
      ].sort()
    }
    return this.listed
  }

  /**
   * The file's text, or null when it is missing, unreadable, too large or not
   * a regular file. A symlink at the file itself is not followed, and a file
   * reached through a linked directory is read only when its real path is still
   * inside the checkout, so a tracked link cannot make the flags read a file
   * outside the repository.
   */
  read(path: string): string | null {
    if (this.cache.has(path)) return this.cache.get(path)!
    let text: string | null = null
    try {
      const full = join(this.root, path)
      const stat = lstatSync(full)
      if (stat.isFile() && stat.size <= MAX_BYTES && nodeGuard.contains(this.root, full)) {
        text = readFileSync(full, 'utf8')
      }
    } catch {
      // deleted in the working tree, or unreadable
    }
    this.cache.set(path, text)
    return text
  }
}
