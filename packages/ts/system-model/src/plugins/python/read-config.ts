/** Reads a config file for the python task runners: TOML, YAML or JSON, by extension. */

import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'

import type { ProviderContext } from '../../contract.ts'
import { isTable } from '../support/shared.ts'

/** A parsed config, or why it could not be read. `null` when the file is absent or unreadable. */
export type ConfigRead = { doc: Record<string, unknown> } | { error: string } | null

export async function readConfig(ctx: ProviderContext, file: string): Promise<ConfigRead> {
  const text = await ctx.readText(file)
  if (text === null) return null
  if (text.trim() === '') return { doc: {} }
  let doc: unknown
  try {
    if (file.endsWith('.toml')) doc = parseToml(text)
    else if (file.endsWith('.json')) doc = JSON.parse(text)
    else doc = parseYaml(text)
  } catch (err) {
    return { error: `parse failed: ${err instanceof Error ? err.message : String(err)}` }
  }
  return isTable(doc) ? { doc } : { error: 'parse failed: the top level is not a table' }
}

/** `doc[a][b]...` when every step is a table, else `undefined`. */
export function tableAt(doc: unknown, ...keys: string[]): Record<string, unknown> | undefined {
  let at: unknown = doc
  for (const key of keys) {
    if (!isTable(at)) return undefined
    at = at[key]
  }
  return isTable(at) ? at : undefined
}
