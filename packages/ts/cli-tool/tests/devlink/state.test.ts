import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as dirsModule from '@osdlc/config-layers/dirs'
import { testRoot } from '@osdlc/tiered-dirs'
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'

import { resolve } from '../../src/devlink/resolve.ts'
import type { ToolSpec } from '../../src/devlink/spec.ts'
import {
  appendHistory,
  homePath,
  readActive,
  stateDir,
  writeActive,
} from '../../src/devlink/state.ts'
import { SPEC, sandbox, type Sandbox } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

describe('readActive on an unreadable state path', () => {
  test('a directory named home reads as no link and resolve() still answers', () => {
    mkdirSync(homePath(SPEC, { dirs: sb.dirs }), { recursive: true }) // EISDIR
    expect(readActive(SPEC, { dirs: sb.dirs })).toBeNull()
    expect(resolve(SPEC, { dirs: sb.dirs, env: {}, cwd: sb.root }).source).toBe('local')
  })

  test('a file where the state directory should be reads as no link', () => {
    mkdirSync(dirname(sb.stateDir), { recursive: true })
    writeFileSync(sb.stateDir, 'not a directory') // ENOTDIR
    expect(readActive(SPEC, { dirs: sb.dirs })).toBeNull()
  })
})

describe('writeActive', () => {
  test('replaces the file whole and leaves no temp file behind', () => {
    writeActive(SPEC, '/one', { dirs: sb.dirs })
    const before = statSync(homePath(SPEC, { dirs: sb.dirs })).ino
    writeActive(SPEC, '/two', { dirs: sb.dirs })
    expect(readActive(SPEC, { dirs: sb.dirs })).toBe('/two')
    // A rename swaps the inode; an in-place truncate-and-write keeps it.
    expect(statSync(homePath(SPEC, { dirs: sb.dirs })).ino).not.toBe(before)
    expect(readdirSync(sb.stateDir)).toEqual(['home'])
    rmSync(sb.stateDir, { recursive: true })
  })
})

describe('a spec stateDir', () => {
  const STATE_SPEC: ToolSpec = { ...SPEC, stateDir: '~/.tooly' }

  /** The process environment with HOME at the sandbox's, so no test root applies. */
  function stubEnv(env: Record<string, string> = {}): void {
    vi.stubEnv('HOME', sb.home)
    for (const name of ['TOOLY_CONFIG_DIR', 'TOOLY_ROOT', 'TOOLY_REQUIRE_OVERRIDE']) {
      vi.stubEnv(name, env[name] ?? '')
    }
  }
  afterEach(() => vi.unstubAllEnvs())

  test('is the state directory under the home, with no name appended', () => {
    stubEnv()
    expect(stateDir(STATE_SPEC)).toBe(join(sb.home, '.tooly'))
    expect(stateDir({ ...SPEC, stateDir: '~/.local/share/tooly-link' })).toBe(
      join(sb.home, '.local', 'share', 'tooly-link'),
    )
  })

  test('holds the link and the history', () => {
    stubEnv()
    writeActive(STATE_SPEC, '/one')
    appendHistory(STATE_SPEC, { at: '2026-11-05T00:00:00Z', event: 'link', checkout: '/one' })
    expect(readActive(STATE_SPEC)).toBe('/one')
    expect(readdirSync(join(sb.home, '.tooly')).sort()).toEqual(['history.jsonl', 'home'])
    expect(readActive(SPEC)).toBeNull()
  })

  test('gives way to the config and root variables', () => {
    stubEnv({ TOOLY_CONFIG_DIR: join(sb.root, 'cfg'), TOOLY_ROOT: join(sb.root, 'root') })
    expect(stateDir(STATE_SPEC)).toBe(join(sb.root, 'cfg', 'tooly'))
    stubEnv({ TOOLY_ROOT: join(sb.root, 'root') })
    expect(stateDir(STATE_SPEC)).toBe(join(sb.root, 'root', 'config', 'tooly'))
  })

  test('a relative override still throws, and reads as no link', () => {
    stubEnv({ TOOLY_CONFIG_DIR: 'rel' })
    expect(() => stateDir(STATE_SPEC)).toThrow(/TOOLY_CONFIG_DIR must be an absolute path/)
    expect(readActive(STATE_SPEC)).toBeNull()
  })

  test('TOOLY_REQUIRE_OVERRIDE still refuses a fall back to the home', () => {
    stubEnv({ TOOLY_REQUIRE_OVERRIDE: '1' })
    expect(() => stateDir(STATE_SPEC)).toThrow(/TOOLY_REQUIRE_OVERRIDE is set/)
  })

  test('injected dirs win over it', () => {
    expect(stateDir(STATE_SPEC, { dirs: sb.dirs })).toBe(sb.stateDir)
  })

  test('a bad value throws before anything is resolved', () => {
    expect(() => stateDir({ ...SPEC, stateDir: '.tooly' })).toThrow(/stateDir/)
  })

  // A test runner is detected by its entry point, so this holds only in a Vitest worker.
  test.runIf(testRoot() !== undefined)('in a test runner, the test root wins over it', () => {
    vi.stubEnv('HOME', userInfo().homedir)
    vi.stubEnv('TOOLY_CONFIG_DIR', '')
    vi.stubEnv('TOOLY_ROOT', '')
    const dir = stateDir(STATE_SPEC)
    expect(dir).toBe(stateDir(SPEC))
    expect(dir.startsWith(tmpdir())).toBe(true)
  })

  test.runIf(testRoot() !== undefined)(
    'in a test runner, the test root wins even under TOOLY_REQUIRE_OVERRIDE',
    () => {
      vi.stubEnv('HOME', userInfo().homedir)
      vi.stubEnv('TOOLY_CONFIG_DIR', '')
      vi.stubEnv('TOOLY_ROOT', '')
      vi.stubEnv('TOOLY_REQUIRE_OVERRIDE', '1')
      expect(stateDir(STATE_SPEC)).toBe(stateDir(SPEC))
    },
  )
})

test('state is resolved under the xdg convention', () => {
  const seen: unknown[] = []
  const spy = vi.spyOn(dirsModule, 'systemDirs').mockImplementation((vendor, opts) => {
    seen.push(opts)
    return sb.dirs
  })
  try {
    expect(stateDir(SPEC)).toBe(sb.stateDir)
    expect(seen).toEqual([{ convention: 'xdg', conventionFromEnv: false }])
  } finally {
    spy.mockRestore()
  }
})
