/**
 * Every stable export has at least one usage example: its name appears in some
 * `examples/*.test.ts`. An export tagged `@experimental` is exempt (the README's
 * "Stability" section lists those, see `stability.test.ts`).
 */
import { readFileSync, readdirSync } from 'node:fs'

import { expect, test } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

/** Export name -> the source file that declares it, read off src/index.ts. */
function exportsOfIndex(): Map<string, string> {
  const index = read('../src/index.ts')
  const out = new Map<string, string>()
  for (const [, names, from] of index.matchAll(/export \{([^}]*)\} from '\.\/([^']+)'/g)) {
    for (const raw of names!.split(',')) {
      const name = raw.trim().replace(/^type /, '')
      if (name !== '') out.set(name, `../src/${from}`)
    }
  }
  // Declared in index.ts itself.
  for (const [, name] of index.matchAll(
    /^export (?:async )?(?:function|interface|const|type|class) (\w+)/gm,
  )) {
    out.set(name!, '../src/index.ts')
  }
  return out
}

/** Whether the declaration of `name` in `file` carries `@experimental` in its TSDoc. */
function taggedExperimental(file: string, name: string): boolean {
  const decl = new RegExp(
    `(/\\*\\*(?:(?!\\*/)[\\s\\S])*\\*/)\\s*export (?:declare )?(?:async )?(?:function|interface|const|type|class) ${name}\\b`,
  ).exec(read(file))
  return decl !== null && decl[1]!.includes('@experimental')
}

/** The examples' code with comments removed, so a name only mentioned in a comment does not count. */
function exampleSources(): string {
  const dir = new URL('../examples/', import.meta.url)
  return readdirSync(dir)
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => readFileSync(new URL(f, dir), 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

test('every stable export is used in at least one example', () => {
  const stable = [...exportsOfIndex()]
    .filter(([name, file]) => !taggedExperimental(file, name))
    .map(([name]) => name)
  const sources = exampleSources()
  const uncovered = stable.filter((name) => !new RegExp(`\\b${name}\\b`).test(sources))
  expect(stable.length).toBeGreaterThan(0)
  expect(uncovered, 'add an example under examples/ for each of these').toEqual([])
})
