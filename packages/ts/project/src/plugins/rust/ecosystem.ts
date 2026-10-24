/** The rust ecosystem: `Cargo.toml`, parsed once. */

import { parse as parseToml } from 'smol-toml'

import type { CargoFact, DepFact, DepFactKind } from '../../manifests.ts'
import type { EcosystemDef } from '../../tool.ts'
import { isTable, sortedEntries } from '../support/shared.ts'

export const CARGO_TOML = 'Cargo.toml'

/** The rust ecosystem. */
export const rustEcosystem: EcosystemDef = {
  id: 'rust',
  manifests: [{ files: CARGO_TOML, tool: 'cargo', slot: 'cargo', parse: parseCargo }],
  languages: [{ id: 'rust' }],
  tools: ['cargo'],
  workspace: (pkg) =>
    pkg.manifests.cargo?.workspace ? (pkg.manifests.cargo.workspaceMembers ?? []) : undefined,
}

const CARGO_DEP_TABLES: ReadonlyArray<[string, DepFactKind]> = [
  ['dependencies', 'prod'],
  ['dev-dependencies', 'dev'],
  ['dev_dependencies', 'dev'], // deprecated cargo alias, still accepted
  ['build-dependencies', 'build'],
  ['build_dependencies', 'build'],
]

/**
 * Parse `Cargo.toml`. Invalid TOML still yields a fact, with `error` set and
 * `workspace` read from the `[workspace]` header alone.
 */
export function parseCargo(text: string, path: string): CargoFact {
  const fact: CargoFact = { manifestPath: path, workspace: /^\[workspace\]/m.test(text) }
  let doc: Record<string, unknown>
  try {
    doc = parseToml(text) as Record<string, unknown>
  } catch (err) {
    return { ...fact, error: `parse failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  const deps: DepFact[] = []
  for (const [table, kind] of CARGO_DEP_TABLES) {
    const t = doc[table]
    if (!isTable(t)) continue
    for (const [key, spec] of sortedEntries(t)) deps.push(cargoDep(key, spec, kind))
  }
  const pkg = isTable(doc['package']) ? doc['package'] : {}
  const workspace = isTable(doc['workspace']) ? doc['workspace'] : {}
  const members = Array.isArray(workspace['members'])
    ? (workspace['members'] as unknown[]).filter((m): m is string => typeof m === 'string')
    : []
  return {
    ...fact,
    ...(typeof pkg['name'] === 'string' ? { name: pkg['name'] } : {}),
    ...(typeof pkg['version'] === 'string' ? { version: pkg['version'] } : {}),
    ...(pkg['publish'] === false ? { private: true } : {}),
    ...(typeof pkg['description'] === 'string' ? { description: pkg['description'] } : {}),
    ...(members.length > 0 ? { workspaceMembers: members } : {}),
    ...(Array.isArray(doc['bin']) && doc['bin'].length > 0 ? { hasBin: true } : {}),
    ...(deps.length > 0 ? { deps } : {}),
  }
}

function cargoDep(key: string, spec: unknown, kind: DepFactKind): DepFact {
  if (typeof spec === 'string')
    return { name: key, kind, specifier: spec, specifierKind: 'registry' }
  const t = isTable(spec) ? spec : {}
  // A renamed dependency (`alias = { package = "real" }`) is known by its real name.
  const name = typeof t['package'] === 'string' ? t['package'] : key
  if (typeof t['path'] === 'string')
    return { name, kind, specifier: t['path'], specifierKind: 'path' }
  if (t['workspace'] === true)
    return { name, kind, specifier: 'workspace', specifierKind: 'workspace' }
  if (typeof t['git'] === 'string')
    return { name, kind, specifier: t['git'], specifierKind: 'other' }
  if (typeof t['version'] === 'string') {
    return { name, kind, specifier: t['version'], specifierKind: 'registry' }
  }
  return { name, kind, specifier: '', specifierKind: 'other' }
}
