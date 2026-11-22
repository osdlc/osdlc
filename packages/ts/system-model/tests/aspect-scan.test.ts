/**
 * The gate for the aspect scanners, over the shared fixture tree.
 *
 * The crate's `tests/aspects.rs` asserts the SAME expectations against the
 * SAME directories. Aspects are inference, and two implementations inferring
 * separately is exactly where they would quietly stop agreeing — so the
 * expectations are written out in full, including the evidence strings, which
 * are payload rather than debug text.
 */

import { beforeAll, describe, expect, test } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanAspects } from '../src/aspect-scan.ts'
import { walkManifests } from '../src/manifest-walk.ts'
import type { ManifestInfo } from '../src/manifest-model.ts'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, 'fixtures/mini-repo')

let manifests: ManifestInfo[]

beforeAll(async () => {
  manifests = await walkManifests(ROOT)
})

const at = (dir: string): ManifestInfo => {
  const m = manifests.find((m) => m.dir === dir)
  if (!m) throw new Error(`no manifest at "${dir}"`)
  return m
}

describe('scanAspects', () => {
  test('a Cargo.toml IS rust — tier 1, no inference', () => {
    expect(scanAspects(at('crates/crate-one'))).toEqual([
      {
        id: 'rust',
        tier: 1,
        evidence: [{ kind: 'manifest', tier: 1, source: 'Cargo.toml', found: '[package]' }],
      },
    ])
  })

  test('one field can support two aspects at once', () => {
    // The Nuxt-layer convention and the entry point's extension are separate
    // claims that happen to read the same `main`. A package is rarely one
    // technology, and this is the smallest case of it.
    expect(scanAspects(at('layers/layer-ui'))).toEqual([
      {
        id: 'nuxt',
        tier: 1,
        evidence: [
          { kind: 'manifest', tier: 1, source: 'package.json#main', found: 'nuxt.config.ts' },
        ],
      },
      {
        id: 'typescript',
        tier: 1,
        evidence: [
          { kind: 'manifest', tier: 1, source: 'package.json#main', found: './nuxt.config.ts' },
        ],
      },
    ])
  })

  test('a dependency is tier 2, and says which table it came from', () => {
    // Depending on vue is not being written in vue, which is the whole reason
    // this is a lower tier that carries its reason.
    expect(scanAspects(at('packages/pkg-b'))).toEqual([
      {
        id: 'vue',
        tier: 2,
        evidence: [
          { kind: 'dependency', tier: 2, source: 'dependencies.vue', found: 'peer ^3.0.0' },
        ],
      },
    ])
  })

  test('a manifest that supports nothing claims nothing', () => {
    expect(scanAspects(at('packages/pkg-a'))).toEqual([])
    // Including the one that would not parse: no manifest, no claims.
    expect(scanAspects(at('packages/broken'))).toEqual([])
  })

  test("an aspect's tier is the most direct evidence for it", () => {
    for (const m of manifests) {
      for (const aspect of scanAspects(m)) {
        expect(aspect.evidence.length).toBeGreaterThan(0)
        expect(aspect.tier).toBe(Math.min(...aspect.evidence.map((e) => e.tier)))
      }
    }
  })

  test('aspects come back ordered by tier, then id', () => {
    for (const m of manifests) {
      const aspects = scanAspects(m)
      for (let i = 1; i < aspects.length; i++) {
        const prev = aspects[i - 1]!
        const cur = aspects[i]!
        expect(prev.tier < cur.tier || (prev.tier === cur.tier && prev.id < cur.id)).toBe(true)
      }
    }
  })
})
