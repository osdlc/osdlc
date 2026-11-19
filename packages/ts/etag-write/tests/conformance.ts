/**
 * Runs the etag-write conformance suite's cases against this package.
 *
 * `packages/conformance/etag-write/suite.json` is the family's suite, and this
 * package is its reference implementation. `conformance-write.ts` calls
 * {@link run} to write each case's `expect` or `error`, and
 * `conformance.test.ts` calls it to check them, so the two cannot drift.
 */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  WriteConflictError,
  atomicWrite,
  etag,
  etagOfFile,
  writeCas,
  writeIfChanged,
} from '../src/index.ts'

/** The suite file, by its path in the repository. */
export const SUITE_PATH = join(import.meta.dirname, '../../../conformance/etag-write/suite.json')

export interface Case {
  name: string
  input: Record<string, unknown>
  expect?: Record<string, unknown>
  /** The kind only: the two implementations' messages differ by design, so a case sets none. */
  error?: { kind: string }
  platforms?: string[]
  skip?: Record<string, string>
}

export interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

/** What a case gives: its `expect`, or its `error`. */
export type Outcome = { expect: Record<string, unknown> } | { error: { kind: string } }

export function readSuite(): Suite {
  return JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite
}

/** The keys a case may set. */
export const CASE_KEYS = ['name', 'input', 'expect', 'error', 'platforms', 'skip']

/** Every section this implementation runs, with the keys its `input` may hold. */
export const INPUT_KEYS: Record<string, string[]> = {
  etag: ['data'],
  etag_of_file: ['existing'],
  write_cas: ['existing', 'expectedEtag', 'content'],
  write_if_changed: ['existing', 'content'],
  write_atomic: ['existing', 'path', 'content'],
  write_atomic_mode: ['existingMode', 'content'],
}

/**
 * Throws unless `section` is one this implementation runs and `raw` holds only
 * the keys that section's `input` may hold.
 */
export function checkInput(section: string, raw: Record<string, unknown>): void {
  const allowed = INPUT_KEYS[section]
  if (allowed === undefined) {
    throw new Error(`the suite has a section this implementation does not know: ${section}`)
  }
  const unknown = Object.keys(raw).filter((k) => !allowed.includes(k))
  if (unknown.length > 0) throw new Error(`${section}: unknown input keys ${unknown.join(', ')}`)
}

/** Bytes: text, taken as UTF-8, or `{ hex }` for bytes that are not text. */
type Data = string | { hex: string }
/** What is at the target path before a case runs. Absent means nothing. */
type Existing = Data | { directory: true }
/** An etag to send: none, a literal, or the etag of some data. */
type Sent = null | string | { etagOf: Data }

const toBytes = (d: Data): Buffer =>
  typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(d.hex, 'hex')

/** Text when `bytes` are UTF-8, else `{ hex }`, as the suite spells them. */
function fromBytes(bytes: Buffer): Data {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return { hex: bytes.toString('hex') }
  }
}

const sent = (s: Sent): string | null =>
  s === null || typeof s === 'string' ? s : etag(toBytes(s.etagOf))

const DEFAULT_PATH = 'target.txt'

/** Every file and directory under `root`, sorted and `/`-separated. */
function entries(root: string, rel = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(root, rel)).sort()) {
    const path = rel === '' ? name : `${rel}/${name}`
    out.push(path)
    if (statSync(join(root, path)).isDirectory()) out.push(...entries(root, path))
  }
  return out.sort()
}

