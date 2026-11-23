/** The plugin kit: each helper on its own, against temp directories and fake runners. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CommandFailed, asAsync, type CommandRunner } from '@osdlc/command-seam'
import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'

import { pluginKit } from '../src/index.ts'

const NOW = new Date('2026-11-19T12:00:00Z')
const HOUR = 3_600_000

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop()!
    chmodSync(d, 0o755)
    rmSync(d, { recursive: true, force: true })
  }
})
const temp = (): string => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-kit-')))
  dirs.push(d)
  return d
}

function put(path: string, hoursOld: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, 'x')
  const at = new Date(NOW.getTime() - hoursOld * HOUR)
  utimesSync(path, at, at)
}

const signal = (): AbortSignal => new AbortController().signal

describe('candidate', () => {
  test('fills in the id and the plugin as owner', () => {
    const kit = pluginKit('docker')
    expect(kit.candidate({ kind: 'volume', ref: 'data', why: 'unused' })).toEqual({
      kind: 'volume',
      ref: 'data',
      why: 'unused',
      id: 'volume:data',
      owner: 'docker',
      evidence: {},
    })
    expect(
      kit.candidate({ kind: 'artifact', path: '/a/b', why: 'x', evidence: { n: 1 } }),
    ).toMatchObject({
      id: 'artifact:/a/b',
      evidence: { n: 1 },
    })
  })
})

describe('idle', () => {
  test('is the newest file under the folder, skipped names left out', () => {
    const dir = temp()
    put(join(dir, 'src', 'a.ts'), 30)
    put(join(dir, 'node_modules', 'x.js'), 1)
    const kit = pluginKit('node', { now: () => NOW })
    expect(kit.idle(dir)).toMatchObject({ unmeasured: false, hours: 1 })
    expect(kit.idle(dir, { skip: (n) => n === 'node_modules' })).toEqual({
      unmeasured: false,
      newestMs: NOW.getTime() - 30 * HOUR,
      hours: 30,
    })
  })

  test('a folder with no file has no idle time; a missing one is no file', () => {
    const dir = temp()
    mkdirSync(join(dir, 'empty'))
    const kit = pluginKit('x', { now: () => NOW })
    expect(kit.idle(join(dir, 'empty'))).toEqual({ unmeasured: false, newestMs: null, hours: null })
    expect(kit.idle(join(dir, 'gone'))).toEqual({ unmeasured: false, newestMs: null, hours: null })
  })

  test('a walk that runs out of its budget is unmeasured', () => {
    const dir = temp()
    put(join(dir, 'a', 'b'), 30)
    let t = NOW.getTime()
    const kit = pluginKit('x', { now: () => new Date((t += 1_000)), budgetMs: 1_500 })
    expect(kit.idle(dir)).toEqual({ unmeasured: true })
    expect(pluginKit('x', { now: () => NOW, budgetMs: 0 }).idle(dir).unmeasured).toBe(false)
  })
})

describe('remove', () => {
  test('makes read-only folders and files writable, removes the folder and says what it freed', () => {
    const root = temp()
    const dir = join(root, 'mod')
    put(join(dir, 'pkg', 'go.mod'), 1)
    chmodSync(join(dir, 'pkg', 'go.mod'), 0o444)
    chmodSync(join(dir, 'pkg'), 0o555)
    const said = pluginKit('go').remove(dir, { targets: [root] })
    expect(said).toMatch(new RegExp(`^removed ${dir}; freed \\d+ bytes$`))
    expect(existsSync(dir)).toBe(false)
  })

  test('refuses a folder outside the roots and targets, a target itself, and a link that leads out', () => {
    const root = temp()
    const other = temp()
    put(join(other, 'keep'), 1)
    const kit = pluginKit('cache')
    expect(() => kit.remove(other, { targets: [root] })).toThrow(/not inside cache's roots/)
    expect(() => kit.remove(root, { targets: [root] })).toThrow(/not inside/)
    symlinkSync(other, join(root, 'out'))
    expect(() => kit.remove(join(root, 'out'), { targets: [root] })).toThrow(/not inside/)
    expect(existsSync(join(other, 'keep'))).toBe(true)
    // Inside the plugin's own roots is allowed.
    expect(kit.remove(join(other, 'keep'), { targets: [] }, [other])).toMatch(/^removed /)
  })

  test('a folder already gone is not a failure', () => {
    const root = temp()
    expect(pluginKit('x').remove(join(root, 'nope'), { targets: [root] })).toBe(
      `already gone: ${join(root, 'nope')}`,
    )
  })
})

describe('running', () => {
  const holder = (pid: number, command: string, extra: Partial<ProcessHolder> = {}) =>
    ({ pid, command, ...extra }) as ProcessHolder

  test('lists the busy processes in a folder, idle shells left out, and the ones of a name', () => {
    const asked: Array<{ path: string; fresh: boolean }> = []
    const probe: ProcessProbe = {
      alive: () => true,
      holders: (path, o) => {
        asked.push({ path, fresh: o?.fresh === true })
        return [holder(4, 'zsh', { hasChildren: false }), holder(5, 'cargo')]
      },
    }
    const kit = pluginKit('cargo', { probe })
    const one = signal()
    expect(kit.running({ in: '/w' }, { signal: one })).toEqual({ names: ['cargo (pid 5)'] })
    expect(kit.running({ name: 'zsh' }, { signal: one })).toEqual({ names: ['zsh (pid 4)'] })
    kit.running({ in: '/w' }, { signal: signal() })
    // The first read in each hook call is fresh.
    expect(asked).toEqual([
      { path: '/w', fresh: true },
      { path: '/', fresh: false },
      { path: '/w', fresh: true },
    ])
  })

  test('an unreadable process table is unknown, not empty', () => {
    const probe: ProcessProbe = {
      alive: () => true,
      holders: () => {
        throw new Error('no lsof')
      },
    }
    expect(pluginKit('x', { probe }).running({ in: '/w' }, { signal: signal() })).toEqual({
      names: [],
      unknown: 'no lsof',
    })
  })
})

describe('onPath and run', () => {
  const fake = (exitCode: number, seen: unknown[] = []) =>
    asAsync({
      run: (argv: string[], opts: unknown) => {
        seen.push({ argv, opts })
        return { exitCode, stdout: 'out', stderr: exitCode === 0 ? '' : 'bad' }
      },
    } as unknown as CommandRunner)

  test('onPath asks which', () => {
    const kit = pluginKit('x', { which: (p) => (p === 'docker' ? '/bin/docker' : undefined) })
    expect(kit.onPath('docker')).toBe(true)
    expect(kit.onPath('podman')).toBe(false)
  })

  test('run passes the signal, the folder and a time limit, and says whether it worked', async () => {
    const seen: Array<{ argv: string[]; opts: Record<string, unknown> }> = []
    const programs: string[] = []
    const kit = pluginKit('docker', {
      runner: (p) => {
        programs.push(p)
        return fake(0, seen)
      },
    })
    const s = signal()
    const r = await kit.run(['docker', 'info'], { signal: s, cwd: '/w' })
    expect(r).toMatchObject({ ok: true, stdout: 'out' })
    expect(programs).toEqual(['docker'])
    expect(seen[0]!.argv).toEqual(['info'])
    expect(seen[0]!.opts).toMatchObject({ cwd: '/w', signal: s, timeoutMs: 30_000 })
  })

  test('a failing program is not ok, and throws with check', async () => {
    const kit = pluginKit('docker', { runner: () => fake(1) })
    expect((await kit.run(['docker', 'rm', 'v'], { signal: signal() })).ok).toBe(false)
    await expect(
      kit.run(['docker', 'rm', 'v'], { signal: signal(), check: true }),
    ).rejects.toBeInstanceOf(CommandFailed)
  })
})
