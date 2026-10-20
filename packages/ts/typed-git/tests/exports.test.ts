/**
 * Exported values that no other suite names: the scan defaults, the
 * command-seam runners the entry point re-exports, and the shape of the
 * public surface.
 */

import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

import {
  asAsync,
  CommandFailed,
  DEFAULT_MAX_DEPTH,
  DEFAULT_WARN_AFTER,
  runChecked,
  runCheckedAsync,
  spawnRunner,
  spawnRunnerAsync,
  type CleanOptions,
  type CommitFlags,
  type DiffCheckOptions,
  type DiffCheckResult,
  type DiffTextOptions,
  type StatusEntry,
} from '../index.ts'
import type {
  BareAndWorker,
  MakeBareAndWorkerOptions,
  MakeOriginAndCheckoutOptions,
  OriginAndCheckout,
} from '../testing.ts'

const CWD = tmpdir()

describe('scan defaults', () => {
  test('DEFAULT_MAX_DEPTH is 3', () => {
    expect(DEFAULT_MAX_DEPTH).toBe(3)
  })

  test('DEFAULT_WARN_AFTER is 10_000', () => {
    expect(DEFAULT_WARN_AFTER).toBe(10_000)
  })
})

describe('re-exported runners', () => {
  test('spawnRunner runs a real binary', () => {
    const r = spawnRunner('git').run(['--version'], { cwd: CWD })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toStartWith('git version')
  })

  test('spawnRunnerAsync runs a real binary', async () => {
    const r = await spawnRunnerAsync('git').run(['--version'], { cwd: CWD })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toStartWith('git version')
  })

  test('runChecked returns the result on exit 0 and throws CommandFailed otherwise', () => {
    const ok = { run: () => ({ exitCode: 0, stdout: 'out', stderr: '' }) }
    const bad = { run: () => ({ exitCode: 2, stdout: '', stderr: 'boom' }) }
    expect(runChecked(ok, ['x'], { cwd: CWD }).stdout).toBe('out')
    expect(() => runChecked(bad, ['x'], { cwd: CWD })).toThrow(CommandFailed)
  })

  test('runCheckedAsync resolves on exit 0 and rejects with CommandFailed otherwise', async () => {
    const ok = { run: async () => ({ exitCode: 0, stdout: 'out', stderr: '' }) }
    const bad = { run: async () => ({ exitCode: 2, stdout: '', stderr: 'boom' }) }
    expect((await runCheckedAsync(ok, ['x'], { cwd: CWD })).stdout).toBe('out')
    await expect(runCheckedAsync(bad, ['x'], { cwd: CWD })).rejects.toBeInstanceOf(CommandFailed)
  })

  test('asAsync gives a sync runner an async run with the same arguments', async () => {
    const seen: string[][] = []
    const sync = {
      run: (argv: string[]) => {
        seen.push(argv)
        return { exitCode: 0, stdout: 'wrapped', stderr: '' }
      },
    }
    const r = await asAsync(sync).run(['a', 'b'], { cwd: CWD })
    expect(r.stdout).toBe('wrapped')
    expect(seen).toEqual([['a', 'b']])
  })
})

describe('public surface', () => {
  test('gate is internal; REF_FORMAT and parseRefRows stay', async () => {
    for (const entry of ['../index.ts', '../client.ts']) {
      const mod = (await import(entry)) as Record<string, unknown>
      expect('gate' in mod).toBe(false)
      expect(typeof mod['REF_FORMAT']).toBe('string')
      expect(typeof mod['parseRefRows']).toBe('function')
    }
  })

  test('the client.ts entry leaves out the URL parsers and the checkout walks', async () => {
    const mod = (await import('../client.ts')) as Record<string, unknown>
    for (const name of ['parseGitUrl', 'gitSshUrl', 'parseRepoRef', 'checkoutRoot']) {
      expect(name in mod).toBe(false)
    }
  })

  test('types used in public signatures are exported', () => {
    // A compile-time check: each name must resolve from the entry.
    const status: StatusEntry = { x: 'M', y: ' ', path: 'a' }
    const clean: CleanOptions = { directories: true }
    const check: DiffCheckOptions = { paths: [] }
    const result: DiffCheckResult = { ok: true, output: '' }
    const flags: CommitFlags = { amend: false }
    const diff: DiffTextOptions = { staged: true }
    const fixture: MakeBareAndWorkerOptions & MakeOriginAndCheckoutOptions = {}
    const shapes: Array<keyof BareAndWorker | keyof OriginAndCheckout> = ['parent', 'origin']
    expect([status, clean, check, result, flags, diff, fixture, shapes]).toHaveLength(8)
  })

  test('the backend seam is marked experimental', () => {
    const source = readFileSync(new URL('../backend.ts', import.meta.url), 'utf8')
    for (const name of [
      'export type GitRequest =',
      'export interface GitResults',
      'export interface GitBackend',
      'export function partialBackend',
    ]) {
      const at = source.indexOf(name)
      expect(at).toBeGreaterThan(0)
      const doc = source.slice(source.lastIndexOf('/**', at), at)
      expect(doc).toContain('@experimental')
    }
  })

  test('the README lists the same experimental items as the TSDoc tags', () => {
    const source = readFileSync(new URL('../backend.ts', import.meta.url), 'utf8')
    const tagged = new Set<string>()
    for (const m of source.matchAll(
      /@experimental[\s\S]*?\*\/\s*export (?:type|interface|function) (\w+)/g,
    )) {
      tagged.add(m[1]!)
    }
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    const line = readme.split('\n- ').find((item) => item.includes('experimental.'))!
    const listed = new Set(
      [...line.split('experimental.')[0]!.matchAll(/`(\w+)`/g)].map((m) => m[1]!),
    )
    expect([...listed].sort()).toEqual([...tagged].sort())
  })
})
