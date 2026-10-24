/** `@osdlc/system-model/ruby`: the ruby ecosystem, bundler and rake. */

import type { DepFact, GemfileFact } from '../../manifests.ts'
import type { EcosystemDef, ToolDef } from '../../tool.ts'
import { flagAtEnd, joinRel } from '../support/shared.ts'
import { RAKE_TASK_FILES, RAKEFILE_NAMES, rakeRunner } from './rake.ts'

/** `gem 'name'` lines; a gem inside a `group` block that names only dev or test groups is `dev`. */
function parseGemfile(text: string, path: string): GemfileFact {
  const deps: DepFact[] = []
  const groups: boolean[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (/^group\b.*\bdo\s*(\|.*\|)?$/.test(line)) {
      groups.push(!/:(production|default)\b/.test(line))
      continue
    }
    if (line === 'end' && groups.length > 0) {
      groups.pop()
      continue
    }
    const m = /^gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/.exec(line)
    if (m === null) continue
    const dev = groups.some(Boolean)
    deps.push({
      name: m[1]!,
      kind: dev ? 'dev' : 'prod',
      specifier: m[2] ?? '',
      specifierKind: 'registry',
    })
  }
  return { manifestPath: path, ...(deps.length > 0 ? { deps } : {}) }
}

/** The ruby ecosystem. */
export const rubyEcosystem: EcosystemDef = {
  id: 'ruby',
  manifests: [{ files: 'Gemfile', tool: 'bundler', slot: 'gemfile', parse: parseGemfile }],
  languages: [{ id: 'ruby' }],
  tools: ['bundler', 'rake'],
}

/** bundler: installs a Gemfile's gems. */
export const bundler: ToolDef = {
  id: 'bundler',
  binary: 'bundle',
  ecosystem: rubyEcosystem,
  roles: {
    packageManager: {
      lockfiles: ['Gemfile.lock'],
      install: ['bundle', 'install'],
      // Bundler finds `Gemfile.lock` beside the Gemfile it is given.
      inDir: flagAtEnd('--gemfile', (dir) => joinRel(dir, 'Gemfile')),
    },
  },
}

/** rake: tasks from a Rakefile. */
export const rake: ToolDef = {
  id: 'rake',
  binary: 'rake',
  ecosystem: rubyEcosystem,
  markers: [...RAKEFILE_NAMES, RAKE_TASK_FILES].map((files) => ({ files, tier: 'files' as const })),
  roles: { runner: rakeRunner },
}

/** Every tool this plugin defines. */
export const rubyTools: readonly ToolDef[] = [bundler, rake]
