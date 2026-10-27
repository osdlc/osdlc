import { afterAll, describe, expect, test } from 'vitest'

import { tasks } from '../src/model.ts'
import {
  type Canned,
  collect,
  detectAndCollect,
  fakeRunners,
  fakeWhich,
  fixtureRoot,
  removeRoot,
} from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/**
 * Fixture roots are not repositories, so discovery is pinned to the walk.
 * `which` finds nothing unless a test opts in, so results do not depend on the
 * machine running them.
 */
function opts(canned: Canned[] = [], extra: Record<string, unknown> = {}) {
  const { make, calls } = fakeRunners(canned)
  return {
    options: { discovery: 'walk' as const, makeRunner: make, which: fakeWhich({}), ...extra },
    calls,
  }
}

describe('make runner', () => {
  test('reads targets and skips directives, pattern rules and assignments', async () => {
    const dir = await root({
      Makefile: [
        'CC := gcc',
        '.PHONY: all',
        'all: build test',
        '\techo all',
        'build:',
        '\techo build',
        '%.o: %.c',
        '\techo pattern',
      ].join('\n'),
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['make'] }))

    expect(found.map((t) => t.path[2])).toEqual(['all', 'build'])
    expect(found[0]?.argv).toEqual(['make', 'all'])
  })

  test('a nested makefile is addressed with -C', async () => {
    const dir = await root({ 'sub/Makefile': 'run:\n\techo hi\n' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['make'] }))

    expect(found[0]?.argv).toEqual(['make', '-C', 'sub', 'run'])
  })

  test('detects every makefile basename', async () => {
    const dir = await root({
      'a/makefile': 'one:\n\techo\n',
      'b/GNUmakefile': 'two:\n\techo\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['make'] }))

    expect(found.map((t) => t.source).sort()).toEqual(['a/makefile', 'b/GNUmakefile'])
  })

  test('reads the makefile GNU make would read: GNUmakefile, then makefile, then Makefile', async () => {
    const dir = await root({
      GNUmakefile: 'from-gnu:\n\techo\n',
      makefile: 'from-lower:\n\techo\n',
      'b/GNUmakefile': 'from-gnu:\n\techo\n',
      'b/Makefile': 'from-upper:\n\techo\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['make'] }))

    expect(found.map((t) => t.source).sort()).toEqual(['GNUmakefile', 'b/GNUmakefile'])
  })

  // A case-insensitive filesystem cannot hold both names in one directory.
  test.skipIf(process.platform === 'darwin' || process.platform === 'win32')(
    'makefile wins over Makefile',
    async () => {
      const dir = await root({ makefile: 'a:\n\techo\n', Makefile: 'b:\n\techo\n' })
      const { options } = opts()
      const found = tasks(await collect(dir, { ...options, only: ['make'] }))

      expect(found.map((t) => t.path[2])).toEqual(['a'])
    },
  )

  test('reads every target of a multi-target line, and skips `::=` and `:::=` assignments', async () => {
    const dir = await root({
      Makefile: [
        'clean distclean:',
        '\trm -rf out',
        'all::',
        '\techo',
        'fmt: ; gofmt',
        'CFLAGS ::= -O2',
        'LDFLAGS :::= -s',
        'export X := 1',
        'Y ?= 2',
        '$(info a: b)',
      ].join('\n'),
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['make'] }))

    expect(found.map((t) => t.path[2])).toEqual(['all', 'clean', 'distclean', 'fmt'])
  })

  test('no makefile means no report', async () => {
    const dir = await root({ 'README.md': '# hi\n' })
    const { options } = opts()
    const catalog = await collect(dir, { ...options, only: ['make'] })

    expect(catalog.reports.find((r) => r.runner === 'make')).toBeUndefined()
  })

  test('invoke appends arguments to the target', async () => {
    const dir = await root({ 'sub/Makefile': 'run:\n\techo hi\n' })
    const { options } = opts()
    const { project, catalog } = await detectAndCollect(dir, { ...options, only: ['make'] })
    const run = tasks(catalog)[0]!

    expect(project.runners.invoke(run, ['V=1'])).toEqual(['make', '-C', 'sub', 'run', 'V=1'])
  })
})
