import picomatch from 'picomatch'
import { describe, expect, test } from 'vitest'

import { compileGlobs } from '../src/glob.ts'
import { DEFAULT_RULES, RULE_GROUPS } from '../src/groups.ts'

const PATHS = [
  'src/a.ts',
  'a.map',
  '.map',
  'a/.map',
  'map',
  'vendor',
  'vendor/x.js',
  'a/vendor/b/c.js',
  'avendor/x.js',
  'SKILL.md',
  'a/SKILL.md',
  'aSKILL.md',
  'SKILL.md/x',
  'x.min.js',
  'a/b.min.css',
  '.claude/agents/x.md',
  'x/.claude/agents',
  'pkg/tests/helpers.ts',
  'a/test_x.py',
  'x/bun.lockb',
  'go.sum.x',
  'docs/index.md',
  'docs/index.mdx',
  'a//SKILL.md',
  '/x.map',
  './x.map',
  'a/./vendor/x',
  '../vendor/x',
  'vendor/',
  'a/SKILL.md/',
  '',
  '.',
]

const GLOBS = [
  ...RULE_GROUPS.flatMap((g) => DEFAULT_RULES[g]),
  '*.js',
  'docs/index.md',
  'docs/**',
  '**/a/b.md',
  '{a,b}/**',
  '**/a{1..3}',
  '**/{a}',
  '**/{,a}',
  './a',
  '/a',
  '**/x+y.md',
  '**/a[b].md',
]

describe('compileGlobs', () => {
  for (const options of [
    { dot: true } as const,
    { dot: true, nobrace: true, noextglob: true, posix: true } as const,
  ]) {
    test(`matches as picomatch does, ${JSON.stringify(options)}`, () => {
      for (const glob of GLOBS) {
        const want = picomatch(glob, options)
        const got = compileGlobs([glob], options)
        for (const path of PATHS) expect([glob, path, got(path)]).toEqual([glob, path, want(path)])
      }
      for (const g of RULE_GROUPS) {
        const want = picomatch([...DEFAULT_RULES[g]], options)
        const got = compileGlobs(DEFAULT_RULES[g], options)
        for (const path of PATHS) expect([g, path, got(path)]).toEqual([g, path, want(path)])
      }
    })
  }

  test('no globs match nothing', () => {
    expect(compileGlobs([], { dot: true })('a')).toBe(false)
  })
})
