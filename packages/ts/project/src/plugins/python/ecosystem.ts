/** The python ecosystem: `pyproject.toml`, parsed once, and its managers in precedence order. */

import { parse as parseToml } from 'smol-toml'

import type { DepFact, PyprojectFact } from '../../manifests.ts'
import type { EcosystemDef } from '../../tool.ts'
import { isTable } from '../support/shared.ts'

export const PYPROJECT_TOML = 'pyproject.toml'

/** The python ecosystem. Precedence is uv, poetry, pip. */
export const pythonEcosystem: EcosystemDef = {
  id: 'python',
  manifests: [{ files: PYPROJECT_TOML, tool: 'python', slot: 'pyproject', parse: parsePyproject }],
  languages: [{ id: 'python' }],
  tools: ['uv', 'poetry', 'pip', 'python'],
}

/** Parse `pyproject.toml`. Invalid TOML yields a fact with `error` set. */
export function parsePyproject(text: string, path: string): PyprojectFact {
  let doc: Record<string, unknown>
  try {
    doc = parseToml(text) as Record<string, unknown>
  } catch (err) {
    const error = `parse failed: ${err instanceof Error ? err.message : String(err)}`
    return { manifestPath: path, scripts: [], tools: [], error }
  }
  const project = isTable(doc['project']) ? doc['project'] : {}
  const tool = isTable(doc['tool']) ? doc['tool'] : {}
  const poetry = isTable(tool['poetry']) ? tool['poetry'] : {}
  const name = typeof project['name'] === 'string' ? project['name'] : poetry['name']
  const version = typeof project['version'] === 'string' ? project['version'] : poetry['version']
  const scripts = new Set([
    ...Object.keys(isTable(project['scripts']) ? project['scripts'] : {}),
    ...Object.keys(isTable(poetry['scripts']) ? poetry['scripts'] : {}),
  ])
  const deps: DepFact[] = []
  for (const spec of Array.isArray(project['dependencies']) ? project['dependencies'] : []) {
    if (typeof spec !== 'string') continue
    const depName = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(spec)?.[1]
    if (depName !== undefined) {
      deps.push({ name: depName, kind: 'prod', specifier: spec, specifierKind: 'registry' })
    }
  }
  for (const [depName, spec] of Object.entries(
    isTable(poetry['dependencies']) ? poetry['dependencies'] : {},
  )) {
    if (depName === 'python') continue
    const specifier = typeof spec === 'string' ? spec : ''
    deps.push({ name: depName, kind: 'prod', specifier, specifierKind: 'registry' })
  }
  return {
    manifestPath: path,
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof version === 'string' ? { version } : {}),
    scripts: [...scripts].sort(),
    tools: Object.keys(tool).sort(),
    ...(deps.length > 0 ? { deps } : {}),
  }
}
