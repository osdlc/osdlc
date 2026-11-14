/**
 * Tests for the snapshot regeneration command, against a models.dev api.json
 * subset recorded on 2026-10-09 (`fixtures/models-dev-api.json`). No network:
 * `fetchText` throws if called.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  diffSnapshots,
  formatJson,
  main,
  regenerate,
  SNAPSHOT_PATH,
  type Snapshot,
} from '../scripts/models-snapshot.ts'

const FIXTURE = resolve(import.meta.dirname, 'fixtures/models-dev-api.json')
const current = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot
const api = JSON.parse(readFileSync(FIXTURE, 'utf8'))

/**
 * The current snapshot without the aliases, offers and offering rows that name a model the
 * recorded subset lacks (models added to the snapshot after it was recorded), so a regeneration
 * from the fixture merges.
 */
function mergeable(date: string): Snapshot {
  const kept = new Set(Object.keys(regenerate(current, api, date).models))
  const s = structuredClone(current)
  for (const tool of Object.values(s.tools)) {
    const aliases = tool.aliases as Record<string, string> | undefined
    for (const [name, key] of Object.entries(aliases ?? {}))
      if (!kept.has(key)) delete aliases![name]
    const offers = tool.offers as { model: string }[] | undefined
    if (offers) tool.offers = offers.filter((o) => kept.has(o.model))
  }
  if (s.offerings) s.offerings = s.offerings.filter((o) => kept.has(o.model))
  return s
}

/** Recording io; `snapshot` stands in for the committed snapshot file. */
function io(snapshot?: Snapshot) {
  const out: string[] = []
  const writes: string[] = []
  return {
    out,
    writes,
    io: {
      readText: (path: string) =>
        path === SNAPSHOT_PATH && snapshot !== undefined
          ? JSON.stringify(snapshot)
          : readFileSync(path, 'utf8'),
      writeText: (path: string) => void writes.push(path),
      fetchText: () => Promise.reject(new Error('no network in tests')),
      out: (line: string) => void out.push(line),
      today: () => '2026-10-09',
    },
  }
}

describe('models-snapshot', () => {
  test('AC-9: exits 0 against the recorded fixture and prints a diff', async () => {
    const run = io(mergeable('2026-10-10'))
    expect(await main(['--from', FIXTURE, '--date', '2026-10-10'], run.io)).toBe(0)
    expect(run.out).toContain(`~ observed_at: ${current.observed_at} -> 2026-10-10`)
    expect(run.out).toContain('- models anthropic/claude-fable-5-1')
    expect(run.out.every((l) => /^[+~-] /.test(l))).toBe(true)
    expect(run.writes).toEqual([])
  })

  test('--write writes the snapshot; a fetch failure exits 1', async () => {
    const run = io(mergeable('2026-10-09'))
    expect(await main(['--from', FIXTURE, '--write'], run.io)).toBe(0)
    expect(run.writes).toEqual([SNAPSHOT_PATH])
    const offline = io()
    expect(await main([], offline.io)).toBe(1)
    expect(offline.out[0]).toContain('no network in tests')
    const missing = io()
    expect(await main(['--from', '--write'], missing.io)).toBe(1)
    expect(missing.out[0]).toBe('models-snapshot: --from needs a value')
    expect(missing.writes).toEqual([])
  })

  test('a kept reference left dangling prints the diff, then exits 1 and writes nothing', async () => {
    const run = io()
    expect(await main(['--from', FIXTURE, '--date', '2026-10-10', '--write'], run.io)).toBe(1)
    expect(run.out).toContain('- models anthropic/claude-fable-5-1')
    expect(run.out).toContain(
      "regenerated snapshot does not merge: tool 'claude' alias 'fable' names unknown model 'anthropic/claude-fable-5-1'",
    )
    expect(run.writes).toEqual([])
  })

  test('keeps text models (tool-calling or not), embeddings and image-output models; folds dated ids into aliases', () => {
    const next = regenerate(current, api, '2026-10-10')
    expect(Object.keys(next.models)).toEqual([
      'anthropic/claude-haiku-4-5',
      'anthropic/claude-opus-5-5',
      'anthropic/claude-sonnet-5',
      'google/gemini-2.5-pro',
      'google/gemini-3.7-flash',
      'openai/gpt-3.5-turbo',
      'openai/gpt-5.5',
      'openai/gpt-6.1-sol',
      'openai/gpt-image-1',
      'openai/text-embedding-3-small',
    ])
    expect(next.models['anthropic/claude-haiku-4-5']?.aliases).toEqual([
      'claude-haiku-4-5-20251001',
    ])
    expect(next.models['openai/text-embedding-3-small']?.traits).toEqual(['embedding'])
    expect(next.models['openai/gpt-3.5-turbo']?.traits).toBeUndefined()
    expect(next.models['openai/gpt-image-1']?.traits).toEqual(['vision', 'image-out'])
    expect(next.models['anthropic/claude-opus-5-5']).toMatchObject({
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      traits: ['agent', 'reasoning', 'vision', 'long-context'],
      status: 'current',
    })
  })

  test('keeps the tool facts and providers models.dev lacks', () => {
    const next = regenerate(current, api, '2026-10-10')
    expect(next.tools).toEqual(current.tools)
    expect(next.providers).toEqual(current.providers)
  })

  test('the committed snapshot is byte-for-byte what --write produces', async () => {
    expect(await formatJson(current)).toBe(readFileSync(SNAPSHOT_PATH, 'utf8'))
  })

  test('diffSnapshots names changed fields and the tier moves they cause', () => {
    const after = structuredClone(current)
    after.models['anthropic/claude-opus-5-5'] = {
      ...after.models['anthropic/claude-opus-5-5'],
      status: 'deprecated',
    }
    expect(diffSnapshots(current, after)).toEqual([
      '~ models anthropic/claude-opus-5-5 status: "current" -> "deprecated"',
      '~ tiers claude/max: opus -> claude-opus-5',
      '~ tiers cursor/max: claude-opus-5-5-medium -> (none)',
      '~ tiers opencode/max: anthropic/claude-opus-5-5 -> openai/gpt-6-astra',
      '~ tiers pi/max: anthropic/claude-opus-5-5 -> openai/gpt-6-astra',
    ])
    expect(diffSnapshots(current, current)).toEqual([])
  })

  test('the regenerated fixture reports the tier moves for review', async () => {
    const run = io(mergeable('2026-10-10'))
    expect(await main(['--from', FIXTURE, '--date', '2026-10-10'], run.io)).toBe(0)
    expect(run.out.some((l) => l.startsWith('~ tiers '))).toBe(true)
  })
})
