/**
 * The failed-attempt record on git refs at a remote, so runs on different machines (CI jobs, a
 * laptop and a server) share it.
 *
 * One ref per repo, head branch and base branch, the same grouping the file store uses per file.
 * The ref's commit holds `{ entries }`, the file store's JSON, written with `@osdlc/ref-lease`.
 * Every write is a compare-and-swap. A lost swap re-reads the ref and applies the change again to
 * what is there now (`updateWithRetry`, up to {@link MAX_CAS_ATTEMPTS} times), so two runs that fail the same PR at
 * once both count. Records are read with one `fetchNamespace` the first time the store is used,
 * then served from that read and from this store's own writes.
 *
 * A remote that accepts only `refs/heads` and `refs/tags` refuses these writes. That surfaces as
 * a `GitFailed` that names the setting to fall back to (`attempts.store: file`).
 */

import { fetchNamespace, GitFailed, updateWithRetry } from '@osdlc/ref-lease'
import { Git } from '@osdlc/typed-git'

import type { AttemptKey, AttemptRecord, AttemptStore } from '../ports.ts'
import { isEntry, MAX_AGE_MS, type Entry } from './attempts.ts'
import { attemptRef, attemptsPrefix, DEFAULT_REF_PREFIX, MAX_CAS_ATTEMPTS } from './ref-names.ts'

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

interface Group {
  sha: string
  entries: Entry[]
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

function entriesOf(value: unknown): Entry[] {
  const entries = (value as { entries?: unknown } | null)?.entries
  return Array.isArray(entries) ? entries.filter(isEntry) : []
}

const decode = (value: unknown): Payload => ({ entries: entriesOf(value) })

function parseEntries(text: string | null): Entry[] {
  if (text === null) return []
  try {
    return entriesOf(JSON.parse(text))
  } catch {
    return []
  }
}

export function refAttemptStore(opts: RefAttemptStoreOptions): RefAttemptStore {
  const { remote, cwd } = opts
  const prefix = opts.prefix ?? attemptsPrefix(DEFAULT_REF_PREFIX)
  const now = opts.now ?? (() => new Date())
  const repo = new Git(cwd)
  const gitOpts = { cwd }
  /** ref -> its state at the remote as far as this store knows. */
  let cache: Map<string, Group> | null = null

  const readEntries = (sha: string): Entry[] => {
    const shown = repo.try.showAtRev(sha, 'lease.json')
    return shown.ok ? parseEntries(shown.value) : []
  }

  const load = (): Map<string, Group> => {
    if (cache !== null) return cache
    const loaded = new Map<string, Group>()
    try {
      const refs = fetchNamespace(remote, prefix, gitOpts)
      for (const [ref, sha] of Object.entries(refs)) {
        loaded.set(ref, { sha, entries: readEntries(sha) })
      }
    } catch (e) {
      throw withRefHint(e, remote)
    }
    cache = loaded
    return loaded
  }

  const fresh = (entries: readonly Entry[]): Entry[] => {
    const cutoff = now().getTime() - MAX_AGE_MS
    return entries.filter((e) => Date.parse(e.at) >= cutoff)
  }

  /**
   * Apply `change` to the ref's fresh entries and write the result. `@osdlc/ref-lease` re-reads
   * and calls `change` again after a lost swap, so a concurrent record is merged, not lost. An
   * empty result deletes the ref.
   */
  const update = (ref: string, change: (entries: Entry[]) => Entry[]): void => {
    const groups = load()
    try {
      const out = updateWithRetry<Payload>(
        remote,
        ref,
        (current) => {
          const next = change(fresh(current?.payload.entries ?? []))
          return next.length === 0 ? null : { entries: next }
        },
        { ...gitOpts, decode, attempts: MAX_CAS_ATTEMPTS },
      )
      if (out.kind === 'written') groups.set(ref, { sha: out.sha, entries: out.payload.entries })
      else groups.delete(ref)
    } catch (e) {
      throw withRefHint(e, remote)
    }
  }

  return {
    get(key): AttemptRecord | null {
      const ref = attemptRef(prefix, key.repo, key.head, key.base)
      const hit = load()
        .get(ref)
        ?.entries.find((e) => sameKey(e, key))
      return hit === undefined ? null : { failures: hit.failures, reason: hit.reason, at: hit.at }
    },
    recordFailure(key, reason) {
      update(attemptRef(prefix, key.repo, key.head, key.base), (entries) => {
        const prior = entries.find((e) => sameKey(e, key))
        const rest = entries.filter((e) => e.base !== key.base)
        rest.push({
          ...key,
          failures: (prior?.failures ?? 0) + 1,
          reason,
          at: now().toISOString(),
        })
        return rest
      })
    },
    clear(repoSlug, head, base) {
      const ref = attemptRef(prefix, repoSlug, head, base)
      if (!load().has(ref)) return
      update(ref, () => [])
    },
    prune() {
      // A ref whose entries are all stale is deleted (`update` hands over only the fresh ones, read
      // again after a lost swap, so a record refreshed meanwhile survives); a mixed one is trimmed by its next write.
      for (const [ref, g] of [...load()]) {
        if (fresh(g.entries).length === 0) update(ref, (entries) => entries)
      }
    },
  }
}
