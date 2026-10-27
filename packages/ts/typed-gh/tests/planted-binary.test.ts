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

import { which } from '@osdlc/command-seam'

import { Gh, AsyncGh } from '../src/index.ts'

const MARKER = 'planted-gh-ran'

let dir: string
let savedPath: string | undefined

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'typed-gh-planted-')))
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\necho ${MARKER}\n`)
  chmodSync(join(dir, 'gh'), 0o755)
  savedPath = process.env['PATH']
})

afterAll(() => {
  if (savedPath === undefined) delete process.env['PATH']
  else process.env['PATH'] = savedPath
  rmSync(dir, { recursive: true, force: true })
})

// Put ahead of the real PATH. A relative entry (`.`) and an empty one both mean `cwd`.
const PREFIXES = {
  'a relative PATH entry': `.${delimiter}`,
  'an empty PATH entry': delimiter,
}

/** Whether a real gh is installed, so the result can be checked either way. */
function realGh(): boolean {
  return which('gh', { env: { PATH: savedPath }, absolutePathOnly: true }) !== undefined
}

describe.skipIf(process.platform === 'win32')('a gh file in the working directory', () => {
  for (const [name, prefix] of Object.entries(PREFIXES)) {
    test(`Gh runs the real gh, or none, not the planted one, through ${name}`, () => {
      process.env['PATH'] = prefix + (savedPath ?? '')
      const gh = new Gh(dir)
      const result = gh.raw(['--version'])
      expect(result.stdout).not.toContain(MARKER)
      if (realGh()) expect(result.stdout).toMatch(/^gh version /)
      else expect(gh.try.prList()).toMatchObject({ ok: false, error: { kind: 'not-installed' } })
    })

    test(`AsyncGh runs the real gh, or none, not the planted one, through ${name}`, async () => {
      process.env['PATH'] = prefix + (savedPath ?? '')
      const gh = new AsyncGh(dir)
      const result = await gh.raw(['--version'])
      expect(result.stdout).not.toContain(MARKER)
      if (realGh()) expect(result.stdout).toMatch(/^gh version /)
      else
        expect(await gh.try.prList()).toMatchObject({
          ok: false,
          error: { kind: 'not-installed' },
        })
    })
  }
})
