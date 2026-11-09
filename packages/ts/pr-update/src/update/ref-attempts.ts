/**
 * The failed-attempt record on git refs at a remote, so runs on different machines (CI jobs, a
 * laptop and a server) share it.
 *
 * One ref per repo, head branch and base branch, the same grouping the file store uses per file.
 * The ref's commit holds `{ entries }`, the file store's JSON, written with `@osdlc/ref-lease`.
 * Every write is a compare-and-swap. A lost swap re-reads the ref and applies the change again to
 * what is there now, up to {@link MAX_CAS_ATTEMPTS} times, so two runs that fail the same PR at
 * once both count. Records are read with one `fetchNamespace` the first time the store is used,
 * then served from that read and from this store's own writes.
 *
 * A remote that accepts only `refs/heads` and `refs/tags` refuses these writes. That surfaces as
 * a `GitFailed` that names the setting to fall back to (`attempts.store: file`).
 */

import {
  buildLeaseCommit,
  casCreate,
  casDelete,
  casReplace,
  CasFailed,
  fetchNamespace,
  fetchRef,
  GitFailed,
  RefNotFound,
} from '@osdlc/ref-lease'
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

function parseEntries(text: string | null): Entry[] {
  if (text === null) return []
  try {
    const entries = (JSON.parse(text) as { entries?: unknown }).entries
    return Array.isArray(entries) ? entries.filter(isEntry) : []
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

  /** Re-read one ref from the remote after a lost swap. */
  const refresh = (ref: string): void => {
    const groups = load()
    try {
      const got = fetchRef(remote, ref, gitOpts)
      groups.set(ref, { sha: got.sha, entries: readEntries(got.sha) })
    } catch (e) {
      if (e instanceof RefNotFound) groups.delete(ref)
      else throw withRefHint(e, remote)
    }
  }

  /**
   * Apply `change` to the ref's entries and write the result, again from a fresh read each time
   * the swap is lost. `change` returning an empty list deletes the ref.
   */
  const update = (ref: string, change: (entries: Entry[]) => Entry[]): void => {
    const groups = load()
    for (let attempt = 1; ; attempt++) {
      const current = groups.get(ref) ?? null
      const next = change(fresh(current?.entries ?? []))
      try {
        if (next.length === 0) {
          if (current !== null) casDelete(remote, ref, current.sha, gitOpts)
          groups.delete(ref)
          return
        }
        const sha = buildLeaseCommit(
          { entries: next },
          { ...gitOpts, parentSha: current?.sha ?? null },
        )
        if (current === null) casCreate(remote, ref, sha, gitOpts)
        else casReplace(remote, ref, current.sha, sha, gitOpts)
        groups.set(ref, { sha, entries: next })
        return
      } catch (e) {
        if (!(e instanceof CasFailed)) throw withRefHint(e, remote)
        if (attempt >= MAX_CAS_ATTEMPTS) {
          throw new Error(
            `attempt record ${ref} kept changing under this run (${MAX_CAS_ATTEMPTS} swaps lost)`,
            { cause: e },
          )
        }
        refresh(ref)
      }
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
