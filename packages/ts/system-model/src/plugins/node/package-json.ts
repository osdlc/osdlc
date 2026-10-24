/** The `package.json` parser. */

import type {
  DepFact,
  DepFactKind,
  DepFactSpecifierKind,
  PackageJsonFact,
} from '../../manifests.ts'
import { isTable, sortedEntries } from '../support/shared.ts'

const NODE_DEP_FIELDS: ReadonlyArray<[string, DepFactKind]> = [
  ['dependencies', 'prod'],
  ['devDependencies', 'dev'],
  ['peerDependencies', 'peer'],
  ['optionalDependencies', 'optional'],
]

/** Parse `package.json` text. Throws on invalid JSON or a non-object. */
export function parsePackageJson(text: string, path: string): PackageJsonFact {
  const parsed: unknown = JSON.parse(text)
  if (!isTable(parsed)) throw new Error('package.json is not a JSON object')
  const pkg = parsed
  const packageManagerPin = parsePin(pkg['packageManager'])
  const deps = nodeDeps(pkg)
  const workspaces = nodeWorkspaces(pkg['workspaces'])
  const str = (key: string): string | undefined =>
    typeof pkg[key] === 'string' ? (pkg[key] as string) : undefined
  const name = str('name')
  const main = str('main')
  const types = str('types')
  const version = str('version')
  const description = str('description')
  return {
    manifestPath: path,
    ...(name !== undefined ? { name } : {}),
    ...(main !== undefined ? { main } : {}),
    ...(types !== undefined ? { types } : {}),
    scripts: stringEntries(pkg['scripts']),
    dependencies: unionNames(NODE_DEP_FIELDS.map(([field]) => pkg[field])),
    ...(packageManagerPin ? { packageManagerPin } : {}),
    ...(version !== undefined ? { version } : {}),
    ...(pkg['private'] === true ? { private: true } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(workspaces.length > 0 ? { workspaces } : {}),
    ...(hasBin(pkg['bin']) ? { hasBin: true } : {}),
    ...(deps.length > 0 ? { deps } : {}),
  }
}

/** `"pnpm@9.0.0"` is `{ manager: "pnpm", version: "9.0.0" }`. */
function parsePin(field: unknown): { manager: string; version: string } | undefined {
  if (typeof field !== 'string') return undefined
  const at = field.indexOf('@')
  if (at <= 0) return undefined
  const manager = field.slice(0, at).trim().toLowerCase()
  const version = field.slice(at + 1).trim()
  if (manager === '' || version === '') return undefined
  return { manager, version }
}

function classifySpecifier(spec: string): DepFactSpecifierKind {
  if (spec.startsWith('workspace:')) return 'workspace'
  if (spec.startsWith('file:')) return 'file'
  // git, github, http, npm-alias and link specifiers carry a ':' or start like a path.
  if (spec.includes(':') || spec.startsWith('.') || spec.startsWith('/')) return 'other'
  return 'registry'
}

function nodeDeps(pkg: Record<string, unknown>): DepFact[] {
  const deps: DepFact[] = []
  for (const [field, kind] of NODE_DEP_FIELDS) {
    const table = pkg[field]
    if (!isTable(table)) continue
    for (const [name, spec] of sortedEntries(table)) {
      const specifier = typeof spec === 'string' ? spec : String(spec)
      deps.push({ name, kind, specifier, specifierKind: classifySpecifier(specifier) })
    }
  }
  return deps
}

function nodeWorkspaces(ws: unknown): string[] {
  if (Array.isArray(ws)) return ws.filter((g): g is string => typeof g === 'string')
  if (isTable(ws) && Array.isArray(ws['packages'])) {
    return (ws['packages'] as unknown[]).filter((g): g is string => typeof g === 'string')
  }
  return []
}

function hasBin(bin: unknown): boolean {
  return typeof bin === 'string' || (isTable(bin) && Object.keys(bin).length > 0)
}

function stringEntries(value: unknown): Record<string, string> {
  if (!isTable(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(value)) if (typeof val === 'string') out[key] = val
  return out
}

function unionNames(tables: unknown[]): string[] {
  const names = new Set<string>()
  for (const table of tables)
    if (isTable(table)) for (const name of Object.keys(table)) names.add(name)
  return [...names].sort()
}
