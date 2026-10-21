/**
 * `resolveConfigFile`: the one decision about where a tool's project config
 * file and its overlay are.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ConfigInvalidError } from '../config-error.ts'
import { overlayPath, resolveConfigFile } from '../resolve-file.ts'

import { CONFIG_FILE } from './support.ts'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'resolve-file-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function touch(rel: string): string {
  const path = join(root, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '')
  return path
}

describe('overlayPath', () => {
  test('the overlay of tools/tooly.yaml is tools/tooly.local.yaml', () => {
    expect(overlayPath('tools/tooly.yaml')).toBe(join('tools', 'tooly.local.yaml'))
  })

  test('the overlay of cfg.yml is cfg.local.yml', () => {
    expect(overlayPath('cfg.yml')).toBe('cfg.local.yml')
  })

  test('only the last extension moves, and a file with none gains .local', () => {
    expect(overlayPath('a.b.yaml')).toBe('a.b.local.yaml')
    expect(overlayPath('cfg')).toBe('cfg.local')
  })
})

describe('resolveConfigFile', () => {
  test('without the variable the pair is tooly.yaml and tooly.local.yaml under the root', () => {
    expect(resolveConfigFile(root, { ...CONFIG_FILE, env: {} })).toEqual({
      project: join(root, 'tooly.yaml'),
      local: join(root, 'tooly.local.yaml'),
      source: 'default',
    })
  })

  test('an absent default file is not an error', () => {
    expect(() => resolveConfigFile(root, { ...CONFIG_FILE, env: {} })).not.toThrow()
  })

  test('an empty variable counts as unset', () => {
    expect(
      resolveConfigFile(root, { ...CONFIG_FILE, env: { [CONFIG_FILE.envVar]: '' } }).source,
    ).toBe('default')
  })

  test('the variable replaces the root pair with the file it names and that file overlay', () => {
    const file = touch('tools/tooly.yaml')
    touch('tooly.yaml')
    expect(
      resolveConfigFile(root, { ...CONFIG_FILE, env: { [CONFIG_FILE.envVar]: file } }),
    ).toEqual({
      project: file,
      local: join(root, 'tools', 'tooly.local.yaml'),
      source: 'env',
    })
  })

  test('cfg.yml pairs with cfg.local.yml', () => {
    const file = touch('cfg.yml')
    expect(
      resolveConfigFile(root, { ...CONFIG_FILE, env: { [CONFIG_FILE.envVar]: file } }).local,
    ).toBe(join(root, 'cfg.local.yml'))
  })

  test('a relative path resolves against the injected startup directory and prints absolute', () => {
    touch('tools/tooly.yaml')
    const got = resolveConfigFile('/elsewhere', {
      ...CONFIG_FILE,
      env: { [CONFIG_FILE.envVar]: 'tools/tooly.yaml' },
      cwd: root,
    })
    expect(got.project).toBe(join(root, 'tools', 'tooly.yaml'))
    expect(got.local).toBe(join(root, 'tools', 'tooly.local.yaml'))
  })

  test('a variable naming a missing file is an error that names the path', () => {
    const missing = join(root, 'nope.yaml')
    try {
      resolveConfigFile(root, { ...CONFIG_FILE, env: { [CONFIG_FILE.envVar]: missing } })
      throw new Error('expected a throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigInvalidError)
      expect((e as ConfigInvalidError).message).toContain(missing)
      expect((e as ConfigInvalidError).exitCode).toBe(14)
    }
  })

  test('a variable naming a directory is an error too', () => {
    mkdirSync(join(root, 'dir'))
    expect(() =>
      resolveConfigFile(root, { ...CONFIG_FILE, env: { [CONFIG_FILE.envVar]: join(root, 'dir') } }),
    ).toThrow(ConfigInvalidError)
  })

  test('a subtree always resolves to its own default pair, whatever the variable says', () => {
    const file = touch('elsewhere.yaml')
    const sub = join(root, 'pkg')
    expect(
      resolveConfigFile(sub, {
        ...CONFIG_FILE,
        env: { [CONFIG_FILE.envVar]: file },
        scope: 'subtree',
      }),
    ).toEqual({
      project: join(sub, 'tooly.yaml'),
      local: join(sub, 'tooly.local.yaml'),
      source: 'default',
    })
  })

  test('the file name and variable are the tool to choose', () => {
    const file = touch('x.toml')
    expect(
      resolveConfigFile(root, { name: 'tool.yaml', envVar: 'TOOL_CONFIG', env: {} }).project,
    ).toBe(join(root, 'tool.yaml'))
    expect(
      resolveConfigFile(root, {
        name: 'tool.yaml',
        envVar: 'TOOL_CONFIG',
        env: { TOOL_CONFIG: file },
      }).source,
    ).toBe('env')
  })
})
