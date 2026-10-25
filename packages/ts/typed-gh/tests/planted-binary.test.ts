/**
 * The default runners find `gh` on absolute `PATH` entries only. A relative
 * `PATH` entry is looked up from the child's `cwd` (and on Windows a bare
 * name is searched in `cwd` first), so a `gh` file planted in the checkout
 * must not run in place of the real binary.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { Gh, AsyncGh } from '../src/index.ts'

const MARKER = 'planted-gh-ran'

let dir: string
let savedPath: string | undefined

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'typed-gh-planted-')))
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\necho ${MARKER}\n`)
  chmodSync(join(dir, 'gh'), 0o755)
  savedPath = process.env['PATH']
  process.env['PATH'] = ['.', savedPath ?? ''].join(delimiter)
})

afterAll(() => {
  if (savedPath === undefined) delete process.env['PATH']
  else process.env['PATH'] = savedPath
  rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')('a gh file in the working directory', () => {
  test('Gh does not run it', () => {
    const result = new Gh(dir).raw(['--version'])
    expect(result.stdout).not.toContain(MARKER)
  })

  test('AsyncGh does not run it', async () => {
    const result = await new AsyncGh(dir).raw(['--version'])
    expect(result.stdout).not.toContain(MARKER)
  })
})
