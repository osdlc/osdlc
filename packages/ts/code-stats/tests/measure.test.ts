import { mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { CodeStatsError } from '../src/error.ts'
import {
  compareChanges,
  countTree,
  diffChange,
  measureChange,
  writePrBody,
} from '../src/measure.ts'
import { STATS_SECTION } from '../src/report/splice.ts'
import { compareReportSchema, countReportSchema, diffReportSchema } from '../src/report/schema.ts'
import { fakeRunner } from '@osdlc/command-seam/testing'
import { testRepo } from './repo-fixture.ts'

const MOVED = 'export const configuration = loadConfiguration()'

function sampleRepo() {
  const r = testRepo()
  const base = r.commit('base', {
    'src/a.ts': `import { x } from './x.ts'\n\n/** A. */\n${MOVED}\nexport const a = x + 1\n`,
    'src/b.ts': 'export const b = 2\n',
    'README.md': '# Sample\n',
    'bun.lock': '{}\n',
    '.gitattributes': 'src/gen.ts linguist-generated\n',
    'src/gen.ts': 'export const generated = true\n',
  })
  r.git('switch', '-q', '-c', 'feature')
  const head = r.commit('feature', {
    'src/a.ts': `import { x } from './x.ts'\n\n/** A. */\nexport const a = x + 2\n`,
    'src/b.ts': `export const b = 2\n${MOVED}\n`,
    'src/gen.ts': 'export const generated = false\n',
  })
  return { r, base, head }
}

describe('countTree', () => {
  test('a revision and a subtree', () => {
    const { r, head } = sampleRepo()
    r.write({ 'src/new.ts': '// draft\n' })

    const all = countTree({ cwd: r.dir })
    expect(countReportSchema.parse(all)).toEqual(all)
    expect(all.source).toEqual({ label: 'HEAD', commit: head })
    expect(all.groups.generated.files).toBe(2)
    expect(all.languages.map((l) => l.language)).toContain('TypeScript')

    const src = countTree({ cwd: r.dir, paths: ['src'] })
    expect(src.files).toBe(3)

    const noLinguist = countTree({ cwd: r.dir, paths: ['src'], linguist: false })
    expect(noLinguist.groups.generated.files).toBe(0)
  })
})

// A symlink on Windows needs a privilege the CI runner does not grant.
test.skipIf(process.platform === 'win32')('countTree from a cwd reached through a symlink', () => {
  const { r } = sampleRepo()
  const link = join(mkdtempSync(join(tmpdir(), 'code-stats-link-')), 'repo')
  symlinkSync(r.dir, link)
  expect(countTree({ cwd: link, paths: ['src'] }).files).toBe(3)
})

describe('diffChange and compareChanges', () => {
  test('a branch: moved, changed and generated lines', () => {
    const { r } = sampleRepo()
    const report = diffChange({ kind: 'merge-base', base: 'main', head: 'feature' }, { cwd: r.dir })
    expect(diffReportSchema.parse(report)).toEqual(report)
    expect(report.kindOperations.logic).toEqual({ added: 0, removed: 0, changed: 1, moved: 1 })
    expect(report.groups.generated).toEqual({ files: 1, added: 1, removed: 1 })
    expect(report.notes).toEqual([])
  })

  test('measureChange keeps the parsed diff and the texts it read; analysis can be left out', () => {
    const { r } = sampleRepo()
    const spec = { kind: 'merge-base', base: 'main', head: 'feature' } as const
    const m = measureChange(spec, { cwd: r.dir, analysis: false })
    expect(m.files.map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/gen.ts'])
    expect(m.texts.head.get('src/b.ts')).toEqual({
      kind: 'text',
      text: `export const b = 2\n${MOVED}\n`,
    })
    expect(m.texts.base.get('src/b.ts')).toEqual({ kind: 'text', text: 'export const b = 2\n' })
    expect(m.report.api.status).toBe('skipped')
    expect(m.report.notes).toEqual([])
    expect(m.report.kindOperations).toEqual(diffChange(spec, { cwd: r.dir }).kindOperations)
  })

  test('the same change measured twice compares equal', () => {
    const { r, base, head } = sampleRepo()
    const spec = { kind: 'range', base, head } as const
    const report = compareChanges(spec, spec, { cwd: r.dir })
    expect(compareReportSchema.parse(report)).toEqual(report)
    expect(report.a.kindOperations).toEqual(report.b.kindOperations)
  })
})

describe('writePrBody', () => {
  test('splices the block into the body once', () => {
    const { r } = sampleRepo()
    const block = `${STATS_SECTION.start}\ntable\n${STATS_SECTION.end}`
    const edits: string[] = []
    const gh = fakeRunner((argv) => {
      if (argv[0] === 'pr' && argv[1] === 'view') {
        const body = edits.at(-1) ?? 'Summary\n'
        return { stdout: JSON.stringify({ number: 4, body }) }
      }
      if (argv[0] === 'pr' && argv[1] === 'edit') {
        edits.push(argv[argv.indexOf('--body') + 1] ?? '')
        return { stdout: '' }
      }
      return undefined
    })
    const options = { cwd: r.dir, runners: { gh: gh.runner } }
    expect(writePrBody(4, block, options)).toBe(true)
    expect(edits).toEqual([`Summary\n\n## Change statistics\n\n${block}\n`])
    expect(writePrBody(4, block, options)).toBe(false)
    expect(edits).toHaveLength(1)
  })
  test('a gh failure keeps its classified reason and hint', () => {
    const { r } = sampleRepo()
    const signedOut = fakeRunner(() => ({
      exitCode: 4,
      stderr: 'To get started with GitHub CLI, please run:  gh auth login\n',
    }))
    const write = () => writePrBody(4, 'x', { cwd: r.dir, runners: { gh: signedOut.runner } })
    expect(write).toThrow('could not read PR #4: gh is not signed in to GitHub')
    try {
      write()
    } catch (e) {
      expect((e as CodeStatsError).failure?.kind).toBe('not-authenticated')
    }
  })
})
