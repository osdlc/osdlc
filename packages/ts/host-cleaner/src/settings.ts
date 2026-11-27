/**
 * What each plugin's entry in the config's `plugins` may hold. A plugin's
 * settings are a strict zod object, validated when the config loads with
 * `@osdlc/config-layers`' `validateStandard`, so a misspelt key or a wrong type
 * is a config error that names the plugin and the key. `host-cleaner config`
 * prints the same schemas' fields and defaults through `configFields`.
 */

import { configFields, validateStandard } from '@osdlc/config-layers'
import { z } from 'zod'

import { DEFAULT_IDLE_HOURS } from './artifacts.ts'

const enabled = z
  .boolean()
  .default(true)
  .describe('Run this plugin. `--plugin <name>` runs it even when this is false.')

const idleHours = z
  .number()
  .nonnegative()
  .optional()
  .describe(
    `Hours an artifact must have sat unused before it is a candidate; 0 takes every one. Unset: the config's top-level idleHours, else ${DEFAULT_IDLE_HOURS}.`,
  )

const repos = z
  .boolean()
  .default(true)
  .describe('Sweep the repositories `orca repo list` names, as if they were in `targets`.')

/** The shipped plugins' settings by plugin name; a name without an entry takes no validated settings. */
export const PLUGIN_SETTINGS = {
  git: z.strictObject({ enabled }),
  cargo: z.strictObject({ enabled, idleHours }),
  node: z.strictObject({ enabled, idleHours }),
  orca: z.strictObject({ enabled, repos }),
} as const satisfies Record<string, z.ZodType>

type Entries = Readonly<Record<string, Record<string, unknown>>>

const schemaOf = (name: string): z.ZodType | undefined =>
  Object.hasOwn(PLUGIN_SETTINGS, name)
    ? (PLUGIN_SETTINGS as Record<string, z.ZodType>)[name]
    : undefined

/** One line per problem in `plugins`, each starting `<prefix>.<name>[.<key>]`. */
export function settingsIssues(plugins: Entries, prefix = 'plugins'): string[] {
  return Object.entries(plugins).flatMap(([name, raw]) => {
    const schema = schemaOf(name)
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
 * plugin with no schema.
 */
export function settingsOf(
  name: string,
  raw: Record<string, unknown>,
  shared: Shared = {},
): Record<string, unknown> {
  const schema = schemaOf(name)
  if (schema === undefined) return raw
  const parsed = schema.parse(raw) as Record<string, unknown>
  return 'idleHours' in (schema as z.ZodObject).shape
    ? { ...parsed, idleHours: parsed.idleHours ?? shared.idleHours ?? DEFAULT_IDLE_HOURS }
    : parsed
}

/** Whether the config switches `name` off with `enabled: false`. */
export const disabledByConfig = (name: string, plugins: Entries): boolean =>
  plugins[name]?.enabled === false

export interface SettingRow {
  key: string
  value: unknown
  default: unknown
  /** `config` when the plugin's entry sets it, `shared` when the top-level setting gave it, else `default`. */
  source: 'config' | 'shared' | 'default'
  description: string
}

/**
 * Every setting of each shipped plugin in `names` (all of them by default): its effective value,
 * its default and whether the config set it. A name no shipped plugin has is left out.
 */
export function effectiveSettings(
  plugins: Entries,
  shared: Shared = {},
  names: Iterable<string> = Object.keys(PLUGIN_SETTINGS),
): Record<string, SettingRow[]> {
  const out: Record<string, SettingRow[]> = {}
  for (const name of names) {
    if (!Object.hasOwn(PLUGIN_SETTINGS, name)) continue
    const raw = plugins[name] ?? {}
    const value = settingsOf(name, raw, shared)
    out[name] = configFields({ [name]: schemaOf(name)! }).map((f) => {
      const key = f.path.slice(1).join('.')
      return {
        key,
        value: value[key],
        default: key === 'idleHours' ? DEFAULT_IDLE_HOURS : f.default,
        source: Object.hasOwn(raw, key)
          ? 'config'
          : key === 'idleHours' && shared.idleHours !== undefined
            ? 'shared'
            : 'default',
        description: f.description,
      }
    })
  }
  return out
}
