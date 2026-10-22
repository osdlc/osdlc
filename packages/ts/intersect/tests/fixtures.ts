/**
 * Intersect fixture convention — types, loader, and shape guard.
 *
 * The corpus is data-driven: each `fixtures/*.cases.json` file specifies one
 * area's intended behavior as a list of cases. The harness
 * (`tests/fixtures.test.ts`) loads every file through {@link loadCaseFiles} and
 * dispatches each case by its (effective) op to the public API.
 *
 * See `fixtures/README.md` for the human-readable schema.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Every operation a case may target, across all three layers plus the registry. */
export const OP_NAMES = [
  // L1 path parsing (string -> segment array)
  'parse',
  // L0 segment core (array inputs)
  'segments.intersects',
  'segments.matches',
  'segments.witness',
  // L1 path API (string / string[] inputs)
  'intersects',
  'matches',
  'whichMatch',
  'overlapping',
  'witness',
  // L1 registry
  'registry.applicableTo',
  'registry.matching',
  // L2 filesystem (async, reads disk)
  'fs.filesInScope',
  'fs.resolveIntersection',
] as const

/** The name of an Intersect operation a case can exercise. */
export type OpName = (typeof OP_NAMES)[number]

/** The input fields each operation reads off a case. The shape guard requires them. */
export const OP_INPUTS: Record<OpName, readonly string[]> = {
  parse: ['path'],
  'segments.intersects': ['a', 'b'],
  'segments.matches': ['path', 'pattern'],
  'segments.witness': ['a', 'b'],
  intersects: ['a', 'b'],
  matches: ['path', 'patterns'],
  whichMatch: ['path', 'patterns'],
  overlapping: ['query', 'candidates'],
  witness: ['a', 'b'],
  'registry.applicableTo': ['entries', 'scope'],
  'registry.matching': ['entries', 'path'],
  'fs.filesInScope': ['patterns'],
  'fs.resolveIntersection': ['a', 'b'],
}

/**
 * One test case. Input fields are op-specific (see {@link OP_INPUTS}); they are
 * typed `unknown` here and cast at dispatch. Every case states an expectation:
 * an `expect` value, or `throws: true`.
 */
export interface Case {
  /** Human-readable label. Unique within its file. */
  name: string
  /** Override the file-level default op for this case. */
  op?: OpName
  // Op-specific inputs (present per the effective op's OP_INPUTS entry).
  a?: unknown
  b?: unknown
  path?: unknown
  pattern?: unknown
  patterns?: unknown
  query?: unknown
  candidates?: unknown
  entries?: unknown
  scope?: unknown
  /** Matching options passed through to the API (`Options` / `FsOptions`). */
  opts?: unknown
  /**
   * fs cases only: the relative file paths to materialize under a temp dir
   * before the op runs. Read by the integration harness (`tests/fs.test.ts`);
   * ignored by the pure-op harness, which skips the `fs.*` namespace.
   */
  tree?: unknown
  /** The intended return value; deep-equality is asserted against it. */
  expect?: unknown
  /** The call is expected to throw (sync) or reject (async). */
  throws?: boolean
  /** With `throws`: the `IntersectError` code the call must carry. Without it any error passes. */
  code?: string
  /**
   * fs cases only: the directory to use as `cwd`, relative to the temp dir.
   * Default: the temp dir itself. It need not exist (a missing-`cwd` case), and
   * it may name a file of the `tree` (a non-directory case).
   */
  cwd?: string
  /** fs cases only: pass `cwd` as a path relative to the process's working directory. */
  cwdRelative?: boolean
  /**
   * fs cases only: symbolic links to create after the `tree`, as `{ link: target }`.
   * Both are relative to the temp dir; the link points at the target as written.
   */
  symlinks?: unknown
  /**
   * fs cases only: directories of the `tree` to make unreadable (mode 000)
   * before the op runs. POSIX only; the harness skips the case when it cannot
   * make a directory unreadable (Windows, or running as root).
   */
  unreadable?: unknown
  /** Register as `test.todo` — unimplemented. */
  pending?: boolean
}

