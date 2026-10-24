/** `@osdlc/project/go`: the go ecosystem and go modules. */

import type { DepFact, GoModFact } from '../../manifests.ts'
import type { EcosystemDef, ToolDef } from '../../tool.ts'

/** Parse `go.mod`: the module path, the `go` directive and every `require`. */
function parseGoMod(text: string, path: string): GoModFact {
  const deps: DepFact[] = []
  let module: string | undefined
  let go: string | undefined
  let inRequire = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim()
    if (line === '') continue
    if (inRequire) {
      if (line === ')') inRequire = false
      else pushRequire(deps, line)
      continue
    }
    const m = /^(module|go|require)\s+(.*)$/.exec(line)
    if (m === null) continue
    const [, word, rest] = m as unknown as [string, string, string]
    if (word === 'module') module = rest.replace(/^"|"$/g, '')
    else if (word === 'go') go = rest
    else if (rest === '(') inRequire = true
    else pushRequire(deps, rest)
  }
  return {
    manifestPath: path,
    ...(module !== undefined ? { module } : {}),
    ...(go !== undefined ? { go } : {}),
    ...(deps.length > 0 ? { deps } : {}),
  }
}

function pushRequire(deps: DepFact[], line: string): void {
  const [name, version] = line.split(/\s+/)
  if (name === undefined || version === undefined) return
  deps.push({ name, kind: 'prod', specifier: version, specifierKind: 'registry' })
}

/** The go ecosystem. */
export const goEcosystem: EcosystemDef = {
  id: 'go',
  manifests: [{ files: 'go.mod', tool: 'go', slot: 'goMod', parse: parseGoMod }],
  languages: [{ id: 'go' }],
  tools: ['go'],
}

/** go modules: downloads a module's dependencies. */
export const go: ToolDef = {
  id: 'go',
  binary: 'go',
  ecosystem: goEcosystem,
  roles: {
    packageManager: { lockfiles: ['go.sum'], install: ['go', 'mod', 'download'] },
  },
}

/** Every tool this plugin defines. */
export const goTools: readonly ToolDef[] = [go]
