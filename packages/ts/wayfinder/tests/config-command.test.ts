/**
 * `way config`: cli-tool's shared `config` group over wayfinder's store.
 *
 * Every case runs with HOME at a throwaway directory, so nothing reads or
 * edits the developer's own `~/.config/wayfinder/config.json`.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { CONFIG_SCHEMA_URL } from '../src/config.ts'
import { runWay, wayApp } from './app-support.ts'
import { USER_CONFIG, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function track(files: Record<string, string> = {}): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/** A project root and a home, with optional files in each. */
async function scenario(
  files: { project?: unknown; projectText?: string; user?: unknown } = {},
  env: Record<string, string | undefined> = {},
) {
  const root = await track({ 'package.json': '{}' })
  const home = await track()
  const userFile = join(home, USER_CONFIG)
  const projectFile = join(root, 'wayfinder.config.json')
  const write = async (file: string, text: string): Promise<void> => {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, text, 'utf-8')
  }
  if (files.user !== undefined) await write(userFile, JSON.stringify(files.user))
  if (files.projectText !== undefined) await write(projectFile, files.projectText)
  else if (files.project !== undefined) await write(projectFile, JSON.stringify(files.project))
  return {
    root,
    home,
    userFile,
    projectFile,
    run: (argv: string[]) => runWay(argv, { cwd: root, home, env }),
    file: async (path: string) => JSON.parse(await readFile(path, 'utf-8')) as unknown,
  }
}

describe('config list', () => {
  test('names the layer that supplied each value, defaults included', async () => {
    const s = await scenario({ user: { open: 'web' }, project: { discovery: 'git' } })
    const ran = await s.run(['config', 'list', '--json'])
    expect(ran.exit).toBe(0)
    const doc = ran.json<{ settings: { key: string; value: unknown; source: string }[] }>()
    const by = Object.fromEntries(doc.settings.map((x) => [x.key, x]))
    expect(by['open']).toEqual({ key: 'open', value: 'web', source: 'user' })
    expect(by['discovery']).toEqual({ key: 'discovery', value: 'git', source: 'project' })
    expect(by['allowExec']).toEqual({ key: 'allowExec', value: true, source: 'default' })
    expect(by['trust.tools']).toEqual({ key: 'trust.tools', value: {}, source: 'default' })
  })

  test('bare config lists, with the files on stderr', async () => {
    const s = await scenario()
    const ran = await s.run(['config'])
    expect(ran.exit).toBe(0)
    expect(ran.out).toMatch(/^allowExec\s+true\s+\(default\)$/m)
    expect(ran.err).toContain(s.userFile)
    expect(ran.err).toContain(s.projectFile)
  })

  test('an unknown key is a warning with a did-you-mean, and the rest still lists', async () => {
    const s = await scenario({ project: { discovry: 'git', allowExec: false } })
    const ran = await s.run(['config', 'list'])
    expect(ran.exit).toBe(0)
    expect(ran.err).toContain('unknown setting "discovry" (ignored); did you mean discovery?')
    expect(ran.out).toMatch(/^allowExec\s+false\s+\(project\)$/m)
  })

  test('a malformed file fails with exit 1, naming the file', async () => {
    const s = await scenario({ projectText: '{ nope' })
    const ran = await s.run(['config', 'list'])
    expect(ran.exit).toBe(1)
    expect(ran.err).toContain(s.projectFile)
  })

  test('-C names the project, and a directory that does not exist is an error', async () => {
    const s = await scenario({ project: { discovery: 'walk' } })
    const other = await track()
    const ran = await runWay(['config', 'get', 'discovery', '-C', s.root], {
      cwd: other,
      home: s.home,
    })
    expect(ran.out).toBe('"walk"\n')
    const missing = await runWay(['config', 'set', 'discovery', 'git', '-C', join(other, 'typo')], {
      cwd: other,
      home: s.home,
    })
    expect(missing.exit).toBe(1)
    expect(missing.err).toContain('no such directory')
    expect(await readdir(other)).toEqual([])
  })
})

describe('config get', () => {
  test('prints the effective value as JSON', async () => {
    const s = await scenario({ project: { runners: { order: ['just'] } } })
    expect((await s.run(['config', 'get', 'runners.order'])).out).toBe('["just"]\n')
  })

  test('a key with no value exits 1', async () => {
    const s = await scenario()
    const ran = await s.run(['config', 'get', 'nope'])
    expect(ran.exit).toBe(1)
    expect(ran.err).toContain('no value for nope')
  })
})

