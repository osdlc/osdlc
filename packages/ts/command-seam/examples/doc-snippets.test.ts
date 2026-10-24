/**
 * Every ```ts block in README.md and in the decisions under
 * docs/planning/decisions/ typechecks as consumer code.
 *
 * A snippet that leaves a name free for the reader to fill in gets it from
 * `DOC_GLOBALS`, so it is checked for the package API it shows, not for the
 * scaffolding it leaves out. A snippet with no import of its own gets one for
 * every public export.
 *
 * `RULES` holds per-snippet exceptions (a wrapper for a fragment, or a known
 * failure reported as a todo). A rule that matches no snippet fails the
 * suite, so a rule cannot outlive the snippet it was written for.
 *
 * None of the snippets is executed. Most start a binary or a server that is
 * not here (`git push`, `gh api`, `node server.js`), so a typecheck is the
 * strongest check that works everywhere.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { expect, test } from 'vitest'

import { PACKAGE_NAME, publicExports } from './support/scenarios.ts'
import { EXAMPLES_DIR, PACKAGE_DIR, typecheck } from './support/typecheck.ts'

/**
 * Free names the snippets assume, declared as globals (this is a
 * script file). Add a `declare` here before leaving a name free in a
 * snippet.
 */
const DOC_GLOBALS = `
/** A host's own entry point, returning its exit code. */
declare function main(): Promise<number>
`

interface SnippetRule {
  /** Text that identifies the snippet. */
  match: string
  /** Wrap a fragment so it parses on its own. */
  wrap?: (code: string) => string
  /** A known failure: the snippet is wrong today. Reported as a todo. */
  todo?: string
}

const RULES: SnippetRule[] = []

interface Snippet {
  /** The markdown file, relative to the package. */
  file: string
  line: number
  code: string
}

const DECISIONS_DIR = join(PACKAGE_DIR, 'docs', 'planning', 'decisions')
const DOCS = [
  join(PACKAGE_DIR, 'README.md'),
  ...readdirSync(DECISIONS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => join(DECISIONS_DIR, f)),
]

function snippetsOf(path: string): Snippet[] {
  const file = relative(PACKAGE_DIR, path)
  const lines = readFileSync(path, 'utf-8').split('\n')
  const out: Snippet[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() !== '```ts') continue
    const start = i + 1
    while (i + 1 < lines.length && lines[i + 1]!.trim() !== '```') i++
    out.push({ file, line: start, code: lines.slice(start, i + 1).join('\n') })
    i++
  }
  return out
}

const allExports = publicExports(readFileSync(join(PACKAGE_DIR, 'src', 'index.ts'), 'utf-8'))
const globalsPath = join(EXAMPLES_DIR, '__doc_globals.ts')
const snippets = DOCS.flatMap(snippetsOf).map((s, n) => {
  const rule = RULES.find((r) => s.code.includes(r.match))
  const body = rule?.wrap ? rule.wrap(s.code) : s.code
  const header =
    s.code.includes(`from "${PACKAGE_NAME}"`) || s.code.includes(`from '${PACKAGE_NAME}'`)
      ? ''
      : `import { ${allExports.map((e) => (e.typeOnly ? `type ${e.name}` : e.name)).join(', ')} } from '${PACKAGE_NAME}'\n`
  return {
    ...s,
    rule,
    path: join(EXAMPLES_DIR, `__doc_snippet_${n + 1}.ts`),
    // `export {}` keeps a snippet a module even when it imports nothing.
    source: `${header}${body}\nexport {}\n`,
  }
})

test('the docs have ts snippets to check', () => {
  expect(snippets.length).toBeGreaterThan(0)
})

test('every snippet rule matches a snippet', () => {
  const unused = RULES.filter((r) => !snippets.some((s) => s.rule === r)).map((r) => r.match)
  expect(unused).toEqual([])
})

const diagnostics = typecheck({
  [globalsPath]: DOC_GLOBALS,
  ...Object.fromEntries(snippets.map((s) => [s.path, s.source])),
})

for (const s of snippets) {
  const firstCodeLine = s.code.split('\n').find((l) => l.trim() !== '') ?? ''
  const name = `${s.file} line ${s.line}: ${firstCodeLine.trim().slice(0, 60)}`
  if (s.rule?.todo) {
    test.todo(`${name} (${s.rule.todo})`, () => {
      expect(diagnostics[s.path]).toEqual([])
    })
    continue
  }
  test(name, () => {
    expect(diagnostics[s.path]).toEqual([])
  })
}