/** Builds `existing` at `path` under a fresh scratch directory, runs `body`, and removes it. */
function inScratch<T>(
  path: string,
  existing: Existing | undefined,
  body: (target: string, scratch: string) => T,
): T {
  const scratch = mkdtempSync(join(tmpdir(), 'etag-write-conformance-'))
  try {
    const target = join(scratch, path)
    if (existing !== undefined) {
      mkdirSync(join(target, '..'), { recursive: true })
      if (typeof existing === 'object' && 'directory' in existing) mkdirSync(target)
      else writeFileSync(target, toBytes(existing))
    }
    return body(target, scratch)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** `{ expect: shape(value) }`, or `{ error }` for a refusal or a failed filesystem call. */
function outcome<T>(call: () => T, shape: (value: T) => Record<string, unknown>): Outcome {
  let value: T
  try {
    value = call()
  } catch (e) {
    if (e instanceof WriteConflictError) {
      return { error: { kind: e.reason === 'changed' ? 'changed' : 'exists_without_etag' } }
    }
    if (typeof (e as NodeJS.ErrnoException).code === 'string') return { error: { kind: 'io' } }
    throw e
  }
  return { expect: shape(value) }
}

/** The file at `target` afterwards. */
const contentOf = (target: string) => fromBytes(readFileSync(target))

/** Throws unless `scratch` holds exactly `want`: no temp file is left beside the target. */
function assertEntries(scratch: string, want: string[], name: string): void {
  const got = entries(scratch)
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(
      `${name}: expected ${JSON.stringify(want)} under the scratch directory, got ${JSON.stringify(got)}`,
    )
  }
}

interface Input {
  data: Data
  existing: Existing
  expectedEtag: Sent
  content: Data
  path: string
  existingMode: string
}

/** The outcome this package gives for one case of a section, on this host. */
export function run(section: string, raw: Record<string, unknown>): Outcome {
  checkInput(section, raw)
  const input = raw as unknown as Partial<Input>
  switch (section) {
    case 'etag':
      return { expect: { etag: etag(toBytes(input.data as Data)) } }
    case 'etag_of_file':
      return inScratch(DEFAULT_PATH, input.existing, (target) =>
        outcome(
          () => etagOfFile(target),
          (tag) => ({ etag: tag }),
        ),
      )
    case 'write_cas':
      return inScratch(DEFAULT_PATH, input.existing, (target, scratch) => {
        const before = entries(scratch)
        const got = outcome(
          () => writeCas(target, toBytes(input.content as Data), sent(input.expectedEtag as Sent)),
          (tag) => ({ etag: tag, content: contentOf(target) }),
        )
        const directory = typeof input.existing === 'object' && 'directory' in input.existing
        // A refusal leaves the file as it was; a write leaves the target and nothing else.
        if ('error' in got) {
          assertEntries(scratch, before, section)
          if (input.existing !== undefined && !directory && got.error.kind !== 'io') {
            const kept = contentOf(target)
            if (JSON.stringify(kept) !== JSON.stringify(input.existing)) {
              throw new Error(`${section}: a refused write changed the file`)
            }
          }
        } else {
          assertEntries(scratch, [DEFAULT_PATH], section)
        }
        return got
      })
    case 'write_if_changed':
      return inScratch(DEFAULT_PATH, input.existing, (target, scratch) => {
        const before = entries(scratch)
        const got = outcome(
          () => writeIfChanged(target, toBytes(input.content as Data)),
          (wrote) => ({ wrote, content: contentOf(target) }),
        )
        assertEntries(scratch, 'error' in got ? before : [DEFAULT_PATH], section)
        return got
      })
    case 'write_atomic': {
      const path = input.path ?? DEFAULT_PATH
      return inScratch(path, input.existing, (target, scratch) => {
        const before = entries(scratch)
        const got = outcome(
          () => atomicWrite(target, toBytes(input.content as Data)),
          () => ({ content: contentOf(target), entries: entries(scratch) }),
        )
        if ('error' in got) assertEntries(scratch, before, section)
        return got
      })
    }
    case 'write_atomic_mode':
      return inScratch(DEFAULT_PATH, 'old', (target) => {
        chmodSync(target, parseInt(input.existingMode as string, 8))
        return outcome(
          () => atomicWrite(target, toBytes(input.content as Data)),
          () => ({ mode: (statSync(target).mode & 0o7777).toString(8) }),
        )
      })
    default:
      throw new Error(`no runner for the section ${section}`)
  }
}
