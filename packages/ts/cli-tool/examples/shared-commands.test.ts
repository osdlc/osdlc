/**
 * The shared `config`, `trust` and `guide` commands and the test helpers, used
 * the way a consumer uses them. A tool supplies a store, a trust service and
 * its topics; the commands parse, render and pick the exit code. Every export
 * of the four entries appears here.
 */

import { expect, test } from 'vitest'

import { defineApp } from '@osdlc/cli-tool/command'
import {
  ConfigExplainSchema,
  ConfigUsageError,
  configCommands,
  parseConfigValue,
  type ConfigLayerValue,
  type ConfigLocation,
  type ConfigSetting,
  type ConfigStore,
} from '@osdlc/cli-tool/config-command'
import {
  GuideOutputSchema,
  guideCommand,
  type GuideOptions,
  type GuideTopic,
} from '@osdlc/cli-tool/guide'
import {
  acceptedFlags,
  checkApp,
  checkGuide,
  flagTokens,
  runApp,
  type AppRun,
  type CheckGuideOptions,
} from '@osdlc/cli-tool/testing'
import {
  TrustOutputSchema,
  trustCommand,
  type TrustEntry,
  type TrustRequest,
  type TrustService,
} from '@osdlc/cli-tool/trust-command'

// The tool's settings, kept in memory here. A real store reads and writes its files.
const files: Record<string, Record<string, unknown>> = { user: {}, project: {} }
const store: ConfigStore = {
  layers: ['user', 'project'],
  defaultLayer: 'project',
  keys: ['color', 'paths'],
  // The adapters (MCP, HTTP) may not write these; the command line may.
  cliOnlyKeys: ['paths'],
  async list() {
    const settings: ConfigSetting[] = ['color', 'paths'].map((key) => {
      const layer = ['project', 'user'].find((l) => key in files[l]!)
      return {
        key,
        value: layer === undefined ? null : files[layer]![key],
        source: layer ?? 'default',
      }
    })
    return { settings }
  },
  async locations(ctx) {
    const locations: ConfigLocation[] = [
      { layer: 'user', path: `${ctx.env['HOME'] ?? '~'}/.config/tooly/config.json`, exists: true },
      { layer: 'project', path: `${ctx.cwd}/tooly.json`, exists: false },
    ]
    return locations
  },
  async set(_ctx, layer, key, value) {
    if (key !== 'color' && key !== 'paths') throw new ConfigUsageError(`unknown setting ${key}`)
    files[layer]![key] = value
    return { file: `${layer}.json`, value }
  },
  async unset(_ctx, layer, key) {
    const removed = key in files[layer]!
    delete files[layer]![key]
    return { file: `${layer}.json`, removed }
  },
  // Each layer's part, lowest precedence first. `paths` is user-only here.
  async explain(ctx, key) {
    if (key !== 'color' && key !== 'paths') throw new ConfigUsageError(`unknown setting ${key}`)
    const layers: ConfigLayerValue[] = [
      { layer: 'default', set: true, value: key === 'color' ? 'auto' : [] },
      { layer: 'user', set: key in files['user']!, value: files['user']![key] },
      {
        layer: 'project',
        set: key in files['project']!,
        value: files['project']![key],
        ...(key === 'paths' ? { allowed: false, note: 'user-only' } : {}),
      },
      {
        layer: 'env',
        set: ctx.env['TOOLY_COLOR'] !== undefined && key === 'color',
        value: ctx.env['TOOLY_COLOR'],
      },
    ]
    return { layers }
  },
}

// Trust, over a set of roots. A real service uses `@osdlc/trust-repo`.
const trusted = new Set<string>()
const service: TrustService = {
  async trust(ctx, req: TrustRequest) {
    const changed = !trusted.has(ctx.cwd)
    trusted.add(ctx.cwd)
    return { root: ctx.cwd, trusted: true, by: 'marker', changed, ...req }
  },
  async untrust(ctx) {
    const changed = trusted.delete(ctx.cwd)
    return { root: ctx.cwd, trusted: false, by: null, changed }
  },
  async show(ctx) {
    const entry: TrustEntry = {
      root: ctx.cwd,
      trusted: trusted.has(ctx.cwd),
      by: trusted.has(ctx.cwd) ? 'marker' : null,
    }
    return entry
  },
  async list() {
    return [...trusted].map((root) => ({ root, trusted: true, by: 'marker' }))
  },
}

const topics: GuideTopic[] = [
  {
    id: 'start',
    title: 'Getting started',
    summary: 'the first run',
    body: () => 'Run `tooly trust`, then `tooly config list`.',
  },
]
const guideOptions: GuideOptions<Record<never, never>> = { title: 'tooly guide' }

const app = defineApp({
  name: 'tooly',
  version: '1.0.0',
  summary: 'a tool with shared commands',
  commands: {
    config: configCommands(store),
    trust: trustCommand(service),
    guide: guideCommand(topics, guideOptions),
  },
})

test('config reads and writes through the store', async () => {
  expect(parseConfigValue('["a","b"]')).toEqual(['a', 'b'])
  expect((await runApp(app, ['config', 'set', 'color', 'always'])).out).toBe(
    'project.json: color = "always"\n',
  )
  const run: AppRun = await runApp(app, ['config', 'get', 'color', '--json'])
  expect(run.json()).toMatchObject({ kind: 'config-get', value: 'always', source: 'project' })
  expect((await runApp(app, ['config', 'set', 'colour', 'x'])).exit).toBe(2)
})

test('config explain shows which layer won and why', async () => {
  await runApp(app, ['config', 'set', 'paths', '["/a"]', '--user'])
  await runApp(app, ['config', 'set', 'paths', '["/b"]', '--project'])
  const run = await runApp(app, ['config', 'explain', 'paths', '--json'])
  const doc = ConfigExplainSchema.parse(run.json())
  expect(doc).toMatchObject({ value: ['/a'], source: 'user' })
  expect(doc.reason).toBe(
    'user is the highest layer allowed to set it; project is ignored (user-only)',
  )
})

test('trust records consent, with one JSON shape for every mode', async () => {
  const run = await runApp(app, ['trust', '--json'], { cwd: '/work/repo' })
  expect(TrustOutputSchema.parse(JSON.parse(run.out))).toMatchObject({
    action: 'trust',
    changed: true,
  })
  expect((await runApp(app, ['trust', '--list'])).out).toBe('/work/repo\n')
})

test('guide prints topics, and the shared checks pass', async () => {
  const run = await runApp(app, ['guide', 'start', '--json'])
  expect(GuideOutputSchema.parse(JSON.parse(run.out)).topics[0]!.id).toBe('start')

  const opts: CheckGuideOptions = { allow: [] }
  expect(await checkGuide(app, opts)).toEqual([])
  expect(checkApp(app)).toEqual([])
  expect(acceptedFlags(app).has('--untrust')).toBe(true)
  expect([...flagTokens('use --json or -C dir')]).toEqual(['--json', '-C'])
})
