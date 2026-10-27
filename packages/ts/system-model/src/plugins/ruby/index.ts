/** `@osdlc/system-model/ruby`: the ruby ecosystem, bundler and rake. */

import type { EcosystemDef, ToolDef } from '../../tool.ts'
import { flagAtEnd, joinRel } from '../support/shared.ts'
import { parseGemfile } from './gemfile.ts'
import { RAKE_TASK_FILES, RAKEFILE_NAMES, rakeRunner, RAKE_BRAND } from './rake.ts'

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
  homepage: 'https://bundler.io',
  description: 'A dependency manager for Ruby gems.',
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
  homepage: 'https://ruby.github.io/rake/',
  description: 'A Ruby build tool for the tasks a Rakefile declares.',
  brand: RAKE_BRAND,
  binary: 'rake',
  ecosystem: rubyEcosystem,
  markers: [...RAKEFILE_NAMES, RAKE_TASK_FILES].map((files) => ({ files, tier: 'files' as const })),
  roles: { runner: rakeRunner },
}

/** Every tool this plugin defines. */
export const rubyTools: readonly ToolDef[] = [bundler, rake]
