/**
 * The aspect scanners: what a manifest reveals about what it IS.
 *
 * A registry, so a new form of evidence is a registration, not an edit to a
 * growing `if`. Each scanner names the tier it works at (see
 * `@osdlc/system-model`'s `EvidenceKind`), looks at one thing, and returns
 * what it saw — never a verdict without the reason for it.
 *
 * PARITY IS THE CONSTRAINT. The Rust peer, when it lands, must run the same scanners
 * in the same order and produce byte-identical output, so:
 *
 *   - scanners are ordered by tier, then by registration order, and evidence
 *     is emitted in that order;
 *   - `source` strings are part of the payload, not debug text — changing one
 *     is a wire change and has to be made on both sides;
 *   - every scanner here reads only fields the walk has ALREADY parsed. Tiers
 *     3 and 4 (`files`, `content`) would go back to disk, and are deliberately
 *     empty: a directory read is a second thing for two implementations to
 *     disagree about, and worth adding on purpose rather than by drift.
 */

import { EVIDENCE_TIERS, type Aspect, type Evidence } from './aspect.ts'
import { byteCompare, type ManifestInfo } from './manifest-model.ts'

/**
 * One reason to believe one aspect. A scanner returns any number of these;
 * they are grouped into `Aspect`s afterwards.
 */
interface Finding {
  aspect: string
  kind: 'manifest' | 'dependency'
  source: string
  found: string
}

interface Scanner {
  /** For the registry's own ordering, and for anyone reading a diff. */
  id: string
  scan(m: ManifestInfo): Finding[]
}

/** A dependency name that implies an aspect, whatever table it sits in. */
const DEPENDENCY_ASPECTS: ReadonlyArray<[string, string]> = [
  ['vue', 'vue'],
  ['nuxt', 'nuxt'],
  ['typescript', 'typescript'],
  ['vitest', 'test'],
  ['@playwright/test', 'test'],
  ['wasm-bindgen', 'wasm'],
  ['wasm-pack', 'wasm'],
]

/** An extension in an entry point that implies a language. */
function languageOfEntry(entry: string): string | null {
  if (entry.endsWith('.ts') || entry.endsWith('.tsx')) return 'typescript'
  if (entry.endsWith('.js') || entry.endsWith('.mjs') || entry.endsWith('.cjs')) return 'javascript'
  if (entry.endsWith('.vue')) return 'vue'
  return null
}

const SCANNERS: Scanner[] = [
  {
    // Tier 1. A Cargo.toml is not evidence that something is Rust; it is the
    // thing being Rust. No inference, so nothing to get wrong.
    id: 'ecosystem',
    scan: (m) =>
      m.ecosystem === 'rust'
        ? [{ aspect: 'rust', kind: 'manifest', source: 'Cargo.toml', found: '[package]' }]
        : [],
  },
  {
    // Tier 1. `main`/`types` point at the file a consumer is handed, so their
    // extension is the package's own statement about what it ships.
    id: 'entry-point',
    scan: (m) => {
      const out: Finding[] = []
      for (const [field, value] of [
        ['main', m.entry.main],
        ['types', m.entry.types],
      ] as const) {
        if (value === null) continue
        const aspect = languageOfEntry(value)
        if (aspect !== null) {
          out.push({ aspect, kind: 'manifest', source: `package.json#${field}`, found: value })
        }
      }
      return out
    },
  },
  {
    // Tier 1. The Nuxt-layer convention: `main` points at a nuxt.config. Kept
    // separate from the entry-point scanner because it is a claim about ROLE,
    // and the same field can support both at once.
    id: 'nuxt-layer',
    scan: (m) =>
      m.isNuxtLayer
        ? [
            {
              aspect: 'nuxt',
              kind: 'manifest',
              source: 'package.json#main',
              found: 'nuxt.config.ts',
            },
          ]
        : [],
  },
  {
    // Tier 2. Depending on something is not being it — a package that lists
    // `vue` might only be a build tool for Vue projects — which is exactly why
    // this is a lower tier carrying its reason rather than a bare label.
    id: 'dependencies',
    scan: (m) => {
      const out: Finding[] = []
      for (const [name, aspect] of DEPENDENCY_ASPECTS) {
        const dep = m.deps.find((d) => d.name === name)
        if (dep === undefined) continue
        out.push({
          aspect,
          kind: 'dependency',
          source: `dependencies.${name}`,
          found: dep.specifier === '' ? dep.kind : `${dep.kind} ${dep.specifier}`,
        })
      }
      return out
    },
  },
]

/**
 * Every aspect a manifest supports, with the evidence for each.
 *
 * Ordered by the most direct tier, then by aspect id, so the payload is
 * deterministic and diffable — the same reason the walk sorts everything else.
 */
export function scanAspects(manifest: ManifestInfo): Aspect[] {
  const byAspect = new Map<string, Evidence[]>()

  for (const scanner of SCANNERS) {
    for (const finding of scanner.scan(manifest)) {
      const evidence: Evidence = {
        kind: finding.kind,
        tier: EVIDENCE_TIERS[finding.kind],
        source: finding.source,
        found: finding.found,
      }
      const existing = byAspect.get(finding.aspect)
      if (existing === undefined) byAspect.set(finding.aspect, [evidence])
      else existing.push(evidence)
    }
  }

  const aspects: Aspect[] = [...byAspect].map(([id, evidence]) => ({
    id,
    tier: Math.min(...evidence.map((e) => e.tier)),
    evidence,
  }))

  aspects.sort((a, b) => a.tier - b.tier || byteCompare(a.id, b.id))
  return aspects
}
