/**
 * What each plugin's entry in the config's `plugins` may hold: the settings
 * schema of its definition, a built-in's or a descriptor's, made strict, with
 * the core's `enabled` added and its own refinements kept. It is validated when the config loads with
 * `@osdlc/config-layers`' `validateStandard`, so a misspelt key or a wrong type
 * is a config error that names the plugin and the key. `host-cleaner config`
 * prints the same schemas' fields and defaults through `configFields`.
 */

import { configFields, validateStandard } from '@osdlc/config-layers'
import { z } from 'zod'

import { DEFAULT_IDLE_HOURS } from './kit.ts'
import { BUILT_IN_PLUGINS } from './builtins.ts'
import type { PartIdleHours, PluginDefinition, SettingSource } from './types.ts'

const enabled = z
  .boolean()
  .default(true)
  .describe('Run this plugin. `--plugin <name>` runs it even when this is false.')

type Entries = Readonly<Record<string, Record<string, unknown>>>

type Definitions = readonly PluginDefinition[]

/**
 * The settings schema of the plugin `name` in `defs`, with the core's
 * `enabled` and made strict, its refinements kept; undefined for a name no
 * definition has.
 */
const schemaOf = (name: string, defs: Definitions = BUILT_IN_PLUGINS): z.ZodObject | undefined =>
  defs
    .find((d) => d.name === name)
    ?.settings.safeExtend({ enabled })
    .strict()

/** One line per problem in `plugins`, each starting `<prefix>.<name>[.<key>]`; `defs` are the plugins it knows. */
export function settingsIssues(
  plugins: Entries,
  prefix = 'plugins',
  defs: Definitions = BUILT_IN_PLUGINS,
): string[] {
  return Object.entries(plugins).flatMap(([name, raw]) => {
    const schema = schemaOf(name, defs)
    if (schema === undefined) return []
    const result = validateStandard(schema, raw)
    if (result.ok) return []
    return result.issues.map((i) => `${[prefix, name, ...i.path].join('.')}: ${i.message}`)
  })
}

/** What every plugin inherits when it does not set its own: the config's top-level settings. */
export interface Shared {
  idleHours?: number | undefined
}

/**
 * `name`'s settings with defaults filled in, and `idleHours` taken from `shared`
 * when the plugin has that setting and does not set it; `raw` as given for a
 * plugin with no schema. `defs` are the plugins it knows.
 */
export function settingsOf(
  name: string,
  raw: Record<string, unknown>,
  shared: Shared = {},
  defs: Definitions = BUILT_IN_PLUGINS,
): Record<string, unknown> {
  const schema = schemaOf(name, defs)
  if (schema === undefined) return raw
  const parsed = schema.parse(raw) as Record<string, unknown>
  return 'idleHours' in schema.shape
    ? { ...parsed, idleHours: parsed.idleHours ?? shared.idleHours ?? DEFAULT_IDLE_HOURS }
    : parsed
}

/** Whether the config switches `name` off with `enabled: false`. */
export const disabledByConfig = (name: string, plugins: Entries): boolean =>
  plugins[name]?.enabled === false

/**
 * Where each of `name`'s settings came from, by key, as {@link settingsOf}
 * resolves them: `config` for a key its entry `raw` sets, `shared` for an
 * `idleHours` the top-level setting gave. A key from the default is left out.
 */
export function sourcesOf(
  name: string,
  raw: Record<string, unknown>,
  shared: Shared = {},
  defs: Definitions = BUILT_IN_PLUGINS,
): Record<string, SettingSource> {
  const out: Record<string, SettingSource> = {}
  for (const [key, value] of Object.entries(raw)) if (value !== undefined) out[key] = 'config'
  const schema = schemaOf(name, defs)
  if (schema !== undefined && 'idleHours' in schema.shape && shared.idleHours !== undefined) {
    out.idleHours ??= 'shared'
  }
  return out
}

export interface SettingRow {
  key: string
  value: unknown
  default: unknown
  /** `config` when the plugin's entry sets it, `shared` when the top-level setting gave it, else `default`. */
  source: SettingSource
  description: string
  /** For `idleHours`: the parts of the plugin that apply another threshold, with the one the run uses. */
  parts?: PartIdleHours[]
}

/** Every setting of every plugin in `defs`: its effective value, its default and whether the config set it. */
export function effectiveSettings(
  plugins: Entries,
  shared: Shared = {},
  defs: Definitions = BUILT_IN_PLUGINS,
): Record<string, SettingRow[]> {
  const out: Record<string, SettingRow[]> = {}
  for (const def of defs) {
    const { name } = def
    const raw = plugins[name] ?? {}
    const value = settingsOf(name, raw, shared, defs)
    const sources = sourcesOf(name, raw, shared, defs)
    const fields = configFields({ [name]: schemaOf(name, defs)! })
    // The core's `enabled` first, ahead of the plugin's own settings.
    fields.sort((a, b) => Number(b.path[1] === 'enabled') - Number(a.path[1] === 'enabled'))
    out[name] = fields.map((f) => {
      const key = f.path.slice(1).join('.')
      const source = sources[key] ?? 'default'
      const parts =
        key === 'idleHours' ? def.idleHoursOf?.(value[key] as number, source) : undefined
      return {
        key,
        value: value[key],
        default: key === 'idleHours' ? DEFAULT_IDLE_HOURS : f.default,
        source,
        description: f.description,
        ...(parts !== undefined && parts.length > 0 ? { parts } : {}),
      }
    })
  }
  return out
}
