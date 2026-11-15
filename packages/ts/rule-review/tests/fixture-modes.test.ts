/**
 * The check-folder fixtures that must run keep mode 100755 in the git index.
 * With `core.fileMode=false` a lost executable bit does not show in `git status`,
 * and the tests that run the fixture then fail on another machine.
 */
import { fileURLToPath } from 'node:url'

import { Git } from '@osdlc/typed-git'
import { expect, test } from 'vitest'

const DIR = fileURLToPath(new URL('./fixtures/checks.d', import.meta.url))

/** Fixtures that are deliberately not executable. */
const NOT_EXECUTABLE = new Set(['60-review.md', '70-not-executable', '90-dir/.gitkeep'])

const git = new Git(DIR)
const tracked = git.topLevel() !== null

test.skipIf(!tracked)('every fixture script that must run is 100755 in the index', () => {
  const entries = git
    .rawChecked(['ls-files', '-s', '--', '.'])
    .stdout.trim()
    .split('\n')
    .map((line) => {
      const [meta = '', path = ''] = line.split('\t')
      return { mode: meta.split(' ')[0], path }
    })
  expect(entries.length).toBeGreaterThan(0)

  const wrong = entries
    .filter((e) => e.mode !== (NOT_EXECUTABLE.has(e.path) ? '100644' : '100755'))
    .map((e) => `${e.path} (${e.mode})`)
  expect(wrong, `fix with: git update-index --chmod=+x <path>`).toEqual([])
})
