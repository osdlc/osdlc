/**
 * Scanners that read a repository's files in-process, before any trust, must
 * take time linear in the input. Each case feeds a shape that made an earlier
 * regex backtrack with the square (or worse) of its length, and must finish
 * well inside BOUND_MS.
 */

import { describe, expect, test } from 'vitest'

import type { ProviderContext } from '../src/contract.ts'
import { tasks } from '../src/model.ts'
import { segmentMatcher } from '../src/pattern.ts'
import { parseTaskRows } from '../src/plugins/jvm/sbt.ts'
import { parseGemfile } from '../src/plugins/ruby/gemfile.ts'
import { eachDefinesTask, scanTasks } from '../src/plugins/ruby/rake.ts'
import { readTaskfile } from '../src/plugins/runners/go-task.ts'
import { vscodeTasks } from '../src/plugins/runners/index.ts'
import { scanRecipes } from '../src/plugins/runners/just.ts'
import { probeError } from '../src/plugins/runners/moon.ts'
import { matchKey, plainScalarStart } from '../src/plugins/support/yaml-lite.ts'
import { preCommitHooks } from '../src/plugins/tools/hooks.ts'
import { globMatches } from '../src/roles.ts'
import { detectAndCollect, fixtureRoot, removeRoot } from './support.ts'

/** Each input is about this long. The old regexes took seconds to minutes. */
const N = 200_000
const BOUND_MS = 300
const spaces = ' '.repeat(N)

function timed<T>(f: () => T): T {
  const start = performance.now()
  const out = f()
  expect(performance.now() - start).toBeLessThan(BOUND_MS)
  return out
}

async function timedAsync<T>(f: () => Promise<T>): Promise<T> {
  const start = performance.now()
  const out = await f()
  expect(performance.now() - start).toBeLessThan(BOUND_MS * 3)
  return out
}

describe('linear scans', () => {
  test('just: a header with many unclosed `(`', () => {
    expect(timed(() => scanRecipes(`a: ${'(b'.repeat(N / 2)}\n`))).toEqual([
      { name: 'a', deps: [] },
    ])
  })

  test('just: a nested dependency argument still counts by its first word', () => {
    expect(scanRecipes('a: (deploy ("x" + ")")) lint\n')).toEqual([
      { name: 'a', deps: ['deploy', 'lint'] },
    ])
  })

  test('rake: `do` followed by a long run of spaces', () => {
    timed(() => scanTasks(`task :a do${spaces}x\n`))
  })

  test('rake: `task` and `namespace` followed by a long run of spaces', () => {
    timed(() => scanTasks(`task${spaces}!\nnamespace${spaces}!\n`))
  })

  test('rake: many `.each` blocks on one line with no `task`', () => {
    expect(timed(() => eachDefinesTask('.each do |x|'.repeat(N / 12)))).toBe(false)
    expect(eachDefinesTask('xs.each do |x| task x\n')).toBe(true)
  })

  test('rake: deep namespaces do not make the output grow with the square', () => {
    const text = 'namespace :n do\ntask :t\n'.repeat(N / 24)
    const found = timed(() => scanTasks(text))
    expect(found.length).toBeLessThan(N / 24)
    expect(found[0]!.path).toBe('n:t')
  })

  test('rake: a file of blank lines', () => {
    // The `import` and `load` checks run over the whole text.
    timed(() => scanTasks('\n'.repeat(N)))
  })

  test('Gemfile: a group line with many `do |`', () => {
    timed(() => parseGemfile(`group ${'do |'.repeat(N / 4)}x\n`, 'Gemfile'))
  })

  test('Gemfile: many open groups', () => {
    const text = "group :prod do\ngem 'a'\n".repeat(N / 24)
    const fact = timed(() => parseGemfile(text, 'Gemfile'))
    expect(fact.deps!.every((d) => d.kind === 'dev')).toBe(true)
  })

  test('go-task: a deps item with a long run of spaces', () => {
    timed(() => readTaskfile(`version: '3'\ntasks:\n  a:\n    deps:\n      - b${spaces}c\n`))
  })

  test('yaml-lite: a key with a long run of spaces and no colon', () => {
    const line = `a${spaces}b`
    timed(() => plainScalarStart(line))
    expect(timed(() => matchKey(line, 0))).toBeNull()
    expect(matchKey('key  : value', 0)).toEqual({ key: 'key', value: 'value' })
  })

  test('pre-commit: a config of blank lines', async () => {
    const ctx = { readText: async () => '\n'.repeat(N) } as unknown as ProviderContext
    expect(await timedAsync(() => preCommitHooks(ctx, '.pre-commit-config.yaml'))).toEqual([])
  })

  test('moon and sbt output with long runs of spaces', () => {
    timed(() => probeError(`a${spaces}b\n`))
    expect(timed(() => parseTaskRows(` a  b${spaces}c`))[0]!.name).toBe('a')
    expect(parseTaskRows('  compile   Compiles sources.   ')).toEqual([
      { name: 'compile', description: 'Compiles sources.' },
    ])
  })

  test('workspace globs with many `*` or `**`', () => {
    const star = segmentMatcher('a*'.repeat(30) + 'b')
    expect(timed(() => star.test('a'.repeat(255)))).toBe(false)
    expect(segmentMatcher('a*c*').test('abxcd')).toBe(true)
    const deep = Array(200).fill('**').join('/') + '/x'
    expect(timed(() => globMatches(deep, Array(200).fill('a').join('/')))).toBe(false)
    expect(globMatches('apps/**/web', 'apps/a/b/web')).toBe(true)
  })

  test('vscode-tasks: many `${` and trailing slashes', async () => {
    const dir = await fixtureRoot({
      '.vscode/tasks.json': JSON.stringify({
        tasks: [
          { label: 'vars', type: 'shell', command: `echo ${'${'.repeat(N / 2)}` },
          { label: 'web', type: 'npm', script: 'dev', path: `${'/'.repeat(N)}x` },
        ],
      }),
    })
    try {
      const { catalog } = await timedAsync(() =>
        detectAndCollect(dir, { discovery: 'walk', tools: [vscodeTasks] }),
      )
      expect(tasks(catalog).map((t) => t.path.at(-1))).toContain('vars')
    } finally {
      await removeRoot(dir)
    }
  })
})
