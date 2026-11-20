/**
 * What a sweep is asked to look at, checked before anything is read: the
 * kinds of row, the remote, the provider, the branch, and whether the targets
 * are remote URLs. A plan records the result.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { Git } from '@osdlc/typed-git'

import { resolveBranch } from './branches.ts'
import { PROVIDER_CHOICES } from './providers/index.ts'
import { isRemoteUrl } from './remote-mirror.ts'
import { expandTilde } from './resolve.ts'
import type { Runners, SweepOptions } from './sweep.ts'
import { KINDS, RepoCleanerError, type Kind, type SweptWith } from './types.ts'

const LOCAL: readonly Kind[] = ['worktree', 'branch']

/**
 * The sweep `targets` and `opts` ask for, as a plan records it. Throws a
 * {@link RepoCleanerError} for options that contradict each other or would
 * have no effect, before anything is read.
 */
export function sweptWith(
  targets: readonly string[],
  opts: Omit<
    SweepOptions,
    Exclude<keyof Runners, 'git'> | 'annotate' | 'onProgress' | 'onWarn' | 'cacheDir'
  >,
): SweptWith & { urls: boolean } {
  const cwd = opts.cwd ?? process.cwd()
  const conflict = (message: string): never => {
    throw new RepoCleanerError('conflict', message)
  }
  if (targets.some((t) => t.trim() === '')) {
    throw new RepoCleanerError('bad-input', 'a target is empty')
  }
  const only = opts.only === undefined ? undefined : [...new Set(opts.only)]
  const unknown = (only ?? []).filter((k) => !(KINDS as readonly string[]).includes(k))
  if (unknown.length > 0) {
    throw new RepoCleanerError(
      'bad-input',
      `unknown kind(s) ${unknown.join(', ')}: expected ${KINDS.join(', ')}`,
    )
  }
  if (only !== undefined && only.length === 0) {
    throw new RepoCleanerError('bad-input', 'only names no kind')
  }
  if (
    opts.provider !== undefined &&
    !(PROVIDER_CHOICES as readonly string[]).includes(opts.provider)
  ) {
    throw new RepoCleanerError('bad-input', `unknown provider ${JSON.stringify(opts.provider)}`)
  }

  const exists = (t: string): boolean => existsSync(resolve(cwd, expandTilde(t)))
  const isUrl = targets.map((t) => isRemoteUrl(t, exists))
  const urls = isUrl.some(Boolean)
  if (urls && !isUrl.every(Boolean)) {
    conflict('a remote URL target sweeps remote branches only; sweep it apart from checkouts')
  }
  if (urls && only !== undefined && only.some((k) => k !== 'remote')) {
    conflict(`a remote URL has only remote branches; drop --only ${only.join(',')}`)
  }
  if (urls && opts.branch !== undefined) {
    conflict('--branch reads one branch of a checkout; it does not take a remote URL')
  }
  if (urls && opts.offline === true) {
    conflict('a remote URL target is fetched to be swept; --offline would have no effect')
  }
  if (opts.branch !== undefined && targets.length > 1) {
    conflict(`--branch sweeps one repository; ${targets.length} targets given`)
  }
  const remote = urls || opts.remote === true || (only ?? []).includes('remote')
  if (opts.remote === true && only !== undefined && !only.includes('remote')) {
    conflict(`--remote includes remote branches, but --only ${only.join(',')} leaves them out`)
  }
  if (opts.offline === true && !remote) {
    conflict('--offline has no effect without --remote: nothing is fetched anyway')
  }
  if (opts.provider !== undefined && !remote) {
    conflict(
      '--provider has no effect without --remote: pull requests are looked up only for remote branches',
    )
  }
  const kinds: Kind[] = urls
    ? ['remote']
    : only !== undefined
      ? KINDS.filter((k) => only.includes(k))
      : remote
        ? [...LOCAL, 'remote']
        : [...LOCAL]
  // `HEAD` is the branch checked out at the target, resolved here so the
  // options checked before the sweep are the ones the plan records.
  let branch = opts.branch ?? null
  if (branch === 'HEAD') {
    const at = targets[0] === undefined ? cwd : resolve(cwd, expandTilde(targets[0]))
    try {
      branch = resolveBranch('HEAD', new Git(at, { runner: opts.git }))
    } catch (err) {
      throw new RepoCleanerError('conflict', err instanceof Error ? err.message : String(err))
    }
  }
  return {
    only: kinds,
    remote,
    offline: opts.offline === true,
    against: opts.against ?? null,
    provider: remote ? (opts.provider ?? 'auto') : 'none',
    branch,
    urls,
  }
}
