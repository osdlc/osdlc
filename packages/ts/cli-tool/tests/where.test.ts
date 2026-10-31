/**
 * `runMain` answers `--where` without devlink: the running file, the install
 * or package it belongs to, a compiled binary, and `--json`.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { captureContext, runMain, type RunMainOptions } from '../src/index.ts'

let root: string
let before: typeof process.exitCode
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'where-')))
  before = process.exitCode
})
afterEach(() => {
  process.exitCode = before ?? 0
  rmSync(root, { recursive: true, force: true })
})

/** `<dir>/package.json` and `<dir>/bin/tool.js`; returns the script. */
function seedPackage(dir: string): string {
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{}\n')
  writeFileSync(join(dir, 'bin', 'tool.js'), '// bin\n')
  return join(dir, 'bin', 'tool.js')
}

async function where(argv: string[], options: Partial<RunMainOptions>) {
  const context = captureContext({ cwd: root, env: {} })
  let called = false
  await runMain(
    () => {
      called = true
      return 0
    },
    { name: 'tool', context, argv, ...options },
  )
  return { out: context.io.out, called }
}

describe('runMain --where without devlink', () => {
  test('a package outside node_modules: its nearest package.json, and main is not called', async () => {
    const script = seedPackage(join(root, 'src-tree'))
    const r = await where(['--where'], { version: '1.2.3', script })
    expect(r.called).toBe(false)
    expect(process.exitCode).toBe(0)
    expect(r.out).toBe(
      `tool 1.2.3\nfile      ${script}\nfrom      package ${join(root, 'src-tree')} (not in node_modules)\n`,
    )
  })

  test('an install: the package dir under the last node_modules, scoped', async () => {
    const pkg = join(root, 'node_modules', '.pnpm', 'x@1', 'node_modules', '@acme', 'tool')
    const script = seedPackage(pkg)
    const r = await where(['--where'], { script })
    expect(r.out).toBe(`tool\nfile      ${script}\nfrom      install ${pkg}\n`)
  })

  test('the file is the realpath of the script', async () => {
    const pkg = join(root, 'node_modules', 'tool')
    const script = seedPackage(pkg)
    const link = join(root, 'tool-link.js')
    symlinkSync(script, link)
    const r = await where(['--where'], { script: link })
    expect(r.out).toContain(`file      ${script}\n`)
    expect(r.out).toContain(`from      install ${pkg}\n`)
  })

  test('a bun-compiled binary reports the binary, not its virtual script', async () => {
    const exe = join(root, 'dist', 'tool')
    mkdirSync(join(root, 'dist'))
    writeFileSync(exe, '')
    for (const script of ['/$bunfs/root/tool', 'B:/~BUN/root/tool']) {
      const r = await where(['--where'], { script, execPath: exe })
      expect(r.out).toBe(
        `tool\nfile      ${exe} (compiled binary)\nfrom      unknown (no package.json above the file)\n`,
      )
    }
  })

  test('--json prints the same facts as one object', async () => {
    const script = seedPackage(join(root, 'node_modules', 'tool'))
    const r = await where(['--where', '--json'], { version: '1.2.3', script })
    expect(r.called).toBe(false)
    expect(JSON.parse(r.out)).toEqual({
      name: 'tool',
      version: '1.2.3',
      file: script,
      compiled: false,
      from: { kind: 'install', path: join(root, 'node_modules', 'tool') },
      chosenBy: null,
    })
  })

  test('a custom hook without describe leaves the chosen by line out', async () => {
    const script = seedPackage(join(root, 'node_modules', 'tool'))
    const r = await where(['--where'], { script, devlink: () => null })
    expect(r.out).not.toContain('chosen by')
  })

  test('--where after another argument goes to main', async () => {
    const r = await where(['list', '--where'], { script: seedPackage(root) })
    expect(r.called).toBe(true)
  })
})
