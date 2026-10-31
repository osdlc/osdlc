/**
 * Sweep a remote with no checkout of your own: a clone of it, kept in
 * repo-cleaner's cache directory, stands in for the checkout.
 *
 * The clone is `--no-checkout`, so no files are written outside `.git`. It is
 * not a partial (`--filter=blob:none`) clone: the patch comparison that
 * finds squash-merged branches reads file contents, and a partial clone
 * fetches them over the network one comparison at a time, which made a sweep
 * of a few hundred branches take minutes instead of seconds. It is kept
 * rather than thrown away so a plan written from it can be applied later: the
 * plan names the clone's directory, and `apply` re-sweeps and pushes deletes
 * from there. A later run reuses it, and the sweep's fetch brings it up to
 * date.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'
import { Git, parseRemoteRepo } from '@osdlc/typed-git'

/** A remote URL that cannot be mirrored, or a mirror that cannot be made or reused. */
export class RemoteMirrorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RemoteMirrorError'
  }
}

/** Characters kept in a directory name; anything else becomes `-`. */
const UNSAFE = /[^A-Za-z0-9._-]+/g

/**
 * The directory name for `url`'s mirror: readable `host-owner-repo`, then a
 * hash of the whole URL so two URLs never share a mirror. The URL itself,
 * which can hold a token, never appears in the name.
 */
export function mirrorName(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12)
  const parsed = parseRemoteRepo(url)
  const readable =
    parsed === null
      ? 'remote'
      : `${parsed.host}-${parsed.owner}-${parsed.repo}`.replace(UNSAFE, '-')
  return `${readable.replace(/^[.-]+/, '')}-${hash}`
}

/**
 * The directory of `url`'s mirror under `cacheDir`, cloned on first use. An
 * existing mirror is reused as it is; the sweep's own fetch brings it up to
 * date. A first clone goes to a sibling directory and is renamed into place,
 * so a clone that fails leaves nothing behind.
 *
 * @throws RemoteMirrorError when `url` is empty or looks like an option, when
 *   the clone fails, or when the directory holds a mirror of another URL.
 */
export function ensureMirror(
  url: string,
  cacheDir: string,
  opts: { git?: CommandRunner | undefined } = {},
): string {
  if (url === '' || url.startsWith('-')) {
    throw new RemoteMirrorError(`not a remote URL: ${JSON.stringify(url)}`)
  }
  const dir = join(cacheDir, mirrorName(url))
  if (existsSync(dir)) {
    const origin = new Git(dir, { runner: opts.git }).try.remoteGetUrl('origin')
    if (!origin.ok || origin.value !== url) {
      throw new RemoteMirrorError(
        `${dir} is not a mirror of ${url}; remove the directory and run again`,
      )
    }
    return dir
  }
  mkdirSync(dirname(dir), { recursive: true })
  const staging = `${dir}.partial-${process.pid}`
  rmSync(staging, { recursive: true, force: true })
  try {
    new Git(dirname(dir), { runner: opts.git }).rawChecked([
      'clone',
      '--quiet',
      '--no-checkout',
      '--',
      url,
      staging,
    ])
    renameSync(staging, dir)
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    const detail =
      (err as { failure?: { detail?: string } }).failure?.detail ??
      (err instanceof Error ? err.message : String(err))
    throw new RemoteMirrorError(`cannot clone ${url}: ${detail.trim()}`)
  }
  return dir
}
