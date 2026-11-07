import { describe, expect, test } from 'vitest'
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  compareChecks,
  DEFAULT_TIMEOUT_SEC,
  nameSkipReason,
  parseAppliesToHeaders,
  parseCheckName,
  parseTimeoutHeader,
  PROMPT_UNSUPPORTED,
  readCheckFolder,
} from '../../src/providers/check-folder.ts'

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'checks.d')

describe('parseCheckName', () => {
  test('splits the numeric prefix from the name', () => {
    expect(parseCheckName('10-lint')).toEqual({ order: 10, name: 'lint' })
    expect(parseCheckName('007-a.b_c-d')).toEqual({ order: 7, name: 'a.b_c-d' })
    expect(parseCheckName('20-review.md')).toEqual({ order: 20, name: 'review.md' })
  })

  test.each(['lint', '-lint', '10lint', '10-', '10-Lint', '10-.x', '10-_x', 'a10-x'])(
    'rejects %s',
    (entry) => {
      expect(parseCheckName(entry)).toBeNull()
    },
  )
})

describe('compareChecks', () => {
  const c = (entry: string) => ({ ...parseCheckName(entry)!, entry })

  test('orders by number, not text', () => {
    const sorted = [c('10-a'), c('9-a'), c('2-z')].sort(compareChecks).map((x) => x.entry)
    expect(sorted).toEqual(['2-z', '9-a', '10-a'])
  })

  test('breaks a tie on the name', () => {
    const sorted = [c('5-b'), c('5-a')].sort(compareChecks).map((x) => x.entry)
    expect(sorted).toEqual(['5-a', '5-b'])
  })
})

describe('parseTimeoutHeader', () => {
  test('reads the header in the leading comment block', () => {
    expect(parseTimeoutHeader('#!/bin/sh\n# timeout: 30\necho hi\n')).toBe(30)
    expect(parseTimeoutHeader('#!/bin/sh\n#timeout:  1.5  \n')).toBe(1.5)
  })

  test('ignores a header after code, a zero value and junk', () => {
    expect(parseTimeoutHeader('#!/bin/sh\necho hi\n# timeout: 30\n')).toBeUndefined()
    expect(parseTimeoutHeader('# timeout: 0\n')).toBeUndefined()
    expect(parseTimeoutHeader('# timeout: soon\n')).toBeUndefined()
    expect(parseTimeoutHeader('')).toBeUndefined()
  })
})

describe('parseAppliesToHeaders', () => {
  test('no header means every file', () => {
    expect(parseAppliesToHeaders('#!/bin/sh\nexit 0\n')).toEqual(['**'])
  })

  test('reads one header from the leading comment block', () => {
    expect(parseAppliesToHeaders('#!/bin/sh\n# applies_to: src/**\nexit 0\n')).toEqual(['src/**'])
  })

  test('several headers accumulate in order, mixed with other headers', () => {
    const src = '#!/bin/sh\n# applies_to: src/**\n# timeout: 5\n\n#applies_to:   docs/*.md  \n'
    expect(parseAppliesToHeaders(src)).toEqual(['src/**', 'docs/*.md'])
  })

  test('ignores a header after code and an empty value', () => {
    expect(
      parseAppliesToHeaders('#!/bin/sh\n# applies_to:\nexit 0\n# applies_to: src/**\n'),
    ).toEqual(['**'])
  })
})

describe('nameSkipReason', () => {
  test('names each name-based reason', () => {
    expect(nameSkipReason('.hidden')).toBe("leading '.'")
    expect(nameSkipReason('_helper')).toBe("leading '_'")
    expect(nameSkipReason('10-old.disabled')).toBe('disabled')
    expect(nameSkipReason('unprefixed')).toBe('no numeric prefix')
    expect(nameSkipReason('10-ok')).toBeNull()
  })

  test('says what is wrong after a valid number prefix', () => {
    expect(nameSkipReason('10_lint')).toBe("no '-' after the number prefix")
    expect(nameSkipReason('10lint')).toBe("no '-' after the number prefix")
    expect(nameSkipReason('10-')).toBe('no name after the number prefix')
    expect(nameSkipReason('10-Lint')).toMatch(/^name after the number prefix must start with a-z/)
    expect(nameSkipReason('10-.x')).toMatch(/^name after the number prefix must start with a-z/)
  })
})

