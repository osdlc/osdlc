/**
 * The fixture-driven test harness.
 *
 * Each validation fixture pairs input documents with their expected findings; each
 * consumption fixture pairs a valid document with typed-model reads (or an expected throw).
 *
 *  - **Lazy contracts.** A fixture builds its contract through `build: () => contract(...)`,
 *    so a contract that throws while it is built fails its own test, not the whole file.
 *  - **Tolerant finding match.** Findings are compared on `{ id, level?, line?, hint? }` in
 *    the engine's order. `level`, `line` and `hint` are checked only when the golden sets them.
 *  - **Goldens are the source of truth.** A validation case's expected findings live in the
 *    shared corpus (`../corpus/`), in a `<source-basename>.expected.json` file beside the
 *    case's `.md`. The fixture module keeps only the contract and the wiring.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'
import type { InferOptions, InferResult } from '../src/declarative/index.js'
import { compileContractObject, inferConfig } from '../src/declarative/index.js'
import type { Contract, Doc, Finding } from '../src/index.js'
import { ContractError } from '../src/index.js'
import type { CorpusConfig } from '../src/runner/index.js'
import { runCorpus } from '../src/runner/index.js'

const DEFAULT_PATH = 'fixture.md'

/** The part of the engine a fixture exercises; it labels the fixture's tests. */
export type Component =
  | 'structure'
  | 'content'
  | 'validate'
  | 'consumption'
  | 'infer-core'
  | 'infer-values'
  | 'infer-meta'
  | 'infer-cli'
  | 'text-api'
  | 'cell-typed'
  | 'list-typed'
  | 'cell-pos'

/**
 * Loads a fixture's markdown from a `.md` file beside it. Each case keeps its document in its
 * own file (one `.md` per case, or just the stem for a single case), so the markdown reads as a
 * real document. `metaUrl` is the fixture module's `import.meta.url`. `rel` is the file (such as
 * `./x.md`). The text is returned unchanged, so expected line numbers stay exact.
 */
export function loadSource(metaUrl: string, rel: string): string {
  return readFileSync(new URL(rel, metaUrl), 'utf8')
}

/** An expected finding. `id` is required. `level`, `line` and `hint` are checked only when given. */
export interface ExpectedFinding {
  id: string
  level?: Finding['level']
  /** `pos.line`. Omit it to skip the line check. */
  line?: number
  /** The hint from a `description:`. Checked only when given. */
  hint?: string
}

/**
 * The shared validation corpus: one directory of language-neutral files (contracts as YAML,
 * documents as markdown, expected findings as JSON, and `corpus-manifest.json`) that any
 * implementation of the engine can run. See `corpus/README.md`.
 */
export const CORPUS_URL = new URL('../corpus/', import.meta.url)

/** Loads a validation case's markdown from the corpus, unchanged. */
export function loadCorpusSource(rel: string): string {
  return readFileSync(new URL(rel, CORPUS_URL), 'utf8')
}

/**
 * Loads a validation case's expected findings from the `<source-basename>.expected.json` file
 * beside the case's `.md` in the corpus. The file is a JSON array of `{ id, level?, line?, hint? }`
 * in engine order. `[]` means the document passes.
 */
export function loadExpected(rel: string): ExpectedFinding[] {
  return JSON.parse(readFileSync(new URL(rel, CORPUS_URL), 'utf8')) as ExpectedFinding[]
}

export interface ValidationCase {
  /** "pass — …" or a description of the failure variant. */
  label: string
  source: string
  /** Expected findings in engine order, from the `.expected.json` file. `[]` means it passes. */
  findings: ExpectedFinding[]
}

export interface ValidationFixture {
  /** A short fixed id, such as "v01" or "v10b". */
  id: string
  title: string
  /** The part of the engine the fixture tests. */
  component: Component
  /** `ctx.path`. Default "fixture.md". */
  path?: string
  /** Builds the contract. It runs only inside a test. */
  build: () => Contract
  cases: ValidationCase[]
  /**
   * The fixture has no `.contract.yaml` peer on purpose. The "peers exist" check in
   * `tests/yaml-parity.test.ts` then gives no warning, and the parity tests skip it.
   */
  peerless?: boolean
  note?: string
}

export interface ModelRead {
  label: string
  get: (doc: Doc) => unknown
  equals: unknown
}

