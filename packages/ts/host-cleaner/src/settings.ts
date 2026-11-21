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
  .positive()
  .default(DEFAULT_IDLE_HOURS)
  .describe('Hours an artifact must have sat unused before it is a candidate.')

/** The shipped plugins' settings by plugin name; a name without an entry takes no validated settings. */
export const PLUGIN_SETTINGS = {
  git: z.strictObject({ enabled }),
  cargo: z.strictObject({ enabled, idleHours }),
  node: z.strictObject({ enabled, idleHours }),
  'claude-code': z.strictObject({ enabled }),
} as const satisfies Record<string, z.ZodType>

type Entries = Readonly<Record<string, Record<string, unknown>>>

const schemaOf = (name: string): z.ZodType | undefined =>
  (PLUGIN_SETTINGS as Record<string, z.ZodType>)[name]

/** One line per problem in `plugins`, each starting `plugins.<name>[.<key>]`. */
export function settingsIssues(plugins: Entries): string[] {
  return Object.entries(plugins).flatMap(([name, raw]) => {
    const schema = schemaOf(name)
    if (schema === undefined) return []
    const result = validateStandard(schema, raw)
    if (result.ok) return []
    return result.issues.map((i) => `${['plugins', name, ...i.path].join('.')}: ${i.message}`)
  })
}

/** `name`'s settings with defaults filled in; `raw` as given for a plugin with no schema. */
export function settingsOf(name: string, raw: Record<string, unknown>): Record<string, unknown> {
  const schema = schemaOf(name)
  return schema === undefined ? raw : (schema.parse(raw) as Record<string, unknown>)
}

/** Whether the config switches `name` off with `enabled: false`. */
export const disabledByConfig = (name: string, plugins: Entries): boolean =>
  plugins[name]?.enabled === false

export interface SettingRow {
  key: string
  value: unknown
  default: unknown
  /** `config` when the file sets it, else `default`. */
  source: 'config' | 'default'
  description: string
}

/** Every setting of every shipped plugin: its effective value, its default and whether the config set it. */
export function effectiveSettings(plugins: Entries): Record<string, SettingRow[]> {
  const out: Record<string, SettingRow[]> = {}
  for (const name of Object.keys(PLUGIN_SETTINGS)) {
    const raw = plugins[name] ?? {}
    const value = settingsOf(name, raw)
    out[name] = configFields({ [name]: schemaOf(name)! }).map((f) => {
      const key = f.path.slice(1).join('.')
      return {
        key,
        value: value[key],
        default: f.default,
        source: Object.hasOwn(raw, key) ? 'config' : 'default',
        description: f.description,
      }
    })
  }
  return out
}
