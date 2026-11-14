/**
 * The failed-attempt record on refs at a remote, so runs on different machines (CI jobs, a laptop
 * and a server) share it.
 *
 * One ref per repo, head branch and base branch, the same grouping the file store uses per file.
 * The ref's commit holds `{ entries }`, the file store's JSON. `@osdlc/ref-lease`'s `refStore`
 * does the ref names, the one fetch per run, the compare-and-swap writes with a re-read after a
 * lost swap (so two runs that fail the same PR at once both count) and the guarded delete. This
 * file holds only pr-update's record format, its merge rule and its stale rule.
 *
 * A remote that accepts only `refs/heads` and `refs/tags` refuses these writes. That surfaces as
 * a `GitFailed` that names the setting to fall back to (`attempts.store: file`).
 */

import { GitFailed, refKey, refStore } from '@osdlc/ref-lease'

import type { AttemptKey, AttemptRecord, AttemptStore } from '../ports.ts'
import { isEntry, MAX_AGE_MS, type Entry } from './attempts.ts'

/** The default prefix under which everything this package writes to a remote lives. */
export const DEFAULT_REF_PREFIX = 'refs/pr-update/'

/** The namespace of attempt records under `refPrefix`. */
export function attemptsPrefix(refPrefix: string): string {
  return `${refPrefix.replace(/\/+$/, '')}/attempts/`
}

/** The record key of one PR target: repo, head and base branch. */
const targetKey = (repo: string, head: string, base: string): string => `${repo}\0${head}\0${base}`

/** The readable part of a ref name: the repo and head of a record key. */
function labelOf(key: string): string {
  const [repo, head] = key.split('\0')
  return `${repo}__${head}`
}

/** The ref holding the failed-attempt record of one PR target, under an attempts prefix. */
export function attemptRef(prefix: string, repo: string, head: string, base: string): string {
  const key = targetKey(repo, head, base)
  return refKey(prefix, key, labelOf(key))
}

export interface RefAttemptStoreOptions {
  /** The git remote (name or URL) that holds the refs. */
  remote: string
  /** A checkout whose object store the commits are built in. */
  cwd: string
  /** Where attempt refs live. Default `refs/pr-update/attempts/`. */
  prefix?: string
  now?: () => Date
}

/** A store that can also drop records that are all stale. */
export interface RefAttemptStore extends AttemptStore {
  /** Delete every ref whose entries are all older than 30 days. */
  prune: () => void
}

/** Wrap a git failure with the causes a reader should check first. */
export function withRefHint(e: unknown, remote: string): unknown {
  if (!(e instanceof GitFailed)) return e
  return new GitFailed({
    op: e.op,
    exitCode: e.exitCode,
    stderr: e.stderr,
    cause: e,
    message:
      `${e.message}. The remote ${JSON.stringify(remote)} may refuse refs outside refs/heads and ` +
      'refs/tags (some hosts and branch-protection rules do), or be unreachable. To keep the ' +
      'record on local disk instead, set `attempts.store: file`.',
  })
}

function sameKey(a: AttemptKey, b: AttemptKey): boolean {
  return (
    a.repo === b.repo &&
    a.head === b.head &&
    a.base === b.base &&
    a.headOid === b.headOid &&
    a.baseOid === b.baseOid
  )
}

/** The ref's payload: the file store's `{ entries }`. */
interface Payload {
  entries: Entry[]
}

function decode(value: unknown): Payload {
  const entries = (value as { entries?: unknown } | null)?.entries
  return { entries: Array.isArray(entries) ? entries.filter(isEntry) : [] }
}

export function refAttemptStore(opts: RefAttemptStoreOptions): RefAttemptStore {
  const { remote } = opts
  const now = opts.now ?? (() => new Date())
  const store = refStore<Payload>({
    remote,
    cwd: opts.cwd,
    prefix: opts.prefix ?? attemptsPrefix(DEFAULT_REF_PREFIX),
    decode,
    label: labelOf,
  })
  const hint = <R>(run: () => R): R => {
    try {
      return run()
    } catch (e) {
      throw withRefHint(e, remote)
    }
  }
  const fresh = (entries: readonly Entry[]): Entry[] => {
    const cutoff = now().getTime() - MAX_AGE_MS
    return entries.filter((e) => Date.parse(e.at) >= cutoff)
  }

  return {
    get(key): AttemptRecord | null {
      const hit = hint(() => store.get(targetKey(key.repo, key.head, key.base)))?.entries.find(
        (e) => sameKey(e, key),
      )
      return hit === undefined ? null : { failures: hit.failures, reason: hit.reason, at: hit.at }
    },
    recordFailure(key, reason) {
      hint(() =>
        store.update(targetKey(key.repo, key.head, key.base), (current) => {
          const entries = fresh(current?.entries ?? [])
          const prior = entries.find((e) => sameKey(e, key))
          const rest = entries.filter((e) => e.base !== key.base)
          rest.push({
            ...key,
            failures: (prior?.failures ?? 0) + 1,
            reason,
            at: now().toISOString(),
          })
          return { entries: rest }
        }),
      )
    },
    clear(repo, head, base) {
      const key = targetKey(repo, head, base)
      if (hint(() => store.get(key)) === null) return
      hint(() => store.update(key, () => null))
    },
    prune() {
      // A ref whose entries are all stale is deleted, unless it was refreshed since it was loaded;
      // a mixed one is trimmed by its next write.
      hint(() => store.prune((p) => fresh(p.entries).length === 0))
    },
  }
}
