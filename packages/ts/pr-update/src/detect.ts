/**
 * The detected tier of `verify: detect`: a fixed ladder of well-known test commands, read from a
 * repository checkout. Nothing beyond the ladder is guessed.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The test command a rung found, and which rung it was. */
export interface DetectedVerify {
  command: string
  /** Names the rung and the file it read, for the line printed on every run. */
  rung: string
}

/** What a ladder that matched nothing looked for, for the error. */
export const DETECT_LOOKED_FOR =
  'test_command, a `test` target in a justfile or Makefile, scripts.test in package.json, ' +
  'Cargo.toml, go.mod or build.sbt'

const JUSTFILES = ['justfile', 'Justfile', '.justfile']
const MAKEFILES = ['GNUmakefile', 'makefile', 'Makefile']
// A recipe or target named `test`, not `test-all`, a `test := value` assignment or an indented line.
const JUST_TEST = /^test(?:[ \t][^:=\n]*)?:(?!=)/m
const MAKE_TEST = /^test[ \t]*::?(?![:=])/m
const NPM_INIT_PLACEHOLDER = /no test specified/

/** `scripts.test` run with the package manager the lockfile names; `npm test` by default. */
function packageManagerTestCommand(dir: string): string {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm test'
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn test'
  if (existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb'))) return 'bun run test'
  return 'npm test'
}

function firstFile(dir: string, names: readonly string[]): string | null {
  return names.find((n) => existsSync(join(dir, n))) ?? null
}

function packageJsonTest(dir: string): boolean {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return false
  try {
    const script = (JSON.parse(readFileSync(file, 'utf8')) as { scripts?: { test?: unknown } })
      .scripts?.test
    return typeof script === 'string' && script.trim() !== '' && !NPM_INIT_PLACEHOLDER.test(script)
  } catch {
    return false
  }
}

/**
 * The first rung of the ladder that matches in `dir`, or null:
 *
 * 1. `testCommand`, when configured;
 * 2. a `test` target of a justfile, then a Makefile;
 * 3. `scripts.test` of `package.json`, run with the package manager its lockfile names;
 * 4. `cargo test` for `Cargo.toml`, `go test ./...` for `go.mod`, `sbt test` for `build.sbt`.
 */
export function detectVerifyCommand(
  dir: string,
  testCommand: string | null = null,
): DetectedVerify | null {
  if (testCommand !== null && testCommand.trim() !== '')
    return { command: testCommand, rung: 'test_command' }

  const just = firstFile(dir, JUSTFILES)
  if (just !== null && JUST_TEST.test(readFileSync(join(dir, just), 'utf8'))) {
    return { command: 'just test', rung: `${just} test recipe` }
  }
  const make = firstFile(dir, MAKEFILES)
  if (make !== null && MAKE_TEST.test(readFileSync(join(dir, make), 'utf8'))) {
    return { command: 'make test', rung: `${make} test target` }
  }
  if (packageJsonTest(dir)) {
    return { command: packageManagerTestCommand(dir), rung: 'package.json scripts.test' }
  }
  for (const [file, command] of [
    ['Cargo.toml', 'cargo test'],
    ['go.mod', 'go test ./...'],
    ['build.sbt', 'sbt test'],
  ] as const) {
    if (existsSync(join(dir, file))) return { command, rung: file }
  }
  return null
}
