import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { validationFixtures } from './fixtures/validation/index.js'
import type { ExpectedFinding } from './harness.js'

/**
 * The corpus manifest (`corpus/corpus-manifest.json`) is what another engine's tests read. For
 * each fixture it names the `.contract.yaml` peer, the `shared` flag (true when the YAML peer
 * fully expresses the contract: no `# GAP:` and not `peerless`), and each case's `.md` source
 * with its `.expected.json` file. This suite checks that the manifest matches the TS fixture
 * modules.
 */

interface ManifestCase {
  source: string
  expected: string
}

interface ManifestEntry {
  id: string
  contract: string | null
  shared: boolean
  cases: ManifestCase[]
}

const dir = (rel: string): string => fileURLToPath(new URL(`../corpus/${rel}`, import.meta.url))

const manifest = JSON.parse(readFileSync(dir('corpus-manifest.json'), 'utf8')) as ManifestEntry[]
const byId = new Map(manifest.map((e) => [e.id, e]))

describe('corpus manifest — every validation fixture, no drift', () => {
  it('lists exactly the fixture modules, in barrel order', () => {
    expect(manifest.map((e) => e.id)).toEqual(validationFixtures.map((f) => f.id))
  })

  it('references every .expected.json golden on disk (no orphans)', () => {
    const onDisk = readdirSync(dir('')).filter((f) => f.endsWith('.expected.json'))
    const referenced = manifest.flatMap((e) => e.cases.map((c) => c.expected))
    expect(referenced.sort()).toEqual(onDisk.sort())
  })

  for (const fx of validationFixtures) {
    it(`[${fx.id}] entry matches the module and its files exist`, () => {
      const entry = byId.get(fx.id)
      expect(entry, `manifest entry for ${fx.id}`).toBeDefined()
      if (!entry) return

      // `shared` needs a YAML peer that exists and has no `# GAP:`.
      if (fx.peerless) {
        expect(entry.contract, 'peerless fixture has no contract peer').toBeNull()
        expect(entry.shared, 'peerless fixture is ts-only').toBe(false)
      }
      if (entry.contract !== null) {
        expect(existsSync(dir(entry.contract)), `${entry.contract} exists`).toBe(true)
      }
      if (entry.shared) {
        expect(entry.contract, 'shared fixture names its contract peer').not.toBeNull()
        const yaml = readFileSync(dir(entry.contract as string), 'utf8')
        expect(yaml.includes('# GAP:'), `${entry.contract} is gap-free`).toBe(false)
      }

      // Cases: same count and order. Each source file has the exact text the module loaded, and
      // each expected file parses to the module's expected findings.
      expect(entry.cases.length, 'case count').toBe(fx.cases.length)
      entry.cases.forEach((c, i) => {
        const tsCase = fx.cases[i]
        expect(tsCase, `case[${i}] exists in the module`).toBeDefined()
        expect(readFileSync(dir(c.source), 'utf8'), `case[${i}] source ${c.source}`).toBe(
          tsCase?.source,
        )
        const golden = JSON.parse(readFileSync(dir(c.expected), 'utf8')) as ExpectedFinding[]
        expect(golden, `case[${i}] golden ${c.expected}`).toEqual(tsCase?.findings)
      })
    })
  }
})
