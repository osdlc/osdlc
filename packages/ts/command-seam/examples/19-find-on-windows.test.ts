/**
 * Need: check which package manager a Windows user has, in a test that runs
 * on any CI machine.
 *
 * On Windows, `npm` and `pnpm` are `.cmd` shims, not `.exe` files. `which`
 * applies `PATHEXT` when `platform` is `'win32'`, so the lookup can be
 * tested on Linux and macOS too. The runners use the same lookup on Windows
 * and start a `.cmd` file through `cmd.exe`, so `spawnRunner('npm')` works
 * there with no extra step.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import { which, type WhichOptions } from '@osdlc/command-seam'

// ---- Code under test -------------------------------------------------------

/** The first package manager installed, by preference. */
function packageManager(opts: WhichOptions = {}): string | undefined {
  return ['pnpm', 'yarn', 'npm'].find((pm) => which(pm, opts) !== undefined)
}

// ---- Tests -----------------------------------------------------------------

const bin = realpathSync(mkdtempSync(join(tmpdir(), 'seam-windows-example-')))
afterAll(() => rmSync(bin, { recursive: true, force: true }))

test('a .CMD shim on PATH is found through PATHEXT', () => {
  // Windows has no execute bit: a file with a PATHEXT extension is enough.
  writeFileSync(join(bin, 'npm.CMD'), '@node "%~dp0\\npm-cli.js" %*\r\n')
  const windows = { platform: 'win32', env: { Path: bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' } } as const

  expect(packageManager(windows)).toBe('npm')
  expect(which('npm', windows)).toBe(join(bin, 'npm.CMD'))
  // The POSIX rules want an executable named exactly `npm`.
  expect(which('npm', { platform: 'linux', env: { PATH: bin } })).toBeUndefined()
})
