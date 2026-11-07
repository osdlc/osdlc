/**
 * The README's "Stability" section lists every export tagged `@experimental`, and only those.
 */
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

/** Export name -> the source file it comes from, read off src/index.ts. */
function exportsOfIndex(): Map<string, string> {
  const index = read('../src/index.ts')
  const out = new Map<string, string>()
  for (const [, names, from] of index.matchAll(/export \{([^}]*)\} from '\.\/([^']+)'/g)) {
    for (const raw of names!.split(',')) {
      const name = raw.trim().replace(/^type /, '')
      if (name !== '') out.set(name, `../src/${from}`)
    }
  }
  return out
}

/** Whether the declaration of `name` in `file` carries `@experimental` in its TSDoc. */
function taggedExperimental(file: string, name: string): boolean {
  const src = read(file)
  const decl = new RegExp(
    `(/\\*\\*(?:(?!\\*/)[\\s\\S])*\\*/)\\s*export (?:declare )?(?:async )?(?:function|interface|const|type|class) ${name}\\b`,
  ).exec(src)
  return decl !== null && decl[1]!.includes('@experimental')
}

test('the README lists exactly the experimental exports', () => {
  const tagged = [...exportsOfIndex()]
    .filter(([name, file]) => taggedExperimental(file, name))
    .map(([name]) => name)
    .sort()
  const readme = read('../README.md')
  const section = readme.slice(
    readme.indexOf('## Stability'),
    readme.indexOf('\n## ', readme.indexOf('## Stability') + 1),
  )
  const listed = [
    ...new Set([...section.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((m) => m[1]!)),
  ]
    .filter((name) => exportsOfIndex().has(name))
    .sort()
  expect(tagged.length).toBeGreaterThan(0)
  expect(listed).toEqual(tagged)
})
