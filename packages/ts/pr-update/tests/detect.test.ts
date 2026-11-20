/** The `verify: detect` ladder, against files on disk. */

import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { detectVerifyCommand } from '../src/detect.ts'
import { prUpdateStandaloneSchema } from '../src/config.ts'
import { standalonePorts } from '../src/defaults.ts'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pr-update-detect-'))
  dirs.push(dir)
})

function put(name: string, body = ''): void {
  writeFileSync(join(dir, name), body)
}

const pkg = (test: string | undefined): string =>
  JSON.stringify({ scripts: test === undefined ? {} : { test } })

describe('detectVerifyCommand', () => {
  test('nothing recognisable detects nothing', () => {
    put('README.md', '# hi\n')
    expect(detectVerifyCommand(dir)).toBeNull()
  })

  test('the configured test_command is the first rung, over every file', () => {
    put('justfile', 'test:\n  just-it\n')
    expect(detectVerifyCommand(dir, 'make check')).toEqual({
      command: 'make check',
      rung: 'test_command',
    })
  })

  test('test ::= and test :::= are assignments, not a target', () => {
    put('Makefile', 'test ::= 1\ntest :::= 2\n')
    expect(detectVerifyCommand(dir)).toBeNull()
  })

  test('a blank test_command is not a rung', () => {
    put('Cargo.toml')
    expect(detectVerifyCommand(dir, '  ')?.rung).toBe('Cargo.toml')
  })

  test('a justfile test recipe comes before a Makefile and package.json', () => {
    put('justfile', 'build:\n  x\n\ntest *args:\n  y\n')
    put('Makefile', 'test:\n\tz\n')
    put('package.json', pkg('vitest'))
    expect(detectVerifyCommand(dir)?.command).toBe('just test')
  })

  test.each([['test-all:\n\tx\n'], ['test := yes\n'], ['  test:\n\tx\n'], ['.PHONY: test\n']])(
    'a Makefile that only looks like it has a test target (%j) does not match',
    (body) => {
      put('Makefile', body)
      expect(detectVerifyCommand(dir)).toBeNull()
    },
  )

  test.each(["test filter='':", "test target='all':", '@test:'])(
    'a justfile recipe %j with a default value or quiet marker is a test recipe',
    (header) => {
      put('justfile', `${header}\n  x\n`)
      expect(detectVerifyCommand(dir)?.command).toBe('just test')
    },
  )

  test('a Makefile test target runs make test', () => {
    put('Makefile', 'all:\n\tx\n\ntest: all\n\ty\n')
    const found = detectVerifyCommand(dir)
    expect(found?.command).toBe('make test')
    // A case-insensitive filesystem finds `makefile` first.
    expect(found?.rung).toMatch(/^[Mm]akefile test target$/)
  })

  test.each([
    ['pnpm-lock.yaml', 'pnpm test'],
    ['yarn.lock', 'yarn test'],
    ['bun.lock', 'bun run test'],
    ['package-lock.json', 'npm test'],
    [null, 'npm test'],
  ])('scripts.test runs with the package manager of %s', (lockfile, command) => {
    put('package.json', pkg('vitest run'))
    if (lockfile !== null) put(lockfile)
    expect(detectVerifyCommand(dir)).toEqual({ command, rung: 'package.json scripts.test' })
  })

  test.each([
    ['no scripts.test', pkg(undefined)],
    ['the npm init placeholder', pkg('echo "Error: no test specified" && exit 1')],
    ['an empty script', pkg('  ')],
    ['unreadable JSON', '{'],
  ])('package.json with %s is not a rung', (_why, body) => {
    put('package.json', body)
    expect(detectVerifyCommand(dir)).toBeNull()
  })

  test.each([
    ['Cargo.toml', 'cargo test'],
    ['go.mod', 'go test ./...'],
    ['build.sbt', 'sbt test'],
  ])('%s runs %s', (file, command) => {
    put(file)
    expect(detectVerifyCommand(dir)).toEqual({ command, rung: file })
  })

  test('package.json comes before the language rungs', () => {
    put('package.json', pkg('vitest'))
    put('Cargo.toml')
    expect(detectVerifyCommand(dir)?.command).toBe('npm test')
  })
})

describe('verify: detect through the standalone ports', () => {
  const request = () => ({ which: 'detect' as const, trust: true, repo: 'o/r', checkout: dir })

  test('prints the rung it used and returns its command', async () => {
    put('Cargo.toml')
    const lines: string[] = []
    const cfg = prUpdateStandaloneSchema.parse({ verify: 'detect' })
    const verbs = await standalonePorts(cfg, undefined, 'origin', (l) =>
      lines.push(l),
    ).resolveVerifyVerbs(request())
    expect(verbs).toEqual(['cargo test'])
    expect(lines).toEqual(['verify: detect o/r: cargo test  (Cargo.toml)'])
  })

  test('with no rung matching it fails, naming what it looked for', async () => {
    const cfg = prUpdateStandaloneSchema.parse({ verify: 'detect' })
    await expect(standalonePorts(cfg).resolveVerifyVerbs(request())).rejects.toThrow(
      /verify: detect found no test command in o\/r's update worktree \(looked for test_command, a `test` target/,
    )
  })

  test('a configured test_command is used and still announced', async () => {
    const lines: string[] = []
    const cfg = prUpdateStandaloneSchema.parse({ verify: 'detect', test_command: 'make t' })
    const verbs = await standalonePorts(cfg, undefined, 'origin', (l) =>
      lines.push(l),
    ).resolveVerifyVerbs(request())
    expect(verbs).toEqual(['make t'])
    expect(lines).toEqual(['verify: detect o/r: make t  (test_command)'])
  })
})
