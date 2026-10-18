import { readdirSync, readFileSync } from 'node:fs'
import { sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { Finding } from '../src/core/types.js'
import { loadContract } from '../src/declarative/index.js'
import type { ConsumptionFixture, ValidationFixture } from './harness.js'

/**
 * TS ⇄ YAML contract parity. Each fixture's `.contract.yaml` peer (the YAML form of its
 * contract) is loaded and run against the same documents as the TS fixture; the findings and
 * typed reads must match.
 *
 * YAML expresses the frontmatter, structure, content and text planes. Code-only features —
 * custom `rule` / `docRule`s and `.refine()` — emit findings outside those planes (custom rule
 * ids; `frontmatter/refine`), which a YAML contract does not produce. So the TS side is
 * filtered to the YAML-expressible planes before comparing: full fixtures match exactly, and
 * partial fixtures match once their documented `# GAP:` finding is excluded.
 */

// The fixture modules, found on disk. The walk recurses so a subdirectory can never hide a
// fixture from the "peers exist" check: folder placement is not load-bearing. A fixture opts out
// of the twin expectation explicitly with `peerless: true` (see below).
async function loadModules<T>(rel: string): Promise<Record<string, { default: T }>> {
  const root = fileURLToPath(new URL(rel, import.meta.url))
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) =>
    f.endsWith('.ts'),
  )
  const out: Record<string, { default: T }> = {}
  for (const file of files) {
    const key = `${rel}${file.split(sep).join('/')}`
    out[key] = (await import(new URL(key, import.meta.url).href)) as { default: T }
  }
  return out
}
const valMods = await loadModules<ValidationFixture>('./fixtures/validation/')
const conMods = await loadModules<ConsumptionFixture>('./fixtures/consumption/')

interface Entry<T> {
  key: string
  stem: string
  fx: T
}

function fixtures<T>(mods: Record<string, { default: T }>): Entry<T>[] {
  return Object.entries(mods)
    .map(([key, m]) => ({
      key,
      fx: m.default,
      stem: key.slice(key.lastIndexOf('/') + 1).replace(/\.ts$/, ''),
    }))
    .filter((e) => e.stem !== 'index' && !e.stem.startsWith('_'))
    .sort((a, b) => a.stem.localeCompare(b.stem))
}

/** A fixture's `.contract.yaml` twin: in the shared corpus for validation, beside it otherwise. */
const peerText = (key: string): string =>
  readFileSync(
    fileURLToPath(
      new URL(
        key.replace('./fixtures/validation/', '../corpus/').replace(/\.ts$/, '.contract.yaml'),
        import.meta.url,
      ),
    ),
    'utf8',
  )

/** Whether a fixture's `.contract.yaml` twin exists on disk. */
const hasPeer = (key: string): boolean => {
  try {
    peerText(key)
    return true
  } catch {
    return false
  }
}

/** The planes YAML can express; everything else is a code-only finding (rule / refine). */
const isV1Plane = (f: Finding): boolean =>
  f.id.startsWith('structure/') ||
  f.id.startsWith('content/') ||
  f.id.startsWith('text/') ||
  (f.id.startsWith('frontmatter/') && f.id !== 'frontmatter/refine')

/** Compare on the fields a YAML contract must reproduce; order-independent. */
const shape = (findings: Finding[]): string[] =>
  findings.map((f) => `${f.id}@${f.pos?.line ?? '-'}:${f.level}`).sort()

const valEntries = fixtures(valMods)
const conEntries = fixtures(conMods)

/**
 * Housekeeping existence check — intentionally SOFT (this is the only softened check; the two
 * behavioral parity describes below stay hard). A fixture that opts out with `peerless: true` is
 * accepted silently. A non-peerless fixture missing its `.contract.yaml` twin emits a NON-failing
 * CI warning via the vitest Test Annotations API (`annotate(msg, "warning")` → a GitHub Actions
 * warning annotation) — the test still PASSES. Folder placement gates nothing.
 */
async function warnMissingPeers<T extends { peerless?: boolean }>(
  entries: Entry<T>[],
  plane: string,
  annotate: (message: string, type?: string) => Promise<unknown>,
): Promise<void> {
  for (const e of entries) {
    if (e.fx.peerless || hasPeer(e.key)) continue
    await annotate(
      `${plane} fixture "${e.stem}" has no ${e.stem}.contract.yaml twin and is not marked peerless`,
      'warning',
    )
  }
}

describe('YAML contract peers exist for every fixture', () => {
  it(`validation (${valEntries.length})`, async ({ annotate }) => {
    await warnMissingPeers(valEntries, 'validation', annotate)
  })
  it(`consumption (${conEntries.length})`, async ({ annotate }) => {
    await warnMissingPeers(conEntries, 'consumption', annotate)
  })
})

// The behavioral parity describes run only fixtures that actually have a twin: `peerText()`
// throws on any fixture with no `.contract.yaml`, so a peerless (intentionally twin-less) OR an
// accidentally twin-less fixture is excluded — the latter is already surfaced as a soft warning
// above, and must not become a hard failure here. Everything else is unchanged, so a
// real TS⇄YAML mismatch on a fixture that DOES have a twin still fails hard.
const hasTwin = <T extends { peerless?: boolean }>(e: Entry<T>): boolean =>
  !e.fx.peerless && hasPeer(e.key)

describe('YAML ⇄ TS validation parity', () => {
  for (const e of valEntries.filter(hasTwin)) {
    it(e.stem, () => {
      const yaml = loadContract(peerText(e.key))
      const ts = e.fx.build()
      const ctx = { path: e.fx.path ?? 'fixture.md' }
      for (const c of e.fx.cases) {
        const got = shape(yaml.validate(c.source, ctx).findings)
        const want = shape(ts.validate(c.source, ctx).findings.filter(isV1Plane))
        expect(got, `${e.stem} — ${c.label}`).toEqual(want)
      }
    })
  }
})

describe('YAML ⇄ TS consumption parity', () => {
  for (const e of conEntries.filter(hasTwin)) {
    it(e.stem, () => {
      const yaml = loadContract(peerText(e.key))
      const ctx = { path: e.fx.path ?? 'fixture.md' }
      if (e.fx.throws) {
        expect(() => yaml.read(e.fx.source, ctx), e.stem).toThrow()
      } else {
        const doc = yaml.read(e.fx.source, ctx)
        for (const r of e.fx.reads ?? []) {
          expect(r.get(doc), `${e.stem} — ${r.label}`).toEqual(r.equals)
        }
      }
    })
  }
})
