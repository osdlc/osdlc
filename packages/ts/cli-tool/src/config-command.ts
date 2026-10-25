/**
 * `config list/get/set/unset/path`, the same in every tool. The tool supplies
 * a {@link ConfigStore} over its own files and schema. This module parses the
 * command line, picks the exit code and renders the answer.
 */

import { z } from 'zod'

import { closestMatches } from '@osdlc/config-layers/did-you-mean'

import {
  CommandError,
  UsageError,
  commandKit,
  type CommandContext,
  type Group,
} from './command/index.ts'
import type { FlagSpec } from './define-cli.ts'

/**
 * One setting and the layer its effective value came from.
 * @experimental
 */
export interface ConfigSetting {
  /** The dotted key: `runners.order`. */
  key: string
  value: unknown
  /** The layer that set it, or `default` when no file did. */
  source: string
}

/**
 * Where one layer's file lives.
 * @experimental
 */
export interface ConfigLocation {
  layer: string
  path: string
  exists: boolean
  /** The environment variable that moved the file, when one did. */
  envVar?: string | null | undefined
}

/**
 * A setting name or value that is wrong as typed. `set` reports it as a
 * usage error (exit 2) rather than a failed run.
 * @experimental
 */
export class ConfigUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigUsageError'
  }
}

/**
 * What the `config` commands need from a tool. Each method receives the
 * command context, so it can read `ctx.cwd`, `ctx.env` and the tool's global
 * flags (such as `-C`) from `ctx`. A method that cannot read a file throws a
 * `CommandError` or an `Error`; the command reports it and exits 1.
 * @experimental
 */
export interface ConfigStore {
  /**
   * The layers `set` and `unset` may write, lowest precedence first. Each
   * becomes a flag (`--user`, `--project`). The first one named in
   * {@link defaultLayer} is used when no flag is given.
   */
  layers: readonly string[]
  /** The layer written when no layer flag is given. */
  defaultLayer: string
  /** The keys a tool knows, for did-you-mean and the help. */
  keys?: readonly string[]
  /** Every setting with its effective value and source, and the warnings loading produced. */
  list(ctx: CommandContext): Promise<{ settings: ConfigSetting[]; warnings?: string[] }>
  /** Where each layer's file is. Must not fail on a file that will not parse. */
  locations(ctx: CommandContext): Promise<ConfigLocation[]>
  /**
   * Write `value` at `key` in `layer` and return the file and the value as
   * written, plus warnings (a setting that layer ignores). Throws
   * {@link ConfigUsageError} for an unknown key or a value of the wrong type.
   */
  set(
    ctx: CommandContext,
    layer: string,
    key: string,
    value: unknown,
  ): Promise<{ file: string; value: unknown; warnings?: string[] }>
  /** Remove `key` from `layer`. `removed: false` means it was not set there. */
  unset(
    ctx: CommandContext,
    layer: string,
    key: string,
  ): Promise<{ file: string; removed: boolean }>
}

/**
 * A typed value: JSON when it parses, else the bare string. `set discovery
 * git` and `set runners.order '["moon","just"]'` both work.
 * @experimental
 */
export function parseConfigValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

const SettingSchema = z.object({ key: z.string(), value: z.unknown(), source: z.string() })
const LocationSchema = z.object({
  layer: z.string(),
  path: z.string(),
  exists: z.boolean(),
  envVar: z.string().nullable().optional(),
})

function layerLines(locations: readonly ConfigLocation[]): string {
  const width = Math.max(...locations.map((l) => l.layer.length)) + 1
  return locations
    .map(
      (l) =>
        `${`${l.layer}:`.padEnd(width)} ${l.path} (${l.exists ? 'exists' : 'missing'})${l.envVar ? ` (from ${l.envVar})` : ''}\n`,
    )
    .join('')
}

/**
 * The `config` group over `store`. Mount it in an app's commands as
 * `config: configCommands(store)`. Pass the app's global flags so the
 * commands are typed against them.
 *
 * | Command | Output | Fails with 1 when |
 * |---|---|---|
 * | `config` / `config list` | `{ settings, locations }` | a file will not parse |
 * | `config get <key>` | `{ key, value }` | the key has no value |
 * | `config set <key> <value>` | `{ key, value, layer, file }` | a file will not parse or write |
 * | `config unset <key>` | `{ key, layer, file }` | the key is not set in that layer |
 * | `config path` | `{ locations }` | never |
 *
 * An unknown key or a value of the wrong type is a usage error (exit 2).
 * Warnings go to stderr.
 * @experimental
 */
