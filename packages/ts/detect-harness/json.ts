/**
 * Internal JSON helpers shared by the readers.
 *
 * Runtime-agnostic: `node:` APIs only.
 */

import { existsSync, readFileSync } from 'node:fs'

/** A plain object, or null for anything else (an array, a scalar, null). */
export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** The JSON object in the file at `path`, or null when it is absent, unreadable, malformed or not an object. */
export function loadJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  try {
    return asObject(JSON.parse(readFileSync(path, 'utf-8')) as unknown)
  } catch {
    return null
  }
}

/** A non-empty string, or null. */
export function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** The string items of an array; `[]` for anything else. */
export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Split a plugin id `<name>@<marketplace>` at its first `@`. */
export function splitPluginId(id: string): { name: string; marketplace: string | null } {
  const at = id.indexOf('@')
  return at < 0
    ? { name: id, marketplace: null }
    : { name: id.slice(0, at), marketplace: id.slice(at + 1) }
}