describe('readCheckFolder', () => {
  test('finds checks in prefix order', async () => {
    const folder = await readCheckFolder(FIXTURES)

    expect(folder.dir).toBe(FIXTURES)
    expect(folder.checks.map((c) => `${c.kind}:${c.entry}`)).toEqual([
      'script:10-pass',
      'script:20-fail',
      'script:30-slow',
      'script:35-child',
      'script:40-env',
      'script:50-signal',
      'prompt:60-review.md',
    ])
  })

  test('reports every skip with its reason', async () => {
    const folder = await readCheckFolder(FIXTURES)
    const reasons = Object.fromEntries(folder.skipped.map((s) => [s.entry, s.reason]))

    expect(reasons).toEqual({
      '.hidden': "leading '.'",
      _helper: "leading '_'",
      '70-not-executable': 'not executable',
      '80-retired.disabled': 'disabled',
      '90-dir': 'directory',
      unprefixed: 'no numeric prefix',
    })
  })

  test('reads the timeout header, defaulting to 600 seconds', async () => {
    const folder = await readCheckFolder(FIXTURES)
    const timeouts = Object.fromEntries(
      folder.checks.flatMap((c) => (c.kind === 'script' ? [[c.entry, c.timeoutSec]] : [])),
    )

    expect(timeouts['30-slow']).toBe(1)
    expect(timeouts['10-pass']).toBe(DEFAULT_TIMEOUT_SEC)
  })

  test('reads applies_to into scope, defaulting to every file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'check-scope-'))
    try {
      await writeFile(join(dir, '1-any'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
      await writeFile(
        join(dir, '2-some'),
        '#!/bin/sh\n# applies_to: src/**\n# applies_to: docs/**\nexit 0\n',
        { mode: 0o755 },
      )
      const folder = await readCheckFolder(dir)
      const scopes = Object.fromEntries(
        folder.checks.flatMap((c) => (c.kind === 'script' ? [[c.entry, c.scope]] : [])),
      )

      expect(scopes).toEqual({ '1-any': ['**'], '2-some': ['src/**', 'docs/**'] })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('a prompt check carries no timeout and no run reason here', async () => {
    const folder = await readCheckFolder(FIXTURES)
    const prompt = folder.checks.find((c) => c.kind === 'prompt')

    expect(prompt).toMatchObject({ entry: '60-review.md', order: 60, name: 'review.md' })
    expect(PROMPT_UNSUPPORTED).toContain('not yet supported')
  })

  test('skips a broken symlink with its reason, keeping the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'check-folder-'))
    try {
      await writeFile(join(dir, '10-ok'), '#!/bin/sh\n', { mode: 0o755 })
      await symlink(join(dir, 'missing'), join(dir, '20-broken'))

      const folder = await readCheckFolder(dir)

      expect(folder.checks.map((c) => c.entry)).toEqual(['10-ok'])
      expect(folder.skipped).toEqual([{ entry: '20-broken', reason: 'broken symlink (ENOENT)' }])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // root reads a mode-0111 file, so the unreadable case cannot be made there.
  test.skipIf(process.getuid?.() === 0)('skips an executable script it cannot read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'check-folder-'))
    try {
      // Executable but not readable: git cannot store this mode, so it is made here.
      await writeFile(join(dir, '30-locked'), '#!/bin/sh\n')
      await chmod(join(dir, '30-locked'), 0o111)

      const folder = await readCheckFolder(dir)

      expect(folder.checks).toEqual([])
      expect(folder.skipped).toEqual([{ entry: '30-locked', reason: 'unreadable (EACCES)' }])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('reads the headers of a large script without reading past them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'check-folder-large-'))
    try {
      const body = '#!/bin/sh\n# applies_to: src/**\n# timeout: 7\n' + 'x'.repeat(1 << 20) + '\n'
      await writeFile(join(dir, '10-big'), body, { mode: 0o755 })

      const [check] = (await readCheckFolder(dir)).checks

      expect(check).toMatchObject({ kind: 'script', scope: ['src/**'], timeoutSec: 7 })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('rejects a folder that does not exist', async () => {
    await expect(readCheckFolder(join(FIXTURES, 'nope'))).rejects.toThrow()
  })
})