export function configCommands<G extends FlagSpec = Record<never, never>>(
  store: ConfigStore,
  options: { globals?: G } = {},
): Group {
  const kit = commandKit({ globals: options.globals ?? ({} as G) })
  if (!store.layers.includes(store.defaultLayer)) {
    throw new Error(`configCommands: defaultLayer '${store.defaultLayer}' is not in layers`)
  }
  const layerFlags: FlagSpec = {}
  for (const layer of store.layers) {
    layerFlags[layer] = {
      kind: 'boolean',
      help: `write the ${layer} file${layer === store.defaultLayer ? ' (the default)' : ''}`,
    }
  }
  const keyHelp =
    store.keys !== undefined && store.keys.length > 0 ? ` Keys: ${store.keys.join(', ')}.` : ''

  const pickLayer = (flags: Record<string, unknown>): string => {
    const named = store.layers.filter((l) => flags[l] === true)
    if (named.length > 1) {
      throw new UsageError(
        `${named.map((l) => `--${l}`).join(' and ')} name different files; give at most one`,
      )
    }
    return named[0] ?? store.defaultLayer
  }
  const unknownKey = (key: string): string => {
    const close = closestMatches(key, store.keys ?? [])
    return close.length > 0 ? `; did you mean ${close.join(', ')}?` : ''
  }
  const warnAll = (ctx: CommandContext, warnings: readonly string[] | undefined): void => {
    for (const w of warnings ?? []) ctx.warn(w)
  }

  const list = kit.command({
    summary: 'every setting, and the layer it came from',
    output: z.object({ settings: z.array(SettingSchema), locations: z.array(LocationSchema) }),
    kind: 'config-list',
    readOnly: true,
    async run(_input, ctx) {
      const { settings, warnings } = await store.list(ctx)
      warnAll(ctx, warnings)
      return { settings, locations: await store.locations(ctx) }
    },
    text(output, ctx) {
      const rows = output.settings.map((s) => ({
        key: s.key,
        value: JSON.stringify(s.value) ?? 'undefined',
        source: s.source,
      }))
      const kw = Math.max(0, ...rows.map((r) => r.key.length))
      const vw = Math.max(0, ...rows.map((r) => r.value.length))
      // The locations go to stderr so the listing stays greppable.
      ctx.io.stderr(layerLines(output.locations))
      return rows.map((r) => `${r.key.padEnd(kw)}  ${r.value.padEnd(vw)}  (${r.source})\n`).join('')
    },
  })

  const get = kit.command({
    summary: "one setting's effective value, as JSON",
    positionals: [{ name: 'key', required: true, help: `a dotted key.${keyHelp}` }],
    output: z.object({ key: z.string(), value: z.unknown(), source: z.string() }),
    kind: 'config-get',
    readOnly: true,
    async run({ positionals }, ctx) {
      const key = positionals[0]!
      const { settings, warnings } = await store.list(ctx)
      warnAll(ctx, warnings)
      const found = settings.find((s) => s.key === key)
      if (found !== undefined && found.value !== undefined) return found
      // A key below a listed one (`runners` when `runners.order` is listed) is a real key.
      const below = settings.filter((s) => s.key.startsWith(`${key}.`))
      if (below.length > 0) {
        const value: Record<string, unknown> = {}
        for (const s of below) value[s.key.slice(key.length + 1)] = s.value
        return { key, value, source: [...new Set(below.map((s) => s.source))].join(',') }
      }
      throw new CommandError(`no value for ${key}${unknownKey(key)}`)
    },
    text: (output) => `${JSON.stringify(output.value)}\n`,
  })

  const set = kit.command({
    summary: 'write a setting',
    description:
      'A value is read as JSON, and as the bare string when that fails, so a plain word needs no ' +
      `quoting.${keyHelp}`,
    flags: layerFlags,
    positionals: [
      { name: 'key', required: true, help: 'a dotted key' },
      { name: 'value', required: true, help: 'JSON, or a bare string' },
    ],
    output: z.object({ key: z.string(), value: z.unknown(), layer: z.string(), file: z.string() }),
    kind: 'config-set',
    async run({ flags, positionals }, ctx) {
      const layer = pickLayer(flags)
      const [key, raw] = positionals as [string, string]
      try {
        const written = await store.set(ctx, layer, key, parseConfigValue(raw))
        warnAll(ctx, written.warnings)
        return { key, value: written.value, layer, file: written.file }
      } catch (err) {
        if (err instanceof ConfigUsageError)
          throw new UsageError(`${err.message}${unknownKey(key)}`)
        throw err
      }
    },
    text: (o) => `${o.file}: ${o.key} = ${JSON.stringify(o.value)}\n`,
  })

  const unset = kit.command({
    summary: 'remove a setting',
    flags: layerFlags,
    positionals: [{ name: 'key', required: true, help: 'a dotted key' }],
    output: z.object({ key: z.string(), layer: z.string(), file: z.string() }),
    kind: 'config-unset',
    async run({ flags, positionals }, ctx) {
      const layer = pickLayer(flags)
      const key = positionals[0]!
      const result = await store.unset(ctx, layer, key)
      // An error, not a no-op: the key may still be set in another layer.
      if (!result.removed) throw new CommandError(`${key} is not set in ${result.file}`)
      return { key, layer, file: result.file }
    },
    text: (o) => `${o.file}: removed ${o.key}\n`,
  })

  const path = kit.command({
    summary: "where each layer's file lives",
    output: z.object({ locations: z.array(LocationSchema) }),
    kind: 'config-path',
    readOnly: true,
    async run(_input, ctx) {
      return { locations: await store.locations(ctx) }
    },
    text: (o) => layerLines(o.locations),
  })

  return kit.group({
    summary: 'read and write the layered settings files',
    description:
      `Layers, lowest precedence first: built-in defaults, then ${store.layers.join(', then ')}, ` +
      'then the flags of a run. With no subcommand, config lists every setting.',
    default: list,
    commands: { list, get, set, unset, path },
  })
}
