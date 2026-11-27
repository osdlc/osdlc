import { runFailed } from '@osdlc/command-seam'

import { CodeStatsError, commandError } from '../error.ts'
import { contentOf, DEFAULT_MAX_BYTES } from '../files/read.ts'
import type { FileContent } from '../types.ts'
import type { Repo } from './repo.ts'

/**
 * At most this much output per `cat-file --batch` run, so one run never meets
 * the runner's cap. A stream holds about one run's contents at once, and
 * larger runs read no faster.
 */
const BATCH_BYTES = 16_000_000

interface Sized {
  name: string
  sha: string
  bytes: number
}

/**
 * Reads objects by any name `git cat-file` takes: a sha or `rev:path`, with
 * the path relative to the repository root. One `--batch-check` run sizes
 * them all; objects over `maxBytes` are not read; the rest are read in as
 * few `--batch` runs as fit `batchBytes` (default {@link BATCH_BYTES}).
 */
export function readObjects(
  repo: Repo,
  names: readonly string[],
  maxBytes = DEFAULT_MAX_BYTES,
  batchBytes = BATCH_BYTES,
): Map<string, FileContent> {
  return new Map(streamObjects(repo, names, maxBytes, batchBytes))
}

/**
 * {@link readObjects} one name at a time, in the order given, repeats
 * included. Each `--batch` run is made when the first name it holds is
 * asked for, and a content is dropped after the last name that asks for it,
 * so about one run's contents are held at once.
 */
export function* streamObjects(
  repo: Repo,
  names: readonly string[],
  maxBytes = DEFAULT_MAX_BYTES,
  batchBytes = BATCH_BYTES,
): Generator<[string, FileContent]> {
  const lastAsked = new Map<string, number>()
  for (const [i, name] of names.entries()) lastAsked.set(name, i)
  const held = new Map<string, FileContent>()
  const sized: Sized[] = []
  const askable = [...lastAsked.keys()].filter((n) => {
    if (n.includes('\n')) held.set(n, { kind: 'missing' })
    return !n.includes('\n')
  })

  if (askable.length > 0) {
    const check = runCatFile(
      repo,
      ['--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      askable,
    )
    const rows = check.toString('utf8').split('\n')
    for (const [i, name] of askable.entries()) {
      const [sha, type, size] = (rows[i] ?? '').split(' ')
      if (sha === undefined || type !== 'blob' || size === undefined) {
        held.set(name, { kind: 'missing' })
        continue
      }
      const bytes = Number(size)
      if (bytes > maxBytes) held.set(name, { kind: 'too-large', bytes })
      else sized.push({ name, sha, bytes })
    }
  }

  // Batches follow first asks, so a name not yet held is in the next batch.
  const pending = batches(sized, batchBytes)
  for (const [i, name] of names.entries()) {
    if (!held.has(name)) {
      const next = pending.next()
      if (next.done === true) throw new CodeStatsError(`git cat-file did not read ${name}`)
      readBatch(repo, next.value, held)
    }
    yield [name, held.get(name) ?? { kind: 'missing' }]
    if (lastAsked.get(name) === i) held.delete(name)
  }
}

function readBatch(repo: Repo, batch: readonly Sized[], into: Map<string, FileContent>): void {
  const buf = runCatFile(
    repo,
    ['--batch'],
    batch.map((s) => s.sha),
  )
  let at = 0
  for (const s of batch) {
    const header = buf.indexOf(0x0a, at)
    if (header < 0) throw new CodeStatsError('git cat-file --batch ended early')
    at = header + 1
    into.set(s.name, contentOf(buf.subarray(at, at + s.bytes)))
    at += s.bytes + 1
  }
}

/** Reads of `<rev>:<path>` ({@link readObjects}), keyed by path. */
export function readAt(
  repo: Repo,
  rev: string,
  paths: readonly string[],
  maxBytes: number | undefined,
): Map<string, FileContent> {
  const contents = readObjects(
    repo,
    paths.map((p) => `${rev}:${p}`),
    maxBytes,
  )
  return new Map(paths.map((p) => [p, contents.get(`${rev}:${p}`) ?? { kind: 'missing' }]))
}

function* batches(items: readonly Sized[], limit: number): Generator<Sized[]> {
  let batch: Sized[] = []
  let bytes = 0
  for (const item of items) {
    if (batch.length > 0 && bytes + item.bytes > limit) {
      yield batch
      batch = []
      bytes = 0
    }
    batch.push(item)
    bytes += item.bytes + 100
  }
  if (batch.length > 0) yield batch
}

/** Raw `git cat-file`. typed-git's `catFileBatch` reads objects the same way; see docs/planning/tasks/T-01. */
function runCatFile(repo: Repo, flags: string[], names: readonly string[]): Buffer {
  const r = repo.gitBytes.run(['cat-file', ...flags], {
    cwd: repo.root,
    input: `${names.join('\n')}\n`,
  })
  if (runFailed(r)) throw commandError('git cat-file failed', r)
  return r.stdout
}
