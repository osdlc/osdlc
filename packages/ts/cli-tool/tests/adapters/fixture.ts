/** One app with every kind of command the adapters treat differently. */

import { z } from 'zod'

import { CommandError, commandKit, defineApp, type App } from '../../src/command/index.ts'
import { ConfigUsageError, configCommands, type ConfigStore } from '../../src/config-command.ts'
import { httpApiCommand } from '../../src/http/index.ts'
import { mcpCommand } from '../../src/mcp/index.ts'
import { trustCommand, type TrustService } from '../../src/trust-command.ts'

export const GLOBALS = {
  dir: { kind: 'string', short: 'C', valueName: 'path', help: 'the directory' },
} as const

export interface Fixture {
  app: App
  items: string[]
  trusted: Set<string>
  config: Record<string, Record<string, unknown>>
  /** Resolves when `watch` sees its signal abort. */
  aborted: Promise<void>
}

export function fixture(): Fixture {
  const kit = commandKit({ globals: GLOBALS })
  const items = ['a', 'b']
  const trusted = new Set<string>()
  const config: Record<string, Record<string, unknown>> = {
    user: { 'trust.paths': ['/home/**'] },
    project: { discovery: 'git', 'trust.paths': ['/**'] },
  }
  let markAborted: () => void = () => {}
  const aborted = new Promise<void>((resolve) => {
    markAborted = resolve
  })

  const ItemsOut = z.object({
    dir: z.string().nullable(),
    items: z.array(z.object({ name: z.string() })),
  })

  const list = kit.command({
    summary: 'every item',
    description: 'Lists the items.',
    output: ItemsOut,
    kind: 'items',
    items: { field: 'items', kind: 'item' },
    readOnly: true,
    run: ({ globals }) => ({ dir: globals.dir ?? null, items: items.map((name) => ({ name })) }),
    text: (o) => o.items.map((i) => `${i.name}\n`).join(''),
  })
  const add = kit.command({
    summary: 'add an item',
    flags: { times: { kind: 'count', short: 't', help: 'how many' } },
    positionals: [{ name: 'name', required: true, help: 'the item' }],
    output: ItemsOut,
    kind: 'items',
    run({ flags, positionals, globals }, ctx) {
      for (let i = 0; i < Math.max(1, flags.times); i++) items.push(positionals[0]!)
      ctx.note(`added ${positionals[0]}`)
      return { dir: globals.dir ?? null, items: items.map((name) => ({ name })) }
    },
  })
  const clear = kit.command({
    summary: 'remove every item',
    output: z.object({ removed: z.number() }),
    destructive: true,
    run() {
      const removed = items.length
      items.length = 0
      return { removed }
    },
  })
  const watch = kit.command({
    summary: 'count, sending an event per step',
    flags: {
      steps: { kind: 'string', default: '3', help: 'how many steps' },
      hang: { kind: 'boolean', help: 'wait to be cancelled' },
    },
    output: z.object({ steps: z.number(), cancelled: z.boolean() }),
    events: {
      schema: z.object({ step: z.number() }),
      kind: 'step',
      text: (e) => `step ${String(e['step'])}\n`,
    },
    async run({ flags }, ctx) {
      const steps = Number(flags.steps)
      for (let step = 1; step <= steps; step++) ctx.emit({ step })
      if (flags.hang) {
        await new Promise<void>((resolve) => {
          if (ctx.signal.aborted) resolve()
          ctx.signal.addEventListener('abort', () => resolve(), { once: true })
        })
        markAborted()
        return { steps, cancelled: true }
      }
      return { steps, cancelled: ctx.signal.aborted }
    },
  })
  const fails = kit.command({
    summary: 'always fails',
    output: z.object({}),
    run() {
      throw new CommandError('it broke', { hint: 'try again' })
    },
  })
  const secret = kit.command({
    summary: 'run from the command line only',
    output: z.object({ ok: z.boolean() }),
    exposure: 'cli-only',
    run: () => ({ ok: true }),
  })
  const tui = kit.command({ summary: 'the terminal UI', interactive: true, run: () => 0 })

  const store: ConfigStore = {
    layers: ['user', 'project'],
    defaultLayer: 'project',
    keys: ['discovery', 'trust.paths'],
    cliOnlyKeys: ['trust'],
    async list() {
      return {
        settings: ['discovery', 'trust.paths'].map((key) => {
          const source =
            key in config['project']! && key !== 'trust.paths'
              ? 'project'
              : key in config['user']!
                ? 'user'
                : 'default'
          return { key, value: source === 'default' ? 'auto' : config[source]![key], source }
        }),
      }
    },
    async locations() {
      return [
        { layer: 'user', path: '/u.json', exists: true },
        { layer: 'project', path: '/p.json', exists: true },
      ]
    },
    async set(_ctx, layer, key, value) {
      config[layer]![key] = value
      return { file: `/${layer}.json`, value }
    },
    async unset(_ctx, layer, key) {
      const removed = key in config[layer]!
      delete config[layer]![key]
      return { file: `/${layer}.json`, removed }
    },
    async explain(ctx, key) {
      if (!['discovery', 'trust.paths', 'extra'].includes(key))
        throw new ConfigUsageError(`unknown setting ${key}`)
      const env = ctx.env['T_DISCOVERY']
      return {
        layers: [
          {
            layer: 'default',
            set: key !== 'extra',
            value: key === 'discovery' ? 'auto' : [],
          },
          {
            layer: 'user',
            set: key in config['user']!,
            value: config['user']![key],
            file: '/u.json',
          },
          {
            layer: 'project',
            set: key in config['project']!,
            value: config['project']![key],
            file: '/p.json',
            ...(key === 'trust.paths'
              ? { allowed: false, note: 'a project file may not set it' }
              : {}),
          },
          {
            layer: 'env',
            set: key === 'discovery' && env !== undefined,
            value: env,
            envVar: 'T_DISCOVERY',
          },
          { layer: 'flag', set: false },
        ],
        warnings: [],
      }
    },
  }
  const service: TrustService = {
    async trust(ctx) {
      const changed = !trusted.has(ctx.cwd)
      trusted.add(ctx.cwd)
      return { root: ctx.cwd, trusted: true, by: 'marker', changed }
    },
    async untrust(ctx) {
      const changed = trusted.delete(ctx.cwd)
      return { root: ctx.cwd, trusted: false, by: null, changed }
    },
    async show(ctx) {
      return {
        root: ctx.cwd,
        trusted: trusted.has(ctx.cwd),
        by: trusted.has(ctx.cwd) ? 'marker' : null,
      }
    },
    async list() {
      return [...trusted].map((root) => ({ root, trusted: true, by: 'marker' }))
    },
  }

  const app = defineApp({
    name: 'tooly',
    version: '1.2.3',
    summary: 'a tool for the adapter tests',
    globals: GLOBALS,
    checkOutput: true,
    commands: {
      items: kit.group({ summary: 'the items', default: list, commands: { list, add, clear } }),
      watch,
      fails,
      secret,
      tui,
      config: configCommands(store, { globals: GLOBALS }),
      trust: trustCommand(service, { globals: GLOBALS }),
      mcp: mcpCommand({ globals: GLOBALS }),
      'serve-api': httpApiCommand({ globals: GLOBALS }),
    },
  })
  return { app, items, trusted, config, aborted }
}
