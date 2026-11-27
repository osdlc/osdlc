import ts from 'typescript'
import { expect, test } from 'vitest'

import {
  CHANGE_CATEGORIES,
  CHANGE_KINDS,
  DEFAULT_RULES,
  ENTRY_KINDS,
  FILE_GROUPS,
  FILE_STATUSES,
  OPERATIONS,
  RULE_GROUPS,
  assignOperations,
  buildDiffReport,
  categorizeChange,
  createGroupClassifier,
  createLizardAnalyzer,
  createTypescriptAnalyzer,
  defaultAnalyzers,
  dependencyChange,
  diffReportSchema,
  parseDiff,
  renderDiff,
} from '@osdlc/code-stats'
import { createScannerRegistry } from '@osdlc/code-stats/scan'

/** A one-file unified diff with the changed lines in one hunk. */
function diffOf(path: string, removed: string[], added: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${removed.length} +1,${added.length} @@`,
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
    '',
  ].join('\n')
}

test('the lists of values the reports are made of', () => {
  expect(CHANGE_KINDS).toEqual(['pr', 'range', 'merge-base', 'worktree'])
  expect(OPERATIONS).toEqual(['added', 'removed', 'changed', 'moved'])
  expect(FILE_STATUSES).toEqual(['added', 'deleted', 'modified', 'renamed'])
  expect(ENTRY_KINDS).toEqual(['file', 'symlink', 'submodule'])
  expect(FILE_GROUPS).toContain('generated')
  expect(RULE_GROUPS).toEqual(['generated', 'vendored', 'instructions', 'docs', 'tests'])
  expect(CHANGE_CATEGORIES).toContain('formatting')
})

test('parseDiff and assignOperations say what happened to each changed line', () => {
  const files = parseDiff(diffOf('a.ts', ['const a = 1', 'const keep = 2'], ['const a = 11']))
  expect(files).toHaveLength(1)
  expect(files[0]).toMatchObject({ path: 'a.ts', status: 'modified', entry: 'file' })
  const [ops] = assignOperations(files)
  expect(ops!.removed).toEqual(['changed', 'removed'])
  expect(ops!.added).toEqual(['changed'])
})

test('buildDiffReport builds a report from a diff you already have', () => {
  const diff = diffOf('src/a.ts', ['const a = 1'], ['const a = 1', '// why', 'const b = 2'])
  const change = { kind: 'range', label: 'a..b', pr: null, base: null, head: null } as const
  const report = buildDiffReport(change, diff, null)
  expect(report.lines).toEqual({ added: 3, removed: 1 })
  expect(report.groups.source.files).toBe(1)
  expect(diffReportSchema.parse(report)).toEqual(report)
  expect(renderDiff(report)).toContain('src/a.ts')
})

test('createGroupClassifier decides what a file is for, with your globs ahead of the built-in ones', () => {
  expect(DEFAULT_RULES.tests.length).toBeGreaterThan(0)
  const group = createGroupClassifier({ generated: ['**/*.pb.ts'], docs: ['notes/**'] })
  expect(group({ path: 'src/a.ts', category: 'programming' })).toBe('source')
  expect(group({ path: 'src/a.test.ts', category: 'programming' })).toBe('tests')
  expect(group({ path: 'src/a.pb.ts', category: 'programming' })).toBe('generated')
  expect(group({ path: 'notes/a.txt', category: null })).toBe('docs')
})

test('categorizeChange puts a file change in one category', () => {
  const [file] = parseDiff(diffOf('src/a.ts', ['// old'], ['// new']))
  const registry = createScannerRegistry()
  const kinds = (text: string) => registry.scan(text, 'src/a.ts').kinds
  const category = categorizeChange(file!, {
    group: 'source',
    language: 'TypeScript',
    added: kinds('// new\n'),
    removed: kinds('// old\n'),
    dependencies: null,
  })
  expect(category).toBe('comments')
})

test('dependencyChange reads the dependencies a manifest diff adds, removes and bumps', () => {
  const [file] = parseDiff(
    diffOf(
      'package.json',
      ['    "zod": "^3.0.0",', '    "left-pad": "1.0.0"'],
      ['    "zod": "^4.0.0",', '    "picomatch": "4.0.0"'],
    ),
  )
  const change = dependencyChange(file!)
  expect(change?.bumped).toEqual([{ name: 'zod', from: '^3.0.0', to: '^4.0.0' }])
  expect(change?.added).toEqual([{ name: 'picomatch', version: '4.0.0' }])
  expect(change?.removed).toEqual([{ name: 'left-pad', version: '1.0.0' }])
  expect(dependencyChange(parseDiff(diffOf('src/a.ts', ['a'], ['b']))[0]!)).toBeNull()
})

test('the complexity analyzers score functions by cyclomatic complexity', () => {
  // The analyzer takes the TypeScript compiler module a consumer already has.
  const analyzer = createTypescriptAnalyzer(ts)
  expect(analyzer.matches('src/a.ts')).toBe(true)
  const scores = analyzer.analyze(
    'function f(x: number) {\n  return x > 1 && x < 5 ? 1 : 2\n}\n',
    'a.ts',
  )
  expect(scores.get('f')).toBe(3)

  // lizard scores the other languages; here a runner stands in for the program.
  const lizard = createLizardAnalyzer({
    binary: 'lizard',
    run: (argv) =>
      argv[0] === '--csv'
        ? {
            exitCode: 0,
            stdout: `3,4,20,1,3,"g@1-3@${argv[1]}","${argv[1]}","g","g( )",1,3\n`,
            stderr: '',
          }
        : { exitCode: 0, stdout: 'lizard 1.17', stderr: '' },
  })
  expect(lizard.available()).toBe(true)
  expect(lizard.analyze('fn g() {}', 'b.rs').get('g')).toBe(4)

  expect(defaultAnalyzers(ts).map((a) => a.id)).toHaveLength(2)
})
