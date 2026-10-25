import { describe, expect, test } from 'vitest'

import { defineApp } from '../src/command/index.ts'
import {
  ConfigUsageError,
  configCommands,
  parseConfigValue,
  type ConfigStore,
} from '../src/config-command.ts'
import { guideCommand, type GuideTopic } from '../src/guide.ts'
import { checkGuide, runApp } from '../src/testing.ts'
import { trustCommand, type TrustEntry, type TrustService } from '../src/trust-command.ts'

const KEYS = ['discovery', 'runners.order', 'runners.disabled']

function memoryStore(): ConfigStore & { files: Record<string, Record<string, unknown>> } {
  const files: Record<string, Record<string, unknown>> = { user: {}, project: { discovery: 'git' } }
  return {
    files,
    layers: ['user', 'project'],
    defaultLayer: 'project',
    keys: KEYS,
    async list() {
      const settings = KEYS.map((key) => {
        const source =
          key in files['project']! ? 'project' : key in files['user']! ? 'user' : 'default'
        const value =
          source === 'default' ? (key === 'discovery' ? 'auto' : []) : files[source]![key]
        return { key, value, source }
      })
      return { settings, warnings: ['old file ignored'] }
    },
    async locations() {
      return [
        { layer: 'user', path: '/home/u/.config/t/config.json', exists: true, envVar: 'T_CONFIG' },
        { layer: 'project', path: '/repo/t.json', exists: false },
      ]
    },
    async set(_ctx, layer, key, value) {
      if (!KEYS.includes(key)) throw new ConfigUsageError(`unknown setting ${key}`)
      if (key === 'discovery' && typeof value !== 'string') {
        throw new ConfigUsageError('discovery takes a string')
      }
      files[layer]![key] = value
      return {
        file: `/${layer}.json`,
        value,
        ...(layer === 'project' ? { warnings: ['ignored here'] } : {}),
      }
    },
    async unset(_ctx, layer, key) {
      const removed = key in files[layer]!
      delete files[layer]![key]
      return { file: `/${layer}.json`, removed }
    },
  }
}

function trustService(): TrustService & { marked: Set<string> } {
  const marked = new Set<string>()
  const entry = (root: string, scope?: string): TrustEntry => ({
    root,
    trusted: marked.has(root) || root.startsWith('/policy'),
    by: marked.has(root) ? 'marker' : root.startsWith('/policy') ? 'path' : null,
    ...(root.startsWith('/policy') ? { rule: '/policy/**' } : {}),
    ...(scope !== undefined ? { scope } : {}),
  })
  return {
    marked,
    scopes: true,
    async trust(ctx, req) {
      const changed = !marked.has(ctx.cwd)
      marked.add(ctx.cwd)
      return { ...entry(ctx.cwd, req.scope), changed }
    },
    async untrust(ctx, req) {
      const changed = marked.delete(ctx.cwd)
      return { ...entry(ctx.cwd, req.scope), changed }
    },
    async show(ctx, req) {
      return entry(ctx.cwd, req.scope)
    },
    async list() {
      return [...marked].map((r) => entry(r))
    },
  }
}

const TOPICS: GuideTopic[] = [
  {
    id: 'usage',
    title: 'Usage',
    summary: 'how to run it',
    body: () => 'Run `t config list --json`.',
  },
  {
    id: 'trust',
    title: 'Trust',
    summary: 'what trust means',
    body: (ctx) => `Run ${ctx.app.name} trust --show.`,
  },
]

function appWith(store = memoryStore(), trust = trustService(), topics = TOPICS) {
  return defineApp({
    name: 't',
    version: '0.1.0',
    summary: 'a tool',
    commands: {
      config: configCommands(store),
      trust: trustCommand(trust),
      guide: guideCommand(topics, { title: 't guide', intro: 'How to use t.' }),
    },
  })
}

