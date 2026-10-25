/**
 * Need: a web page shows a command for a person to copy, quoted exactly as
 * the CLI prints it. The page cannot load Node modules.
 *
 * `@osdlc/command-seam/quote` has the quoting functions and nothing else.
 * The POSIX form reads the same in fish, which treats `\` inside single
 * quotes as an escape, so a backslash is written outside the quotes.
 */

import { expect, test } from 'vitest'

import {
  commandString,
  shellJoin,
  shellQuote,
  type CommandStringOptions,
} from '@osdlc/command-seam/quote'

// ---- Code under test -------------------------------------------------------

/** What a Copy button puts on the clipboard. */
function copyLine(argv: string[], cwd: string, platform: CommandStringOptions['platform']): string {
  return commandString(argv, { platform, ...(cwd === '.' ? {} : { cwd }) })
}

// ---- Tests -----------------------------------------------------------------

test('a script name with shell syntax copies as one word', () => {
  expect(copyLine(['npm', 'run', 'x; touch PWNED #'], '.', 'linux')).toBe(
    "npm run 'x; touch PWNED #'",
  )
})

test('a backslash is written outside the quotes', () => {
  expect(shellQuote('hello\\')).toBe("'hello'\\\\''")
  expect(shellJoin(['echo', 'a\\b'])).toBe("echo 'a'\\\\'b'")
})

test('the task directory comes first', () => {
  expect(copyLine(['make', 'all'], 'pkg a', 'linux')).toBe("cd 'pkg a' && make all")
})
