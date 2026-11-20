import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { validationFixtures } from './fixtures/validation/index.js'
import { TS_ONLY_URL, sharedCases } from './harness.js'

/**
 * The validation fixtures' documents and expected findings have two homes. A fixture whose YAML
 * contract expresses it fully is shared: its cases are in the `validate` section of the
 * conformance suite (`packages/conformance/markdown-contract/suite.json`), which the Rust crate
 * runs too. A fixture that needs code is TypeScript-only: its files are in
 * `tests/fixtures/ts-only/`. This suite checks that the two homes match the fixture modules,
 * with no document missing and none left over.
 */

const suiteCases = [...sharedCases.values()]
const suiteSources = new Set(suiteCases.map((c) => c.input['source']))

/** A fixture is shared when its documents are the suite's. */
const isShared = (fx: (typeof validationFixtures)[number]): boolean =>
  fx.cases.some((c) => suiteSources.has(c.source))

const shared = validationFixtures.filter(isShared)
const tsOnly = validationFixtures.filter((fx) => !isShared(fx))

const tsOnlyDir = fileURLToPath(TS_ONLY_URL)
const onDisk = readdirSync(tsOnlyDir)

describe('validation corpus: the suite and tests/fixtures/ts-only match the fixture modules', () => {
  it('has the shared fixtures in barrel order, every case of each, and nothing else', () => {
    expect(suiteCases.map((c) => c.input['source'])).toEqual(
      shared.flatMap((fx) => fx.cases.map((c) => c.source)),
    )
  })

  it('has no TypeScript-only fixture with a case in the suite', () => {
    for (const fx of tsOnly) {
      for (const c of fx.cases)
        expect(suiteSources.has(c.source), `${fx.id}: ${c.label}`).toBe(false)
    }
  })

  it('shares only contracts that YAML expresses in full', () => {
    for (const c of suiteCases) {
      expect(String(c.input['contract']).includes('# GAP:'), `${c.name} has a # GAP:`).toBe(false)
    }
  })

  it('keeps each TypeScript-only fixture as files, and no file that no fixture uses', () => {
    const stems = new Set<string>()
    for (const fx of tsOnly) {
      for (const c of fx.cases) {
        const md = onDisk.find((f) => f.endsWith('.md') && readText(f) === c.source)
        expect(md, `${fx.id}: ${c.label} has a .md in tests/fixtures/ts-only`).toBeDefined()
        const name = md as string
        const golden = name.replace(/\.md$/, '.expected.json')
        expect(JSON.parse(readText(golden)), `${fx.id}: ${golden}`).toEqual(c.findings)
        stems.add(name)
        stems.add(golden)
      }
    }
    const peers = onDisk.filter((f) => f.endsWith('.contract.yaml'))
    for (const f of peers) {
      const stem = f.replace(/\.contract\.yaml$/, '')
      expect(
        [...stems].some((s) => s.startsWith(`${stem}.`)),
        `${f} belongs to a fixture`,
      ).toBe(true)
      stems.add(f)
    }
    expect(onDisk.filter((f) => !stems.has(f))).toEqual([])
  })

  it('gives every fixture a home', () => {
    expect(shared.length + tsOnly.length).toBe(validationFixtures.length)
    expect(existsSync(tsOnlyDir)).toBe(true)
  })
})

function readText(file: string): string {
  return readFileSync(new URL(file, TS_ONLY_URL), 'utf8')
}
