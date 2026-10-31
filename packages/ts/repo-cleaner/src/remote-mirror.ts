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
 * `text` with every URL's credentials removed: the user-info before `@` in a
 * `scheme://` URL, and any query string or fragment. For a message or a name
 * that must not carry a token.
 */
export function redactUrl(text: string): string {
  return text
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, '$1')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#]*)[?#]\S*/gi, '$1')
}

/**
 * The directory name for `url`'s mirror: readable `host-owner-repo`, then a
 * hash of the whole URL so two URLs never share a mirror. The readable part
 * is read from the URL with its credentials, query and fragment removed, so a
 * token never reaches the name.
 */
export function mirrorName(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12)
  const parsed = parseRemoteRepo(redactUrl(url))
  const readable =
    parsed === null
      ? 'remote'
      : `${parsed.host}-${parsed.owner}-${parsed.repo}`.replace(UNSAFE, '-')
  return `${readable.replace(/^[.-]+/, '')}-${hash}`
}

/**
 * Why `dir` is not a mirror of `url` — or of whatever it was cloned from, when
 * `url` is omitted — or null when it is. A mirror's `origin` has one fetch URL
 * and pushes to that URL alone, so a delete cannot be sent elsewhere.
 */
export function mirrorProblem(
  dir: string,
  url?: string,
  opts: { git?: CommandRunner | undefined } = {},
): string | null {
  const git = new Git(dir, { runner: opts.git })
  const fetch = git.try.remoteGetUrls('origin')
  const push = git.try.remoteGetUrls('origin', { push: true })
  if (!fetch.ok || !push.ok) return `${dir} has no readable origin remote`
  const [from] = fetch.value
  if (fetch.value.length !== 1 || from === undefined) {
    return `${dir} has ${fetch.value.length} origin URLs`
  }
  if (url !== undefined && from !== url) return `${dir} is a mirror of another URL`
  if (push.value.length !== 1 || push.value[0] !== from) {
    return `${dir} pushes somewhere other than the URL it was cloned from`
  }
  return null
}

/**
 * The directory of `url`'s mirror under `cacheDir`, cloned on first use. An
 * existing mirror is reused as it is, once {@link mirrorProblem} finds
 * nothing wrong with it; the sweep's own fetch brings it up to date. A first
 * clone goes to a sibling directory and is renamed into place, so a clone
 * that fails leaves nothing behind. Messages carry the URL with its
 * credentials removed.
 *
 * @throws RemoteMirrorError when `url` is empty or looks like an option, when
 *   the clone fails, or when the directory is not a mirror of `url`.
 */
export function ensureMirror(
  url: string,
  cacheDir: string,
  opts: { git?: CommandRunner | undefined } = {},
): string {
  if (url === '' || url.startsWith('-')) {
    throw new RemoteMirrorError(`not a remote URL: ${JSON.stringify(redactUrl(url))}`)
  }
  const shown = redactUrl(url)
  const dir = join(cacheDir, mirrorName(url))
  if (existsSync(dir)) {
    const problem = mirrorProblem(dir, url, opts)
    if (problem !== null) {
      throw new RemoteMirrorError(
        `${problem}, not a mirror of ${shown}; remove the directory and run again`,
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
    throw new RemoteMirrorError(
      `cannot clone ${shown}: ${redactUrl(detail.split(url).join(shown)).trim()}`,
    )
  }
  return dir
}
