/**
 * What is left of the old name, host-cleaner (#1032): a config in its folders
 * and HOST_CLEANER_* variables are never read; every command warns, and a
 * clean that deletes refuses with exit 2. The rename script leaves this file
 * as written.
 */

import { afterEach, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'

import { main, type MainDeps } from '../src/cli.ts'
import { configFile, hostDirs, unreadConfigs } from '../src/config.ts'
import { oldVariables } from '../src/old-name.ts'
import type { Plugin } from '../src/index.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'old-name-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A plugin with one candidate, `artifact:fake`, that records what it is asked to delete. */
function fake(): Plugin & { removed: string[] } {
  const removed: string[] = []
  return {
    name: 'fake',
    detect: () => true,
    discover: () => [
      {
        id: 'artifact:fake',
        kind: 'artifact',
        ref: 'fake',
        owner: 'fake',
        why: 'idle for a week',
        evidence: { bytes: 10 },
      },
    ],
    object: () => [],
    delete: (c) => {
      removed.push(c.id)
      return `removed ${c.ref}`
    },
    removed,
  }
}

async function run(argv: string[], cwd: string, env: Record<string, string>, deps: MainDeps) {
  const ctx = captureContext({ cwd, env })
  const code = await main(argv, ctx, {
    confirm: () => null,
    shippedDescriptors: tempDir(),
    ...deps,
  })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

/** A home with nothing in it, its env, and a config the person could name with --config. */
function setup(): { home: string; cwd: string; env: Record<string, string>; named: string } {
  const home = tempDir()
  const named = join(home, 'named.json')
  writeFileSync(named, '{}')
  return { home, cwd: tempDir(), env: { PATH: process.env.PATH ?? '', HOME: home }, named }
}

function write(file: string, body: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body)
}

/** The commands that only warn. */
const warnOnly = (cwd: string): string[][] => [
  ['config'],
  ['status', cwd],
  ['plan', '-o', '-', cwd],
  ['clean', '--dry-run', cwd],
]

describe('a config under the old name', () => {
  // The posix folders: a Windows path is relative to them.
  test.skipIf(process.platform === 'win32')(
    'is found in the xdg folders and the macOS ones, and by HOST_CLEANER_CONFIG_DIR',
    () => {
      const home = tempDir()
      for (const platform of ['linux', 'darwin']) {
        const opts = { platform, home }
        const file = configFile(hostDirs({}, opts))
        expect(unreadConfigs({}, file, opts)).toEqual([])
        const xdg = join(home, '.config', 'host-cleaner', 'config.json')
        write(xdg, 'not json')
        expect(unreadConfigs({}, file, opts)).toEqual([xdg])
        rmSync(xdg)
      }
      const mac = { platform: 'darwin', home }
      const file = configFile(hostDirs({}, mac))
      const native = join(home, 'Library', 'Application Support', 'host-cleaner', 'config.json')
      write(native, '{}')
      expect(unreadConfigs({}, file, mac)).toEqual([native])
      rmSync(native)
      const moved = join(home, 'cfg', 'host-cleaner', 'config.json')
      write(moved, '{}')
      expect(unreadConfigs({ HOST_CLEANER_CONFIG_DIR: join(home, 'cfg') }, file, mac)).toEqual([
        moved,
      ])
    },
  )

  test.skipIf(process.platform === 'win32')(
    'every command warns about it and does not read it',
    async () => {
      const { home, cwd, env, named } = setup()
      const old = join(home, '.config', 'host-cleaner', 'config.json')
      write(old, 'not json')
      const file = configFile(hostDirs(env))
      for (const args of warnOnly(cwd)) {
        const r = await run(args, cwd, env, { plugins: [fake()] })
        expect(r.code, args.join(' ')).toBe(0)
        expect(r.err, args.join(' ')).toBe(
          `workstation-cleaner ${args[0]}: ${old} is not read; the config is now ${file}\n`,
        )
        const given = await run([...args, '--config', named], cwd, env, { plugins: [fake()] })
        expect(given.err, args.join(' ')).toBe('')
      }
      const r = await run(['status', '--format', 'json', cwd], cwd, env, { plugins: [fake()] })
      expect(JSON.parse(r.out).warnings).toEqual([`${old} is not read; the config is now ${file}`])
    },
  )

  test.skipIf(process.platform === 'win32')(
    'while it is the only config, a clean that deletes refuses with exit 2 and names both files',
    async () => {
      const { home, cwd, env, named } = setup()
      const old = join(home, '.config', 'host-cleaner', 'config.json')
      write(old, JSON.stringify({ ignore: [cwd] }))
      const file = configFile(hostDirs(env))
      for (const args of [
        ['clean', '--yes', cwd],
        ['clean', '--plan', join(home, 'p.json'), '--yes'],
      ]) {
        const plugin = fake()
        const r = await run(args, cwd, env, { plugins: [plugin] })
        expect(r.code, args.join(' ')).toBe(2)
        expect(r.err).toBe(
          `workstation-cleaner clean: ${old} is not read, and there is no config at ${file}: move the file there, or pass --config; clean deletes nothing until then\n`,
        )
        expect(plugin.removed).toEqual([])
      }
      // A config the person names, or one at the new path, is read and the clean runs.
      const plugin = fake()
      const given = await run(['clean', '--yes', '--config', named, cwd], cwd, env, {
        plugins: [plugin],
      })
      expect(given.code).toBe(0)
      write(file, '{}')
      const r = await run(['clean', '--yes', cwd], cwd, env, { plugins: [plugin] })
      expect(r.code).toBe(0)
      expect(r.err).toContain(`${old} is not read; the config is now ${file}`)
      expect(plugin.removed).toEqual(['artifact:fake', 'artifact:fake'])
    },
  )
})

describe('HOST_CLEANER_* variables', () => {
  test('are found by name, with the names they have now; an empty one is unset', () => {
    expect(
      oldVariables({
        HOST_CLEANER_ROOT: '/r',
        HOST_CLEANER_CONFIG_DIR: '/c',
        HOST_CLEANER_LOGS_DIR: ' ',
        WORKSTATION_CLEANER_ROOT: '/n',
        HOST_CLEANERS: '/x',
      }),
    ).toEqual([
      { old: 'HOST_CLEANER_CONFIG_DIR', now: 'WORKSTATION_CLEANER_CONFIG_DIR' },
      { old: 'HOST_CLEANER_ROOT', now: 'WORKSTATION_CLEANER_ROOT' },
    ])
  })

  test.skipIf(process.platform === 'win32')(
    'every command warns about each one, with --config too',
    async () => {
      const { home, cwd, env, named } = setup()
      const set = { ...env, HOST_CLEANER_CONFIG_DIR: join(home, 'cfg') }
      for (const args of warnOnly(cwd)) {
        for (const extra of [[], ['--config', named]]) {
          const r = await run([...args, ...extra], cwd, set, { plugins: [fake()] })
          expect(r.code, args.join(' ')).toBe(0)
          expect(r.err, args.join(' ')).toBe(
            `workstation-cleaner ${args[0]}: HOST_CLEANER_CONFIG_DIR is not read; it is now WORKSTATION_CLEANER_CONFIG_DIR\n`,
          )
        }
      }
    },
  )

  test.skipIf(process.platform === 'win32')(
    'a clean that deletes refuses with exit 2 and names each with its new name',
    async () => {
      const { home, cwd, env, named } = setup()
      const file = configFile(hostDirs(env))
      write(file, '{}')
      const one = { ...env, HOST_CLEANER_CONFIG_DIR: join(home, 'cfg') }
      const two = { ...one, HOST_CLEANER_ROOT: home }
      const cases: [Record<string, string>, string][] = [
        [
          one,
          'HOST_CLEANER_CONFIG_DIR is not read: rename it to WORKSTATION_CLEANER_CONFIG_DIR, or unset it',
        ],
        [
          two,
          'HOST_CLEANER_CONFIG_DIR and HOST_CLEANER_ROOT are not read: rename them to WORKSTATION_CLEANER_CONFIG_DIR and WORKSTATION_CLEANER_ROOT, or unset them',
        ],
      ]
      for (const [set, why] of cases) {
        for (const args of [
          ['clean', '--yes', cwd],
          ['clean', '--yes', '--config', named, cwd],
          ['clean', '--plan', join(home, 'p.json'), '--yes'],
        ]) {
          const plugin = fake()
          const r = await run(args, cwd, set, { plugins: [plugin] })
          expect(r.code, args.join(' ')).toBe(2)
          expect(r.err).toBe(
            `workstation-cleaner clean: ${why}; clean deletes nothing until then\n`,
          )
          expect(plugin.removed).toEqual([])
        }
      }
      // Unset, the same clean runs.
      const plugin = fake()
      expect((await run(['clean', '--yes', cwd], cwd, env, { plugins: [plugin] })).code).toBe(0)
      expect(plugin.removed).toEqual(['artifact:fake'])
    },
  )
})
