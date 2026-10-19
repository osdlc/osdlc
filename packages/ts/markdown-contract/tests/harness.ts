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
 * Load a fixture's markdown from a peer `.md` file. Each fixture case keeps its
 * document in a sibling file (one `.md` per case; bare stem for single-case) so the
 * markdown reads as a real document rather than an inlined string array. `metaUrl`
 * is the fixture module's `import.meta.url`; `rel` is the peer file (e.g. `./x.md`).
 * The bytes are returned verbatim — no normalization — so position-pinned findings
 * stay exact.
 */
export function loadSource(metaUrl: string, rel: string): string {
  return readFileSync(new URL(rel, metaUrl), 'utf8')
}

/** An expected finding — `id` is required; `level`/`line`/`hint` are asserted only when given. */
export interface ExpectedFinding {
  id: string
  level?: Finding['level']
  /** `pos.line`; omit while a position is still being pinned down. */
  line?: number
  /** the v2 `description:`-derived hint; asserted only when the golden pins it. */
  hint?: string
}

/**
 * The shared validation corpus: one directory of language-neutral files (contracts as YAML,
 * documents as markdown, expected findings as JSON, and `corpus-manifest.json`) that any
 * implementation of the engine can run. See `corpus/README.md`.
 */
export const CORPUS_URL = new URL('../corpus/', import.meta.url)

/** Load a validation case's markdown from the corpus, verbatim. */
export function loadCorpusSource(rel: string): string {
  return readFileSync(new URL(rel, CORPUS_URL), 'utf8')
}

/**
 * Load a validation case's expected findings from its corpus golden, the
 * `<source-basename>.expected.json` file beside the case's `.md` input. The golden is a JSON
 * array of `{ id, level?, line?, hint? }` in engine order; `[]` asserts a passing document.
 */
export function loadExpected(rel: string): ExpectedFinding[] {
  return JSON.parse(readFileSync(new URL(rel, CORPUS_URL), 'utf8')) as ExpectedFinding[]
}

export interface ValidationCase {
  /** "pass — …" or a description of the failure variant. */
  label: string
  source: string
  /** Expected findings in engine order (from the `.expected.json` golden); `[]` is a passing document. */
  findings: ExpectedFinding[]
}

export interface ValidationFixture {
  /** stable short id, e.g. "v01" / "v10b". */
  id: string
  title: string
  /** the part of the engine the fixture exercises. */
  component: Component
  /** `ctx.path` — defaults to "fixture.md". */
  path?: string
  /** lazy contract construction — runs only inside an active test. */
  build: () => Contract
  cases: ValidationCase[]
  /**
   * Intentionally twin-less: this fixture has no `.contract.yaml` parity peer (yet).
   * Set while a fixture is authored ahead of its declarative loader. The yaml-parity
   * "peers exist" check accepts a `peerless` fixture silently (no warning), and the
   * behavioral parity loops skip it (running its YAML twin would throw). See
   * `tests/yaml-parity.test.ts`.
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
  /** stable short id, e.g. "c01". */
  id: string
  title: string
  component: Component
  path?: string
  source: string
  build: () => Contract
  /** typed-model reads asserted against `read()`'s `doc`. */
  reads?: ModelRead[]
  /** when set, assert `read()` throws `ContractError` instead of running `reads`. */
  throws?: 'ContractError'
  /**
   * Intentionally twin-less: this fixture has no `.contract.yaml` parity peer (yet).
   * Honored identically to {@link ValidationFixture.peerless}; see `tests/yaml-parity.test.ts`.
   */
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
 * An inference fixture. Each fixture is a self-contained input vault — a
 * small, realistic markdown corpus — under `tests/fixtures/infer/NN-name/vault/`,
 * pointed at by an absolute `dir`. `inferConfig(dir, opts)` is run over it and the result is
 * exercised by three auto-tests (see `runInferenceFixtures`):
 *  - **accept-by-construction** — the inferred config, loaded back through
 *    `compileContractObject` and run via `runCorpus`, reports zero error-level findings (the
 *    defining guarantee).
 *  - **deterministic** — inferring twice yields identical contracts.
 *  - **inferred shape** — the optional `assert` callback inspects the model against the spec.
 */
export interface InferenceFixture {
  id: string
  title: string
  /** the part of the engine the fixture exercises: an `infer-*` label. */
  component: Component
  /** ABSOLUTE path to the input vault (compute via `fileURLToPath(new URL("./vault", import.meta.url))`). */
  dir: string
  opts?: InferOptions
  /** the inferred-shape assertion — runs only when present. */
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
            // Inferred defs are authored in the v2 vocabulary — compile as v2.
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
