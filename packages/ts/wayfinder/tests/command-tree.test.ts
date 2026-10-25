/**
 * Every command in the tree, found from `way schema` rather than a list kept
 * here: each answers `--help`, and each that prints a document answers
 * `--json` with `schemaVersion` and its `kind`.
 */

import { afterAll, describe, expect, test, vi } from 'vitest'

import { captureIo } from '@osdlc/cli-tool'

import { main } from '../src/cli.ts'
import { fixtureRoot, removeRoot } from './support.ts'

// Each data command probes or reads the fixture repository.
vi.setConfig({ testTimeout: 60_000 })

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

const FILES = {
  'package.json': JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
}

/** A temporary repository that is also the home directory, so nothing real is read or written. */
async function way(argv: string[], dir: string) {
  const io = captureIo()
  const code = await main(['-C', dir, ...argv], {}, dir, io)
  return { code, out: io.out, err: io.err }
}

interface Entry {
  path: string[]
  group: boolean
  interactive: boolean
  kind?: string
}

/** The arguments a command needs to succeed. Commands not named here take none. */
const ARGS: Record<string, string[]> = {
  'config get': ['allowExec'],
  'config set': ['discovery', 'walk'],
  'config unset': ['discovery'],
  'config explain': ['allowExec'],
  run: ['npm run build', '--dry-run'],
}

async function tree(): Promise<Entry[]> {
  const dir = await root(FILES)
  const ran = await way(['schema'], dir)
  expect(ran.code).toBe(0)
  return (JSON.parse(ran.out) as { commands: Entry[] }).commands
}

const commands = await tree()

describe('the command tree', () => {
  test('lists the shared commands beside the core ones', () => {
    const words = commands.map((c) => c.path.join(' '))
    for (const word of [
      'list',
      'query',
      'run',
      'serve',
      'providers',
      'config',
      'trust',
      'guide',
      'clean',
      'help',
      'schema',
    ]) {
      expect(words).toContain(word)
    }
  })

  test.each(commands.map((c) => [c.path.join(' ') || '(root)', c] as const))(
    '%s answers --help',
    async (_name, entry) => {
      const dir = await root(FILES)
      const ran = await way([...entry.path, '--help'], dir)
      expect(ran.code, ran.err).toBe(0)
      expect(ran.out).toContain(['way', ...entry.path].join(' '))
    },
  )

  const data = commands.filter((c) => c.kind !== undefined && !c.interactive)

  test.each(data.map((c) => [c.path.join(' '), c] as const))(
    '%s answers --json with schemaVersion and its kind',
    async (name, entry) => {
      const dir = await root(FILES)
      // `config unset` removes what a `config set` wrote.
      if (name === 'config unset') await way(['config', 'set', 'discovery', 'walk'], dir)
      const ran = await way([...entry.path, ...(ARGS[name] ?? []), '--json'], dir)
      expect(ran.code, ran.err).toBe(0)
      const doc = JSON.parse(ran.out) as Record<string, unknown>
      expect(Object.keys(doc).slice(0, 2)).toEqual(['schemaVersion', 'kind'])
      expect(doc['kind']).toBe(entry.kind)
    },
  )

  test.each(
    data
      .filter((c) => ARGS[c.path.join(' ')] !== undefined)
      .map((c) => [c.path.join(' '), c] as const),
  )('%s without its arguments answers --json with an error document', async (_name, entry) => {
    const dir = await root(FILES)
    const ran = await way([...entry.path, '--json'], dir)
    expect(ran.code).not.toBe(0)
    expect(JSON.parse(ran.out)).toMatchObject({ schemaVersion: 1, kind: 'error' })
  })
})