export interface ConsumptionFixture {
  /** A short fixed id, such as "c01". */
  id: string
  title: string
  component: Component
  path?: string
  source: string
  build: () => Contract
  /** Reads checked against the `doc` that `read()` returns. */
  reads?: ModelRead[]
  /** When set, check that `read()` throws `ContractError` instead of running `reads`. */
  throws?: 'ContractError'
  /** No `.contract.yaml` peer on purpose, as {@link ValidationFixture.peerless}. */
  peerless?: boolean
  note?: string
}

function shape(f: Finding): {
  id: string
  level: Finding['level']
  line: number | undefined
  hint: string | undefined
} {
  return { id: f.id, level: f.level, line: f.pos?.line, hint: f.hint }
}

function assertFindings(actual: Finding[], expected: ExpectedFinding[]): void {
  const got = actual.map(shape)
  expect(got.length, `finding count — actual: ${JSON.stringify(got)}`).toBe(expected.length)
  expected.forEach((e, i) => {
    const a = got[i]
    expect(a?.id, `finding[${i}].id`).toBe(e.id)
    if (e.level !== undefined) expect(a?.level, `finding[${i}].level`).toBe(e.level)
    if (e.line !== undefined) expect(a?.line, `finding[${i}].line`).toBe(e.line)
    if (e.hint !== undefined) expect(a?.hint, `finding[${i}].hint`).toBe(e.hint)
  })
}

function census(label: string, fixtures: unknown[]): void {
  test(`census · ${label}: ${fixtures.length} fixtures`, () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })
}

export function runValidationFixtures(label: string, fixtures: ValidationFixture[]): void {
  census(label, fixtures)
  for (const fx of fixtures) {
    describe(`[${fx.id}] ${fx.title} · ${fx.component}`, () => {
      for (const c of fx.cases) {
        test(c.label, () => {
          const contract = fx.build()
          const result = contract.validate(c.source, { path: fx.path ?? DEFAULT_PATH })
          assertFindings(result.findings, c.findings)
        })
      }
    })
  }
}

export function runConsumptionFixtures(label: string, fixtures: ConsumptionFixture[]): void {
  census(label, fixtures)
  for (const fx of fixtures) {
    test(`[${fx.id}] ${fx.title} · ${fx.component}`, () => {
      const contract = fx.build()
      const ctx = { path: fx.path ?? DEFAULT_PATH }
      if (fx.throws === 'ContractError') {
        expect(() => contract.read(fx.source, ctx)).toThrow(ContractError)
        return
      }
      const doc = contract.read(fx.source, ctx)
      for (const r of fx.reads ?? []) {
        expect(r.get(doc), r.label).toEqual(r.equals)
      }
    })
  }
}

/**
 * An inference fixture: a small, realistic folder of markdown under
 * `tests/fixtures/infer/NN-name/vault/`, given by an absolute `dir`. `inferConfig(dir, opts)` runs
 * over it, and `runInferenceFixtures` adds three tests:
 *  - "accept-by-construction": the inferred config, compiled with `compileContractObject` and run
 *    with `runCorpus`, gives no error-level findings.
 *  - "deterministic": inferring twice gives the same contracts.
 *  - "inferred shape": the optional `assert` callback checks the result.
 */
export interface InferenceFixture {
  id: string
  title: string
  /** The part of the engine the fixture tests: an `infer-*` label. */
  component: Component
  /** The absolute path to the input folder (`fileURLToPath(new URL("./vault", import.meta.url))`). */
  dir: string
  opts?: InferOptions
  /** The "inferred shape" check. Runs only when set. */
  assert?: (result: InferResult) => void
  note?: string
}

/**
 * Run the inference fixtures: a census line, then one `describe` per fixture with up to
 * three tests.
 */
export function runInferenceFixtures(label: string, fixtures: InferenceFixture[]): void {
  census(label, fixtures)
  for (const fx of fixtures) {
    describe(`[${fx.id}] ${fx.title} · ${fx.component}`, () => {
      test('accept-by-construction', () => {
        const r = inferConfig(fx.dir, fx.opts)
        const cfg: CorpusConfig = {
          rules: r.contracts.map((c) => ({
            include: c.include,
            contract: compileContractObject(c.def),
          })),
        }
        const { findings } = runCorpus(cfg, { cwd: fx.dir })
        expect(findings.filter((f) => f.level === 'error')).toEqual([])
      })

      test('deterministic', () => {
        const a = inferConfig(fx.dir, fx.opts)
        const b = inferConfig(fx.dir, fx.opts)
        expect(b.contracts).toEqual(a.contracts)
      })

      if (fx.assert) {
        test('inferred shape', () => {
          fx.assert!(inferConfig(fx.dir, fx.opts))
        })
      }
    })
  }
}