describe('config set and unset', () => {
  test('--project is the default, and the file gets $schema', async () => {
    const s = await scenario()
    const ran = await s.run(['config', 'set', 'discovery', 'git'])
    expect(ran.exit).toBe(0)
    expect(ran.out).toBe(`${s.projectFile}: discovery = "git"\n`)
    expect(await s.file(s.projectFile)).toEqual({ $schema: CONFIG_SCHEMA_URL, discovery: 'git' })
  })

  test('--user writes the user file, and JSON values keep their type', async () => {
    const s = await scenario()
    await s.run(['config', 'set', '--user', 'runners.order', '["moon","just"]'])
    await s.run(['config', 'set', '--user', 'open', 'web'])
    expect(await s.file(s.userFile)).toEqual({
      $schema: CONFIG_SCHEMA_URL,
      runners: { order: ['moon', 'just'] },
      open: 'web',
    })
  })

  test('keeps a key this version does not know', async () => {
    const s = await scenario({ project: { futureThing: { keep: true } } })
    await s.run(['config', 'set', 'allowExec', 'false'])
    expect(await s.file(s.projectFile)).toMatchObject({
      futureThing: { keep: true },
      allowExec: false,
    })
  })

  test('an unknown key is exit 2 with a did-you-mean', async () => {
    const s = await scenario()
    const ran = await s.run(['config', 'set', 'runners.ordr', '[]'])
    expect(ran.exit).toBe(2)
    expect(ran.err).toContain('unknown setting: runners.ordr; did you mean runners.order?')
  })

  test('a wrong value is exit 2, and the file is untouched', async () => {
    const s = await scenario({ project: { discovery: 'walk' } })
    const ran = await s.run(['config', 'set', 'discovery', 'sideways'])
    expect(ran.exit).toBe(2)
    expect(ran.err).toContain('discovery must be one of git, walk, auto')
    expect(await s.file(s.projectFile)).toEqual({ discovery: 'walk' })
  })

  test('refuses what a project file may not hold, as the web view does', async () => {
    const s = await scenario()
    for (const [key, value, says] of [
      ['allowExec', 'true', 'way trust'],
      ['trust.paths', '["/x/**"]', 'grant itself trust'],
      ['trust.tools.mise.owners', '["org"]', 'grant itself trust'],
      ['open', 'web', 'user config'],
      ['theme', 'dark', 'user config'],
    ] as const) {
      const ran = await s.run(['config', 'set', key, value])
      expect(ran.exit, key).toBe(2)
      expect(ran.err).toContain(says)
    }
    expect(await readdir(s.root)).toEqual(['package.json'])
  })

  test('the same keys are accepted in the user file', async () => {
    const s = await scenario()
    const tools = await s.run(['config', 'set', '--user', 'trust.tools.mise.paths', '["~/w/**"]'])
    expect(tools.exit).toBe(0)
    expect((await s.run(['config', 'set', '--user', 'theme', 'light'])).exit).toBe(0)
    expect(await s.file(s.userFile)).toEqual({
      $schema: CONFIG_SCHEMA_URL,
      trust: { tools: { mise: { paths: ['~/w/**'] } } },
      theme: 'light',
    })
  })

  test('a bad value already in the file exits 1, naming the file', async () => {
    const s = await scenario({ project: { excludePaths: 'not-a-list' } })
    const ran = await s.run(['config', 'set', 'discovery', 'git'])
    expect(ran.exit).toBe(1)
    expect(ran.err).toContain(s.projectFile)
  })

  test('unset removes a nested key and the container it emptied', async () => {
    const s = await scenario({ project: { runners: { order: ['x'] } } })
    expect((await s.run(['config', 'unset', 'runners.order'])).exit).toBe(0)
    expect(await s.file(s.projectFile)).toEqual({ $schema: CONFIG_SCHEMA_URL })
  })

  test('unset of a key that is not set exits 1', async () => {
    const s = await scenario()
    const ran = await s.run(['config', 'unset', 'discovery'])
    expect(ran.exit).toBe(1)
    expect(ran.err).toContain(`discovery is not set in ${s.projectFile}`)
  })

  test('--user and --project together are a usage error', async () => {
    const s = await scenario()
    const ran = await s.run(['config', 'set', '--user', '--project', 'discovery', 'git'])
    expect(ran.exit).toBe(2)
  })

  test('set --user creates the file WAYFINDER_CONFIG names', async () => {
    const elsewhere = await track()
    const named = join(elsewhere, 'mine.json')
    const s = await scenario({}, { WAYFINDER_CONFIG: named })
    expect((await s.run(['config', 'set', '--user', 'open', 'web'])).exit).toBe(0)
    expect(await s.file(named)).toMatchObject({ open: 'web' })
  })
})