describe('config', () => {
  test('parseConfigValue reads JSON, else the bare string', () => {
    expect(parseConfigValue('["a"]')).toEqual(['a'])
    expect(parseConfigValue('git')).toBe('git')
    expect(parseConfigValue('true')).toBe(true)
  })

  test('config lists every setting with its source; locations and warnings go to stderr', async () => {
    const r = await runApp(appWith(), ['config'])
    expect(r.exit).toBe(0)
    expect(r.out).toBe(
      'discovery         "git"  (project)\nrunners.order     []     (default)\nrunners.disabled  []     (default)\n',
    )
    expect(r.err).toContain('t: warning: old file ignored\n')
    expect(r.err).toContain('user:    /home/u/.config/t/config.json (exists) (from T_CONFIG)\n')
    expect(r.err).toContain('project: /repo/t.json (missing)\n')
  })

  test('config list --json', async () => {
    const r = await runApp(appWith(), ['config', 'list', '--json'])
    expect(r.json()).toMatchObject({
      schemaVersion: 1,
      kind: 'config-list',
      settings: [{ key: 'discovery', value: 'git', source: 'project' }, {}, {}],
      locations: [{ layer: 'user' }, { layer: 'project', exists: false }],
    })
  })

  test('config get prints the value as JSON, and reads a parent key', async () => {
    const app = appWith()
    expect((await runApp(app, ['config', 'get', 'discovery'])).out).toBe('"git"\n')
    const parent = await runApp(app, ['config', 'get', 'runners', '--json'])
    expect(parent.json()).toMatchObject({
      key: 'runners',
      value: { order: [], disabled: [] },
      source: 'default',
    })
  })

  test('config get of an unknown key exits 1 and suggests a close one', async () => {
    const r = await runApp(appWith(), ['config', 'get', 'discovry'])
    expect(r.exit).toBe(1)
    expect(r.err).toContain('t: no value for discovry; did you mean discovery?\n')
  })

  test('config set writes the default layer and passes warnings on', async () => {
    const store = memoryStore()
    const r = await runApp(appWith(store), ['config', 'set', 'runners.order', '["moon"]'])
    expect(r).toMatchObject({ exit: 0, out: '/project.json: runners.order = ["moon"]\n' })
    expect(r.err).toBe('t: warning: ignored here\n')
    expect(store.files['project']!['runners.order']).toEqual(['moon'])
  })

  test('config set --user writes the user layer', async () => {
    const store = memoryStore()
    const r = await runApp(appWith(store), [
      'config',
      'set',
      'discovery',
      'walk',
      '--user',
      '--json',
    ])
    expect(r.json()).toMatchObject({
      kind: 'config-set',
      layer: 'user',
      file: '/user.json',
      value: 'walk',
    })
    expect(store.files['user']!['discovery']).toBe('walk')
  })

  test('two layer flags, an unknown key or a bad value are usage errors', async () => {
    const app = appWith()
    const both = await runApp(app, ['config', 'set', 'discovery', 'x', '--user', '--project'])
    expect(both.exit).toBe(2)
    expect(both.err).toContain('--user and --project name different files')
    const unknown = await runApp(app, ['config', 'set', 'runner.order', '[]'])
    expect(unknown.exit).toBe(2)
    expect(unknown.err).toContain('unknown setting runner.order; did you mean runners.order?')
    const bad = await runApp(app, ['config', 'set', 'discovery', '3'])
    expect(bad.exit).toBe(2)
    expect((await runApp(app, ['config', 'set', 'discovery'])).exit).toBe(2)
  })

  test('config set reports any other store error as exit 1', async () => {
    const store = memoryStore()
    store.set = async () => {
      throw new Error('cannot write /project.json')
    }
    await expect(runApp(appWith(store), ['config', 'set', 'discovery', 'x'])).rejects.toThrow(
      'cannot write',
    )
  })

  test('config unset removes a key, and exits 1 when it was not set there', async () => {
    const store = memoryStore()
    const app = appWith(store)
    expect((await runApp(app, ['config', 'unset', 'discovery'])).out).toBe(
      '/project.json: removed discovery\n',
    )
    const again = await runApp(app, ['config', 'unset', 'discovery', '--json'])
    expect(again).toMatchObject({
      exit: 1,
      out: '',
      err: 't: discovery is not set in /project.json\n',
    })
  })

  test('config path names each file', async () => {
    const r = await runApp(appWith(), ['config', 'path'])
    expect(r.out).toBe(
      'user:    /home/u/.config/t/config.json (exists) (from T_CONFIG)\nproject: /repo/t.json (missing)\n',
    )
    expect((await runApp(appWith(), ['config', 'path', 'extra'])).exit).toBe(2)
  })

  test('a default layer outside the layers is refused', () => {
    expect(() => configCommands({ ...memoryStore(), defaultLayer: 'machine' })).toThrow(
      "defaultLayer 'machine'",
    )
  })
})

