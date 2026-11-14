/**
 * Runs the file-lock conformance suite's cases against this package.
 *
 * `packages/conformance/file-lock/suite.json` is the family's suite, and this
 * package is its reference implementation. `conformance-write.ts` calls
 * {@link run} to write each case's `expect` or `error`, and
 * `conformance.test.ts` calls it to check them, so the two cannot drift.
 *
 * Each case runs in a fresh directory holding the lock `x.lock`, set up as
 * the case's `lock` and `markers` say. `packages/conformance/file-lock/README.md`
 * describes the result each section records.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { markerFor } from '../src/held.ts'
import {
  LockTimeoutError,
  claimLock,
  releaseLock,
  touchLock,
  untouchedFor,
  updateLock,
  withLock,
} from '../src/index.ts'

/** The suite file, by its path in the repository. */
export const SUITE_PATH = join(import.meta.dirname, '../../../conformance/file-lock/suite.json')

export interface Case {
  name: string
  input: Record<string, unknown>
  expect?: Record<string, unknown>
  error?: { kind: string; message?: string }
  platforms?: string[]
  skip?: Record<string, string>
}

export interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

/** What a case resolves to: the shape of its `expect`, or its `error`. */
export type Outcome = { expect: Record<string, unknown> } | { error: { kind: string } }

export function readSuite(): Suite {
  return JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite
}

/** The sections this runner knows. */
export const SECTIONS = ['marker_name', 'claim', 'release', 'touch', 'update', 'section']

/** A lock's text: a string, or `{ hex }` for bytes that are not UTF-8. */
type Raw = string | { hex: string }

function bytes(raw: Raw): Buffer {
  return typeof raw === 'string' ? Buffer.from(raw, 'utf8') : Buffer.from(raw.hex, 'hex')
}

/** The text an implementation reads from `raw`'s bytes. */
function text(raw: Raw): string {
  return bytes(raw).toString('utf8')
}

interface LockInput {
  raw: Raw
  ageMs: number
}

/** A lock file younger than this counts as fresh. */
const FRESH_MS = 5_000

/** The lock file every case works on. */
const LOCK = 'x.lock'

/** The suite's content rule: a JSON object whose `token`, if any, is a string. */
function parse(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const token = (value as { token?: unknown }).token
    return token === undefined || typeof token === 'string'
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** A fresh directory holding the case's lock and markers. */
function setUp(input: Record<string, unknown>): { dir: string; lock: string } {
  const dir = mkdtempSync(join(tmpdir(), 'file-lock-conformance-'))
  const lock = join(dir, LOCK)
  const before = input['lock'] as LockInput | null
  if (before !== null) {
    writeFileSync(lock, bytes(before.raw))
    const at = new Date(Date.now() - before.ageMs)
    utimesSync(lock, at, at)
  }
  for (const marker of (input['markers'] as Raw[] | undefined) ?? []) {
    writeFileSync(markerFor(lock, text(marker)), '')
  }
  return { dir, lock }
}

/** The lock afterwards and the other names in its directory. */
function after(
  dir: string,
  lock: string,
  input: Record<string, unknown>,
  ours?: string,
): Record<string, unknown> {
  const beside = readdirSync(dir)
    .filter((n) => n !== LOCK)
    .sort()
  if (!existsSync(lock)) return { after: null, beside }
  const raw = readFileSync(lock, 'utf8')
  let content = parse(raw)
  if (content !== null && ours !== undefined && content['token'] === ours) {
    content = { ...content, token: '<ours>' }
  }
  const before = input['lock'] as LockInput | null
  return {
    after: {
      content,
      unchanged: before !== null && raw === text(before.raw),
      fresh: Date.now() - statSync(lock).mtimeMs < FRESH_MS,
    },
    beside,
  }
}

/** Run one case of `section`, and give its outcome. */
export function run(section: string, input: Record<string, unknown>): Outcome {
  if (section === 'marker_name') {
    return { expect: { marker: markerFor(input['path'] as string, text(input['raw'] as Raw)) } }
  }
  const { dir, lock } = setUp(input)
  try {
    const token = input['token'] as string
    switch (section) {
      case 'claim': {
        const claim = claimLock(lock, input['content'] as object, {
          isStale: untouchedFor(input['staleMs'] as number),
        })
        const holder = claim.ok || claim.holder === null ? null : { content: claim.holder.content }
        return {
          expect: {
            claimed: claim.ok,
            holder,
            ...after(dir, lock, input, claim.ok ? claim.token : undefined),
          },
        }
      }
      case 'release':
        return { expect: { result: releaseLock(lock, token), ...after(dir, lock, input) } }
      case 'touch':
        return { expect: { result: touchLock(lock, token), ...after(dir, lock, input) } }
      case 'update': {
        const set = input['set'] as object
        const result = updateLock(lock, token, (c) => ({ ...c, ...set }))
        return { expect: { result, ...after(dir, lock, input) } }
      }
      case 'section': {
        let ran = false
        try {
          withLock(
            lock,
            () => {
              ran = true
            },
            { staleMs: input['staleMs'] as number, timeoutMs: input['timeoutMs'] as number },
          )
        } catch (err) {
          if (err instanceof LockTimeoutError) return { error: { kind: 'lock_timeout' } }
          throw err
        }
        return { expect: { ran, ...after(dir, lock, input) } }
      }
      default:
        throw new Error(`unknown section ${section}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
