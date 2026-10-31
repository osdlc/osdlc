/**
 * `cli-tool-stamp-version` and `runMain`'s `--version`.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { captureContext, runMain } from '../src/index.ts'
import { stampVersion, stampVersionMain, versionSource } from '../src/stamp-version.ts'

describe('stampVersion', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stamp-version-'))
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('writes VERSION from package.json, then finds it current', () => {
    expect(stampVersion(dir)).toBe('written')
    const text = readFileSync(join(dir, 'src/version.generated.ts'), 'utf8')
    expect(text).toBe(versionSource('1.2.3'))
    expect(text).toContain("export const VERSION = '1.2.3'")
    expect(stampVersion(dir)).toBe('current')
  })

  test('--check reports a stale file and writes nothing', () => {
    stampVersion(dir)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.3.0' }))
    const lines: string[] = []
    expect(stampVersionMain(['--check'], dir, (l) => lines.push(l))).toBe(1)
    expect(lines.join('\n')).toContain('does not match package.json')
    expect(readFileSync(join(dir, 'src/version.generated.ts'), 'utf8')).toBe(versionSource('1.2.3'))
    expect(stampVersionMain([], dir, (l) => lines.push(l))).toBe(0)
    expect(stampVersionMain(['--check'], dir, (l) => lines.push(l))).toBe(0)
  })

  test('--out writes elsewhere', () => {
    expect(stampVersionMain(['--out', 'src/v.ts'], dir, () => {})).toBe(0)
    expect(readFileSync(join(dir, 'src/v.ts'), 'utf8')).toBe(versionSource('1.2.3'))
  })

  test('an unknown argument, or --out with no path, is a usage error', () => {
    expect(stampVersionMain(['--nope'], dir, () => {})).toBe(2)
    const lines: string[] = []
    expect(stampVersionMain(['--out'], dir, (l) => lines.push(l))).toBe(2)
    expect(lines).toEqual(['cli-tool-stamp-version: --out needs a path'])
  })

  test('a missing package.json or output folder is one line and exit 1', () => {
    const lines: string[] = []
    expect(stampVersionMain(['--out', 'nope/v.ts'], dir, (l) => lines.push(l))).toBe(1)
    rmSync(join(dir, 'package.json'))
    expect(stampVersionMain([], dir, (l) => lines.push(l))).toBe(1)
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.startsWith('cli-tool-stamp-version: '))).toBe(true)
  })

  test('a package.json with no version throws', () => {
    writeFileSync(join(dir, 'package.json'), '{}')
    expect(() => stampVersion(dir)).toThrow(/no "version"/)
  })
})

describe('runMain --version', () => {
  let before: typeof process.exitCode
  beforeEach(() => {
    before = process.exitCode
  })
  afterEach(() => {
    process.exitCode = before ?? 0
  })

  test('prints the version and does not call main', async () => {
    const context = captureContext()
    let called = false
    await runMain(
      () => {
        called = true
        return 1
      },
      { name: 'tooly', context, argv: ['--version'], version: '4.5.6' },
    )
    expect(context.io.out).toBe('tooly 4.5.6\n')
    expect(process.exitCode).toBe(0)
    expect(called).toBe(false)
  })

  test('--version --json prints the version document defineApp prints', async () => {
    const context = captureContext()
    await runMain(() => 1, {
      name: 'tooly',
      context,
      argv: ['--version', '--json'],
      version: '4.5.6',
    })
    expect(JSON.parse(context.io.out)).toEqual({
      schemaVersion: 1,
      kind: 'version',
      name: 'tooly',
      version: '4.5.6',
    })
    expect(process.exitCode).toBe(0)
  })

  test('without a version, --version reaches main', async () => {
    const context = captureContext()
    let seen: readonly string[] = []
    await runMain(
      (argv) => {
        seen = argv
        return 0
      },
      { name: 'tooly', context, argv: ['--version'] },
    )
    expect(seen).toEqual(['--version'])
  })
})
