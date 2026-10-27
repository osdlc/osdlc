/**
 * Need: show a person the command to run by hand, in a form they can paste
 * into their own terminal, including the change of folder.
 *
 * `shellJoin` quotes for POSIX shells only. PowerShell reads `'\''` as a
 * different string and needs `&` before a quoted program path.
 * `commandString` quotes for the shell the platform uses: POSIX shells, or
 * PowerShell on Windows. `shell: 'cmd'` gives a line for `cmd.exe`.
 */

import { expect, test } from 'vitest'

import { commandString, type CommandStringOptions } from '@osdlc/command-seam'

// ---- Code under test -------------------------------------------------------

/** The hint printed when a step fails: how to run it again by hand. */
function retryHint(argv: string[], cwd: string, opts: CommandStringOptions = {}): string {
  return `To run it again: ${commandString(argv, { ...opts, cwd })}`
}

// ---- Tests -----------------------------------------------------------------

const argv = ['git', 'commit', '-m', "it's done"]

test('POSIX: cd, then the command, quoted for sh', () => {
  expect(retryHint(argv, '/home/me/my repo', { platform: 'linux' })).toBe(
    `To run it again: cd '/home/me/my repo' && git commit -m 'it'\\''s done'`,
  )
})

test('Windows: PowerShell by default', () => {
  expect(retryHint(argv, 'C:\\Users\\me\\my repo', { platform: 'win32' })).toBe(
    "To run it again: if (Set-Location -LiteralPath 'C:\\Users\\me\\my repo' -PassThru) { & git commit -m 'it''s done' }",
  )
})

test('Windows: cmd.exe on request', () => {
  expect(retryHint(argv, 'C:\\repo', { platform: 'win32', shell: 'cmd' })).toBe(
    'To run it again: cd /d C:\\repo && git commit -m ^"it\'s^ done^"',
  )
})
