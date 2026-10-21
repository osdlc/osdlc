/**
 * A record of failed updates on disk, so a PR that failed is not retried with the same inputs on
 * every run.
 *
 * One file per repo, head branch and base branch (`<dir>/<repo>__<head>-<hash>.json`, the hash
 * over `repo\0head\0base`), i.e. one file per PR target, each written whole with an atomic write.
 * A failure at a new head or base sha replaces the file's entry rather than adding to it. Entries
 * older than 30 days are dropped on every write. A missing or unreadable file reads as empty, and
 * the next write replaces it.
 *
 * There is no lock. A host that runs at most one update per PR at a time has at most one writer
 * per file, since PRs with the same head but different bases have separate files. Two callers
 * updating the same PR at once can still lose one record; that is benign (one extra retry). The
 * earlier single `attempts.json` is not read and not deleted; its records are simply forgotten,
 * so each PR gets one fresh attempt.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { atomicWrite } from '@osdlc/etag-write'

import type { AttemptKey, AttemptRecord, AttemptStore } from '../ports.ts'

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface Entry extends AttemptKey, AttemptRecord {}

/** The directory a run rooted at `projectRoot` keeps its records in. */
export function attemptsDir(projectRoot: string): string {
  return join(projectRoot, '.pr-update', 'attempts')
}

/** The file holding the record of one PR target: `head` into `base` of `repo`. */
export function attemptFile(dir: string, repo: string, head: string, base: string): string {
  const safe = `${repo}__${head}`.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
  const hash = createHash('sha256').update(`${repo}\0${head}\0${base}`).digest('hex').slice(0, 10)
  return join(dir, `${safe}-${hash}.json`)
}

/** Every recorded failure under `dir`. */
export function listAttempts(dir: string): Entry[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names.filter((n) => n.endsWith('.json')).flatMap((n) => read(join(dir, n)))
}

function sameBranch(a: AttemptKey, b: Pick<AttemptKey, 'repo' | 'head'>): boolean {
  return a.repo === b.repo && a.head === b.head
}

function sameKey(a: AttemptKey, b: AttemptKey): boolean {
  return sameBranch(a, b) && a.base === b.base && a.headOid === b.headOid && a.baseOid === b.baseOid
}

function isEntry(e: unknown): e is Entry {
  if (typeof e !== 'object' || e === null) return false
  const o = e as Record<string, unknown>
  return (
    typeof o.repo === 'string' &&
    typeof o.head === 'string' &&
    typeof o.base === 'string' &&
    typeof o.at === 'string' &&
    typeof o.failures === 'number'
  )
}

function read(file: string): Entry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const entries = (parsed as { entries?: unknown }).entries
    if (!Array.isArray(entries)) return []
    return entries.filter(isEntry)
  } catch {
    return []
  }
}

function write(file: string, entries: readonly Entry[]): void {
  atomicWrite(file, `${JSON.stringify({ entries }, null, 2)}\n`)
}

export function fileAttemptStore(dir: string, opts: { now?: () => Date } = {}): AttemptStore {
  const now = opts.now ?? (() => new Date())
  const fresh = (entries: readonly Entry[]): Entry[] => {
    const cutoff = now().getTime() - MAX_AGE_MS
    return entries.filter((e) => Date.parse(e.at) >= cutoff)
  }
  return {
    get(key) {
      const hit = read(attemptFile(dir, key.repo, key.head, key.base)).find((e) => sameKey(e, key))
      return hit === undefined ? null : { failures: hit.failures, reason: hit.reason, at: hit.at }
    },
    recordFailure(key, reason) {
      const file = attemptFile(dir, key.repo, key.head, key.base)
      const entries = fresh(read(file))
      const prior = entries.find((e) => sameKey(e, key))
      const rest = entries.filter((e) => e.base !== key.base)
      rest.push({
        ...key,
        failures: (prior?.failures ?? 0) + 1,
        reason,
        at: now().toISOString(),
      })
      mkdirSync(dir, { recursive: true })
      write(file, rest)
    },
    clear(repo, head, base) {
      rmSync(attemptFile(dir, repo, head, base), { force: true })
    },
  }
}
