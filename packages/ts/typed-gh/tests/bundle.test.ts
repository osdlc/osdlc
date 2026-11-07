/**
 * A tool that imports verb functions and `runVerb`, and constructs no `Gh`,
 * bundles only the verbs it calls. A bundler drops an unused function but
 * not an unused method, so a `Gh` keeps every verb and parser. This test
 * bundles both shapes of diffkit's two calls (`prDiff`, then a raw checked
 * call) with tree-shaking on. It fails as soon as the verb path carries any
 * value the package exports, other than the few that path calls, or one of the
 * client's internal helpers. The list comes from the exports, so a verb added
 * later is checked too. See docs/planning/decisions/bundle-size.md.
 */

import { fileURLToPath } from 'node:url'

import { rolldown } from 'rolldown'
import { describe, expect, test } from 'vitest'

import * as surface from '../src/index.ts'

const INDEX = fileURLToPath(new URL('../src/index.ts', import.meta.url))

/** The bundled, unminified code of a module whose source is `code`. */
async function bundle(code: string): Promise<string> {
  const build = await rolldown({
    input: 'entry',
    platform: 'node',
    logLevel: 'silent',
    plugins: [
      {
        name: 'entry',
        resolveId: (id) => (id === 'entry' ? '\0entry' : null),
        load: (id) => (id === '\0entry' ? code : null),
      },
    ],
  })
  try {
    const { output } = await build.generate({ format: 'esm' })
    return output.map((chunk) => ('code' in chunk ? chunk.code : '')).join('\n')
  } finally {
    await build.close()
  }
}

const VERB_PATH = `
import { defaultRunnerFactory, prDiff, rawChecked, runVerb } from ${JSON.stringify(INDEX)}

const runner = defaultRunnerFactory('gh')
const opts = { cwd: process.cwd() }
console.log(runVerb(prDiff(7), runner, opts))
console.log(runVerb(rawChecked(['api', 'repos/{owner}/{repo}/pulls/7/files']), runner, opts).stdout)
`

const CLIENT_PATH = `
import { Gh } from ${JSON.stringify(INDEX)}

const gh = new Gh(process.cwd())
console.log(gh.prDiff(7))
console.log(gh.rawChecked(['api', 'repos/{owner}/{repo}/pulls/7/files']).stdout)
`

/**
 * The exports the verb path calls, or that what it calls needs: the runner,
 * the failure classifier `rawChecked` throws through, and the error the
 * runner throws.
 */
const VERB_PATH_NEEDS = new Set([
  'prDiff',
  'rawChecked',
  'runVerb',
  'defaultRunnerFactory',
  'classifyGhFailure',
  'CommandFailed',
])

/** Helpers the clients use that the package does not export. */
const CLIENT_INTERNALS = ['triedSync', 'softSync', 'parsePrSearchHit', 'parseRepository']

/**
 * Every value the verb path must not carry: each export (the classes, verbs,
 * parsers and field lists) outside `VERB_PATH_NEEDS`, and the client internals.
 */
const UNUSED = [
  ...Object.keys(surface).filter((name) => !VERB_PATH_NEEDS.has(name)),
  ...CLIENT_INTERNALS,
]

/** The names in `UNUSED` that `code` declares. */
const present = (code: string) =>
  UNUSED.filter((name) => new RegExp(`\\b(?:function|class|const|let|var) ${name}\\b`).test(code))

describe('the bundle of a tool that calls two verbs', () => {
  test('through runVerb, it carries those verbs and no client', async () => {
    const code = await bundle(VERB_PATH)
    expect(code).toMatch(/\bfunction prDiff\b/)
    expect(code).toMatch(/\bfunction rawChecked\b/)
    expect(code).toMatch(/\bfunction runVerb\b/)
    expect(present(code)).toEqual([])
  }, 30_000)

  test('through a Gh, it carries every verb (the check sees them when they are there)', async () => {
    expect(present(await bundle(CLIENT_PATH))).toEqual(
      expect.arrayContaining([
        'Gh',
        'searchPrs',
        'repoList',
        'graphql',
        'prList',
        'pickPrForBranch',
        'PR_VIEW_FIELDS',
        ...CLIENT_INTERNALS,
      ]),
    )
  }, 30_000)
})
