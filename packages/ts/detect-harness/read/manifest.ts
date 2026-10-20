/**
 * Resolve the `hooks` and `mcpServers` fields of a Claude Code `plugin.json`.
 * Each may be an inline object, a path to a JSON file inside the plugin, or a
 * list of those. Both `detect()` and the `./model` plugin reader use this,
 * each with its own {@link ManifestReader}.
 *
 * Runtime-agnostic: `node:path` only.
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'

import type { JsonRead } from '../contract.ts'
import { asObject } from '../json.ts'

type Json = Record<string, unknown>

/** The two reads the resolver needs. `ProviderContext` is one. */
export interface ManifestReader {
  realpath(path: string): string | null
  readJson(path: string): JsonRead
}

/**
 * The JSON object a `plugin.json` field points at: a path relative to the plugin
 * root. A path that does not resolve inside the root, by `..` or through a
 * symbolic link, is ignored. Both sides go through `realpath` before the
 * comparison, and the file is read from its real path. A name that merely
 * starts with two dots (`..x.json`) is inside the root.
 */
export function loadReferenced(reader: ManifestReader, root: string, ref: string): Json | null {
  const realRoot = reader.realpath(root)
  const target = reader.realpath(resolve(root, ref))
  if (realRoot === null || target === null) return null
  const rel = relative(realRoot, target)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null
  const read = reader.readJson(target)
  return read.status === 'parsed' ? read.value : null
}

/** The objects a `plugin.json` field stands for: inline objects and the files it names. */
export function manifestObjects(reader: ManifestReader, root: string, value: unknown): Json[] {
  const items = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return items.flatMap((item) => {
    const loaded = typeof item === 'string' ? loadReferenced(reader, root, item) : asObject(item)
    return loaded ? [loaded] : []
  })
}
