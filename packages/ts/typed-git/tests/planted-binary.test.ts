/**
 * The default runners find `git` on absolute `PATH` entries only. A relative
 * `PATH` entry is looked up from the child's `cwd` (and on Windows a bare
 * name is searched in `cwd` first), so a `git` file planted in the checkout
 * must not run in place of the real binary.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { Git, AsyncGit } from '../src/index.ts'

const MARKER = 'planted-git-ran'

let dir: string
let savedPath: string | undefined

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'typed-git-planted-')))
  writeFileSync(join(dir, 'git'), `#!/bin/sh\necho ${MARKER}\n`)
  chmodSync(join(dir, 'git'), 0o755)
  savedPath = process.env['PATH']
  process.env['PATH'] = ['.', savedPath ?? ''].join(delimiter)
})

afterAll(() => {
  if (savedPath === undefined) delete process.env['PATH']
  else process.env['PATH'] = savedPath
  rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')('a git file in the working directory', () => {
  test('Git does not run it', () => {
    const result = new Git(dir).raw(['--version'])
    expect(result.stdout).not.toContain(MARKER)
  })

  test('AsyncGit does not run it', async () => {
    const result = await new AsyncGit(dir).raw(['--version'])
    expect(result.stdout).not.toContain(MARKER)
  })
})