describe('trust', () => {
  test('trust records the root; again says already trusted', async () => {
    const app = appWith()
    expect((await runApp(app, ['trust'], { cwd: '/repo' })).out).toBe('trusted /repo\n')
    const again = await runApp(app, ['trust', '--json'], { cwd: '/repo' })
    expect(again.json()).toEqual({
      schemaVersion: 1,
      kind: 'trust',
      action: 'trust',
      changed: false,
      roots: [{ root: '/repo', trusted: true, by: 'marker' }],
    })
  })

  test('--show answers trusted or not, exit 0 either way', async () => {
    const app = appWith()
    expect((await runApp(app, ['trust', '--show'], { cwd: '/repo' })).out).toBe(
      'not trusted /repo\n',
    )
    const policy = await runApp(app, ['trust', '--show'], { cwd: '/policy/x' })
    expect(policy).toMatchObject({ exit: 0, out: 'trusted /policy/x (by path)\n' })
  })

  test('--untrust removes the marker; with none it prints the answer and exits 1', async () => {
    const svc = trustService()
    svc.marked.add('/repo')
    const app = appWith(memoryStore(), svc)
    expect((await runApp(app, ['trust', '--untrust'], { cwd: '/repo' })).out).toBe(
      'untrusted /repo\n',
    )
    const none = await runApp(app, ['trust', '--untrust', '--json'], { cwd: '/repo' })
    expect(none.exit).toBe(1)
    expect(none.json()).toMatchObject({ action: 'untrust', changed: false })
    expect(none.err).toBe('t: not trusted: /repo\n')
  })

  test('--untrust says when a policy still trusts the root', async () => {
    const svc = trustService()
    svc.marked.add('/policy/x')
    const r = await runApp(appWith(memoryStore(), svc), ['trust', '--untrust'], {
      cwd: '/policy/x',
    })
    expect(r.err).toBe(
      "t: /policy/x is still trusted by path ('/policy/**'); removing the marker changes nothing\n",
    )
  })

  test('--list prints every root, and --scope is passed on', async () => {
    const svc = trustService()
    svc.marked.add('/a')
    svc.marked.add('/b')
    const app = appWith(memoryStore(), svc)
    expect((await runApp(app, ['trust', '--list'])).out).toBe('/a\n/b\n')
    const scoped = await runApp(app, ['trust', '--show', '--scope', 'moon', '--json'], {
      cwd: '/a',
    })
    expect(scoped.json()).toMatchObject({ roots: [{ root: '/a', scope: 'moon' }] })
  })

  test('two modes together are a usage error', async () => {
    const r = await runApp(appWith(), ['trust', '--show', '--list'])
    expect(r.exit).toBe(2)
    expect(r.err).toContain('--show and --list ask different things')
  })

  test('without scopes there is no --scope flag', async () => {
    const svc = { ...trustService(), scopes: false }
    expect((await runApp(appWith(memoryStore(), svc), ['trust', '--scope', 'x'])).exit).toBe(2)
  })
})

describe('guide', () => {
  test('the whole guide, one topic, and the topic list', async () => {
    const app = appWith()
    const all = await runApp(app, ['guide'])
    expect(all.out).toBe(
      '# t guide\n\nHow to use t.\n\n## Usage\n\nRun `t config list --json`.\n\n## Trust\n\nRun t trust --show.\n',
    )
    expect((await runApp(app, ['guide', 'trust'])).out).toBe('## Trust\n\nRun t trust --show.\n')
    expect((await runApp(app, ['guide', 'topics'])).out).toBe(
      'usage  how to run it\ntrust  what trust means\n',
    )
  })

  test('JSON forms', async () => {
    const app = appWith()
    const list = await runApp(app, ['guide', 'topics', '--json'])
    expect(list.json()).toEqual({
      schemaVersion: 1,
      kind: 'guide',
      topic: null,
      topics: [
        { id: 'usage', title: 'Usage', summary: 'how to run it' },
        { id: 'trust', title: 'Trust', summary: 'what trust means' },
      ],
    })
    const one = await runApp(app, ['guide', 'usage', '--json'])
    expect(one.json()).toMatchObject({
      topic: 'usage',
      topics: [{ body: 'Run `t config list --json`.' }],
    })
  })

  test('an unknown topic or two topics are exit 2', async () => {
    const r = await runApp(appWith(), ['guide', 'nope'])
    expect(r.exit).toBe(2)
    expect(r.err).toContain("unknown topic 'nope'; topics are: topics, usage, trust")
    expect((await runApp(appWith(), ['guide', 'usage', 'trust'])).exit).toBe(2)
  })

  test('bad topic ids are refused', () => {
    const body = () => ''
    expect(() =>
      guideCommand([{ id: 'Bad', title: 'x', summary: 'x', body }], { title: 't' }),
    ).toThrow('bad topic id')
    expect(() =>
      guideCommand([{ id: 'topics', title: 'x', summary: 'x', body }], { title: 't' }),
    ).toThrow('reserved')
    expect(() =>
      guideCommand(
        [
          { id: 'a', title: 'x', summary: 'x', body },
          { id: 'a', title: 'x', summary: 'x', body },
        ],
        { title: 't' },
      ),
    ).toThrow('duplicate')
  })

  test('checkGuide passes a sound guide', async () => {
    expect(await checkGuide(appWith())).toEqual([])
  })

  test('checkGuide reports a flag no command takes', async () => {
    const topics: GuideTopic[] = [
      { id: 'x', title: 'X', summary: 'x', body: () => 'Pass --frobnicate or -Z.' },
    ]
    expect(await checkGuide(appWith(memoryStore(), trustService(), topics))).toEqual([
      'topic x names --frobnicate, which no command takes',
      'topic x names -Z, which no command takes',
    ])
    expect(
      await checkGuide(appWith(memoryStore(), trustService(), topics), {
        allow: ['--frobnicate', '-Z'],
      }),
    ).toEqual([])
  })
})
