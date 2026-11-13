/**
 * Release step: regenerate the package's shipped model catalogue snapshot
 * (`src/catalogue/snapshot.json`) from models.dev and print the diff for
 * review. Run from the package directory:
 *
 *   node scripts/models-snapshot.ts                  # fetch models.dev, print the diff
 *   node scripts/models-snapshot.ts --from api.json  # read a saved models.dev api.json instead
 *   node scripts/models-snapshot.ts --write          # also write the new snapshot
 *   node scripts/models-snapshot.ts --date 2026-10-09
 *
 * models.dev supplies the model rows of each snapshot provider it lists: id,
 * family, release date, context, cost, traits, status and, where it has them,
 * effort levels. Everything models.dev lacks is kept from the current
 * snapshot: the tools (serves, flags, effort lists, aliases, curated offers),
 * the providers, the offering rows (the context window a tool runs a model
 * with, which models.dev's single `limit.context` does not give), and a
 * model's efforts and aliases when models.dev has none. The tier-per-tool
 * mapping is not stored: the package's classifier generates it, and the diff
 * prints how it moves (`~ tiers <tool>/<tier>: …`). Local runtimes get no rows
 * (see `LOCAL_KINDS` in src/catalogue/models-dev.ts): what they hold is per
 * machine.
 *
 * Row mapping: see `modelsDevRows`.
 *
 * Release tooling, so it lives in `scripts/` and is not shipped. No shell-out.
 * Exit 0 with the diff (or "no changes"); exit 1 on a fetch, parse or
 * snapshot-validation error.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { format, resolveConfig } from 'prettier'

import { diffCatalogues } from '../src/catalogue/diff.ts'
import { layerCatalogue } from '../src/catalogue/layers.ts'
import { MODELS_DEV_URL, modelsDevRows, type ModelsDevApi } from '../src/catalogue/models-dev.ts'
import { queryCatalogue } from '../src/catalogue/query.ts'
import { SnapshotLayerSchema } from '../src/catalogue/schema.ts'
import type { CatalogueLayer, ModelRow, OfferingRow, ProviderRow } from '../src/catalogue/types.ts'

export const SNAPSHOT_PATH = resolve(import.meta.dirname, '../src/catalogue/snapshot.json')

/** The snapshot as written: a whole layer. */
export type Snapshot = {
  source: 'snapshot'
  observed_at: string
  tools: Record<string, Record<string, unknown>>
  providers: Record<string, ProviderRow>
  models: Record<string, ModelRow>
  offerings?: OfferingRow[]
}

/**
 * The new snapshot: models from `api`, everything else from `current`. A row
 * whose release date lies after `date` is refused, so it shows as removed.
 */
export function regenerate(current: Snapshot, api: ModelsDevApi, date: string): Snapshot {
  const { models } = modelsDevRows(api, current.providers, current.models, date)
  return { ...structuredClone(current), observed_at: date, models }
}

function snapshotQuery(snapshot: Snapshot) {
  return queryCatalogue(layerCatalogue([snapshot as CatalogueLayer]))
}

/**
 * One line per added, removed or changed row field (`+`, `-`, `~`), then one
 * per tier-per-tool entry the classifier now maps differently.
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const lines: string[] = []
  if (before.observed_at !== after.observed_at) {
    lines.push(`~ observed_at: ${before.observed_at} -> ${after.observed_at}`)
  }
  for (const table of ['tools', 'providers', 'models'] as const) {
    const a = before[table] as Record<string, Record<string, unknown>>
    const b = after[table] as Record<string, Record<string, unknown>>
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (!Object.hasOwn(b, key)) {
        lines.push(`- ${table} ${key}`)
        continue
      }
      if (!Object.hasOwn(a, key)) {
        lines.push(`+ ${table} ${key}`)
        continue
      }
      const ra = a[key]!
      const rb = b[key]!
      for (const field of [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()) {
        const va = JSON.stringify(ra[field])
        const vb = JSON.stringify(rb[field])
        if (va !== vb)
          lines.push(`~ ${table} ${key} ${field}: ${va ?? '(none)'} -> ${vb ?? '(none)'}`)
      }
    }
  }
  for (const move of diffCatalogues(snapshotQuery(before), snapshotQuery(after)).tierMoves) {
    lines.push(`~ tiers ${move.key}: ${move.from ?? '(none)'} -> ${move.to ?? '(none)'}`)
  }
  return lines
}

/** The snapshot as the repo's prettier style writes it, so a regeneration passes `format:check`. */
export async function formatJson(value: unknown): Promise<string> {
  const config = (await resolveConfig(SNAPSHOT_PATH)) ?? {}
  return format(JSON.stringify(value), { ...config, parser: 'json' })
}

type Io = {
  readText: (path: string) => string
  writeText: (path: string, text: string) => void
  fetchText: (url: string) => Promise<string>
  out: (line: string) => void
  today: () => string
}

const realIo: Io = {
  readText: (path) => readFileSync(path, 'utf8'),
  writeText: (path, text) => writeFileSync(path, text),
  fetchText: async (url) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    return res.text()
  },
  out: (line) => void process.stdout.write(`${line}\n`),
  today: () => new Date().toISOString().slice(0, 10),
}

/** The value after `name`, or `undefined` when `name` is absent; throws when it has no value. */
function flag(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name)
  if (at < 0) return undefined
  const value = argv[at + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}

/** Run the command; returns the exit code. */
export async function main(argv: readonly string[], io: Io = realIo): Promise<number> {
  try {
    const current = JSON.parse(io.readText(SNAPSHOT_PATH)) as Snapshot
    const from = flag(argv, '--from')
    const api = JSON.parse(
      from !== undefined ? io.readText(from) : await io.fetchText(MODELS_DEV_URL),
    ) as ModelsDevApi
    const next = regenerate(current, api, flag(argv, '--date') ?? io.today())
    const valid = SnapshotLayerSchema.safeParse(next)
    if (!valid.success) {
      io.out(`regenerated snapshot is invalid: ${valid.error.message}`)
      return 1
    }
    const diff = diffSnapshots(current, next)
    for (const line of diff.length > 0 ? diff : ['no changes']) io.out(line)
    if (argv.includes('--write')) io.writeText(SNAPSHOT_PATH, await formatJson(next))
    return 0
  } catch (e) {
    io.out(`models-snapshot: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)))
}