describe('config path', () => {
  test('names both files, whether each exists, and the variable that moved one', async () => {
    const elsewhere = await track({ 'mine.json': '{}' })
    const s = await scenario({ project: {} }, { WAYFINDER_CONFIG: join(elsewhere, 'mine.json') })
    const ran = await s.run(['config', 'path', '--json'])
    expect(ran.json()).toMatchObject({
      locations: [
        {
          layer: 'user',
          path: join(elsewhere, 'mine.json'),
          exists: true,
          envVar: 'WAYFINDER_CONFIG',
        },
        { layer: 'project', path: s.projectFile, exists: true },
      ],
    })
  })

  test('still answers when the project file is broken', async () => {
    const s = await scenario({ projectText: '{ nope' })
    expect((await s.run(['config', 'path'])).exit).toBe(0)
  })

  test('warns about a relative WAYFINDER_CONFIG', async () => {
    const s = await scenario({}, { WAYFINDER_CONFIG: 'rel.json' })
    const ran = await s.run(['config', 'path'])
    expect(ran.err).toContain('WAYFINDER_CONFIG=rel.json is ignored')
  })
})

describe('config explain', () => {
  test('shows each layer, the winner and why', async () => {
    const s = await scenario({ user: { discovery: 'walk' }, project: { discovery: 'git' } })
    const ran = await s.run(['config', 'explain', 'discovery', '--json'])
    expect(ran.exit).toBe(0)
    expect(ran.json()).toMatchObject({
      key: 'discovery',
      value: 'git',
      source: 'project',
      layers: [
        { layer: 'default', set: true, value: 'auto', won: false },
        { layer: 'user', set: true, value: 'walk', won: false, file: s.userFile },
        { layer: 'project', set: true, value: 'git', won: true, file: s.projectFile },
      ],
    })
  })

  test('a project allowExec: true is shown as ignored, with the reason', async () => {
    const s = await scenario({ project: { allowExec: true } })
    const ran = await s.run(['config', 'explain', 'allowExec'])
    expect(ran.exit).toBe(0)
    expect(ran.out).toContain('allowExec = true  (default is the highest layer allowed to set it')
    expect(ran.out).toMatch(/project\s+true\s+ignored: a repository cannot turn execution on/)
  })

  test('trust.tools: the user layer wins and a project block is ignored', async () => {
    const s = await scenario({
      user: { trust: { tools: { mise: { paths: ['/u/**'] } } } },
      project: { trust: { tools: { mise: { paths: ['/**'] } } } },
    })
    const ran = await s.run(['config', 'explain', 'trust.tools.mise', '--json'])
    expect(ran.json()).toMatchObject({
      value: { paths: ['/u/**'] },
      source: 'user',
      layers: [
        { layer: 'default', set: false },
        { layer: 'user', set: true, won: true },
        {
          layer: 'project',
          set: true,
          allowed: false,
          note: 'a repository cannot grant itself trust',
        },
      ],
    })
  })

  test('the user file named by WAYFINDER_CONFIG carries the variable', async () => {
    const elsewhere = await track({ 'mine.json': '{"open":"web"}' })
    const s = await scenario({}, { WAYFINDER_CONFIG: join(elsewhere, 'mine.json') })
    const ran = await s.run(['config', 'explain', 'open', '--json'])
    expect(ran.json<{ layers: unknown[] }>().layers[1]).toMatchObject({
      layer: 'user',
      envVar: 'WAYFINDER_CONFIG',
      won: true,
    })
  })

  test('an unknown key is exit 2 with a did-you-mean', async () => {
    const s = await scenario()
    const ran = await s.run(['config', 'explain', 'them'])
    expect(ran.exit).toBe(2)
    expect(ran.err).toContain('did you mean theme?')
  })
})

describe('config over the adapters', () => {
  test('trust, allowExec and tools cannot be written over MCP or HTTP', async () => {
    const s = await scenario()
    const app = wayApp()
    const ctx = { cwd: s.root, env: { HOME: s.home } }
    for (const key of [
      'allowExec',
      'tools',
      'trust.paths',
      'trust.tools.mise.paths',
      'TRUST.owners',
    ]) {
      for (const surface of ['mcp', 'http'] as const) {
        const result = await app.call(['config', 'set'], { key, value: '[]' }, ctx, { surface })
        expect(result, `${surface} ${key}`).toMatchObject({ status: 'refused', reason: 'cli-only' })
      }
    }
    const ok = await app.call(['config', 'set'], { key: 'discovery', value: 'git' }, ctx, {
      surface: 'mcp',
    })
    expect(ok).toMatchObject({ status: 'ok' })
    const read = await app.call(['config', 'get'], { key: 'allowExec' }, ctx, { surface: 'http' })
    expect(read).toMatchObject({ status: 'ok', document: { value: true } })
  })
})
