/**
 * maven: the conventional lifecycle phases of a Maven module.
 *
 * Works like cargo.ts: only the file's presence matters. A pom.xml does not
 * declare `mvn test` or `mvn install`. A module runs those phases because it
 * is a Maven module. This runner never parses the pom.xml.
 */

import type { ProviderContext } from '../../contract.ts'
import type { ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, taskId } from '../support/shared.ts'
import { POM_XML } from './ecosystem.ts'

const CHAIN = [
  { label: 'runner', hint: 'mvn builds, tests and packages Java projects.' },
  { label: 'project', hint: 'The directory holding the pom.xml. `.` is the root manifest.' },
  {
    label: 'verb',
    hint: 'A conventional Maven lifecycle phase. Synthesized — not declared in the manifest.',
  },
]

/** The standard lifecycle phases worth offering. Conventions, not config. */
const VERBS: ReadonlyArray<{ name: string }> = [
  { name: 'test' },
  { name: 'package' },
  { name: 'install' },
  { name: 'verify' },
]

/**
 * A plain glyph of stacked layers, for Maven's ordered lifecycle phases. It
 * stands in for the Maven logo. simple-icons' `apachemaven` entry overrides
 * the set's CC0-1.0 with `Apache-2.0` (`data/simple-icons.json`), the same
 * problem cargo.ts has with `rust`, and an MIT package cannot pass that on.
 * The color (`#C71A36`) is Apache Maven's brand red, taken from public brand
 * references (such as Wikipedia's Maven logo file), not from the licensed
 * icon entry.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 21 8l-9 5-9-5Z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/></svg>',
  color: '#C71A36',
}

export const mavenRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,
  brand: BRAND,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const manifests = (await ctx.files(POM_XML)).sort()
    if (manifests.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const tasks: Task[] = []
    for (const file of manifests) {
      const dir = dirOf(file)
      for (const verb of VERBS) {
        const argv = dir === '.' ? ['mvn', verb.name] : ['mvn', '-f', file, verb.name]
        tasks.push({
          id: taskId('maven', file, verb.name),
          runner: 'maven',
          path: ['maven', dir, verb.name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'synthesized',
          tags: ['maven', 'java', dir],
          persistent: { value: false, declared: false },
          executes: 'local',
        })
      }
    }

    return {
      status: 'ok',
      tasks,
      diagnostics: [],
    }
  },
}
