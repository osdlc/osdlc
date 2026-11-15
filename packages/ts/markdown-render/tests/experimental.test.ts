/**
 * The README lists the experimental exports, and the source marks them with an
 * `@experimental` TSDoc tag. This keeps the two in step.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const root = new URL('..', import.meta.url).pathname

/** The names that follow an `@experimental` tag in `src/`. */
function marked(): string[] {
  const names: string[] = []
  for (const entry of readdirSync(join(root, 'src'), { recursive: true, encoding: 'utf8' })) {
    if (!entry.endsWith('.ts')) continue
    const source = readFileSync(join(root, 'src', entry), 'utf8')
    for (const match of source.matchAll(
      /@experimental[^\n]*\n(?: \*[^\n]*\n)* \*\/\nexport (?:async )?(?:function|const|interface|type) (\w+)/g,
    )) {
      names.push(match[1] as string)
    }
  }
  return names.sort()
}

/** The backticked names under "Experimental exports" in the README. */
function listed(): string[] {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const start = readme.indexOf('### Experimental exports')
  const end = readme.indexOf('\n## ', start)
  const section = readme.slice(start, end)
  const list = section.slice(section.indexOf('\n- '))
  return [...list.matchAll(/`(\w+)`/g)].map((match) => match[1] as string).sort()
}

test('the README lists exactly the exports marked @experimental', () => {
  expect(marked().length).toBeGreaterThan(10)
  expect(listed()).toEqual(marked())
})