/** A parsed case file: a default op plus its cases. */
export interface CaseFile {
  /** Default operation for cases that do not override it with their own `op`. */
  op: OpName
  cases: Case[]
}

/** A {@link CaseFile} tagged with the basename it was loaded from. */
export interface LoadedCaseFile extends CaseFile {
  /** The `*.cases.json` basename. */
  file: string
}

/** The op a case actually exercises: its own `op` override, else the file default. */
export function effectiveOp(file: CaseFile, c: Case): OpName {
  return c.op ?? file.op
}

/** Absolute path to the corpus directory. */
export const fixturesDir: string = join(import.meta.dirname, '..', 'fixtures')

const OP_SET: ReadonlySet<string> = new Set<string>(OP_NAMES)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Assert `value` is a well-formed {@link CaseFile}, throwing an Error naming the
 * offending file on any violation: bad op, malformed case list, duplicate or empty
 * names, wrong flag types, a missing expectation, or a case lacking its effective
 * op's required input fields.
 */
export function assertCaseFile(value: unknown, file: string): asserts value is CaseFile {
  const where = `fixture ${file}`
  if (!isRecord(value)) throw new Error(`${where}: top level must be an object`)

  const { op, cases } = value
  if (typeof op !== 'string' || !OP_SET.has(op)) {
    throw new Error(
      `${where}: "op" must be one of {${OP_NAMES.join(', ')}} (got ${JSON.stringify(op)})`,
    )
  }
  if (!Array.isArray(cases)) throw new Error(`${where}: "cases" must be an array`)

  const seen = new Set<string>()
  cases.forEach((c: unknown, i: number) => {
    const at = `${where} case[${i}]`
    if (!isRecord(c)) throw new Error(`${at}: must be an object`)
    if (typeof c.name !== 'string' || c.name.length === 0) {
      throw new Error(`${at}: "name" must be a non-empty string`)
    }
    const at2 = `${at} (${c.name})`
    if (seen.has(c.name)) throw new Error(`${at2}: duplicate case name`)
    seen.add(c.name)

    if (c.op !== undefined && (typeof c.op !== 'string' || !OP_SET.has(c.op))) {
      throw new Error(`${at2}: "op" override must be a known op name (got ${JSON.stringify(c.op)})`)
    }
    for (const flag of ['throws', 'pending', 'cwdRelative'] as const) {
      if (c[flag] !== undefined && typeof c[flag] !== 'boolean') {
        throw new Error(`${at2}: "${flag}" must be a boolean`)
      }
    }
    for (const field of ['code', 'cwd'] as const) {
      if (c[field] !== undefined && typeof c[field] !== 'string') {
        throw new Error(`${at2}: "${field}" must be a string`)
      }
    }
    if (c.code !== undefined && c.throws !== true) {
      throw new Error(`${at2}: "code" needs "throws": true`)
    }
    if (c.symlinks !== undefined && !isRecord(c.symlinks)) {
      throw new Error(`${at2}: "symlinks" must be an object of link to target`)
    }
    if (c.unreadable !== undefined && !Array.isArray(c.unreadable)) {
      throw new Error(`${at2}: "unreadable" must be an array of directory paths`)
    }
    if (!('expect' in c) && c.throws !== true) {
      throw new Error(`${at2}: needs an "expect" value or "throws": true`)
    }

    const op2 = (c.op as OpName | undefined) ?? (op as OpName)
    for (const field of OP_INPUTS[op2]) {
      if (!(field in c)) {
        throw new Error(`${at2}: op ${op2} requires input field "${field}"`)
      }
    }
  })
}

/** All `*.cases.json` basenames in the corpus directory, sorted for stable ordering. */
export function caseFileNames(dir: string = fixturesDir): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.cases.json'))
    .sort()
}

/** Load and validate every `*.cases.json` file. Throws (naming the file) on a malformed one. */
export function loadCaseFiles(dir: string = fixturesDir): LoadedCaseFile[] {
  return caseFileNames(dir).map((file) => {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    assertCaseFile(parsed, file)
    return { file, op: parsed.op, cases: parsed.cases }
  })
}
