import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { applyProjectFile } from '../src/project-files.js'
import { cursorAdapter } from '../src/adapters/cursor.js'
import { callAgent } from '../src/run.js'

// A fake `agent`: prints the project file it finds, or runs a hook script.
function fake(script: string) {
  return cursorAdapter({ command: ['/bin/sh', '-c', script, 'sh'] })
}
const SHOW = 'cat .cursor/cli.json'
const spec = (cwd: string) => ({
  prompt: 'x',
  cwd,
  output: { format: 'text' as const },
  permissions: { allowTools: ['Read'], denyTools: ['Bash'] },
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cursor-pf-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('cursor .cursor/cli.json around the call', () => {
  test('writes the rules during the call and removes file and dir after', async () => {
    const result = await callAgent(fake(SHOW), spec(dir))
    expect(JSON.parse(result.raw.stdout)).toEqual({
      permissions: { allow: ['Read(**)'], deny: ['Shell(*)'] },
    })
    expect(await readdir(dir)).toEqual([])
  })

  test('replaces only the permissions key and restores the exact original bytes', async () => {
    await mkdir(join(dir, '.cursor'))
    const original = '{ "editor":{"vimMode":true},\n  "permissions": {"allow":["Shell(ls)"]} }   \n'
    await writeFile(join(dir, '.cursor/cli.json'), original)

    const result = await callAgent(fake(SHOW), spec(dir))
    expect(JSON.parse(result.raw.stdout)).toEqual({
      editor: { vimMode: true },
      permissions: { allow: ['Read(**)'], deny: ['Shell(*)'] },
    })
    expect(await readFile(join(dir, '.cursor/cli.json'), 'utf8')).toBe(original)
    expect(await readdir(join(dir, '.cursor'))).toEqual(['cli.json'])
  })

  test('keeps an existing .cursor dir when only the file was missing', async () => {
    await mkdir(join(dir, '.cursor'))
    await callAgent(fake(SHOW), spec(dir))
    expect(await readdir(join(dir, '.cursor'))).toEqual([])
  })

  test('restores after a failing run and after a timeout', async () => {
    await callAgent(fake('exit 3'), spec(dir))
    expect(await readdir(dir)).toEqual([])
    const result = await callAgent(fake('sleep 5'), { ...spec(dir), timeoutMs: 100 })
    expect(result.error?.reason).toBe('timeout')
    expect(await readdir(dir)).toEqual([])
  })

  test('restores after an abort', async () => {
    const controller = new AbortController()
    const run = callAgent(fake('sleep 5'), spec(dir), { signal: controller.signal })
    setTimeout(() => controller.abort(), 100)
    expect((await run).error?.reason).toBe('timeout')
    expect(await readdir(dir)).toEqual([])
  })

  test('refuses a second call while one is running in the same directory', async () => {
    const first = callAgent(fake('sleep 1'), spec(dir))
    await new Promise((r) => setTimeout(r, 300))
    const second = await callAgent(fake(SHOW), spec(dir))
    expect(second.ok).toBe(false)
    expect(second.error?.reason).toBe('spawn-failed')
    expect(second.error?.detail).toContain('in use by another agent-call run')
    await first
    expect(await readdir(dir)).toEqual([])
  })

  test('takes over a stale lock and restores what the dead run left behind', async () => {
    await mkdir(join(dir, '.cursor'))
    const original = '{"keep":1}\n'
    // A killed run: file holds its rules, lock holds a dead pid and the original.
    await writeFile(join(dir, '.cursor/cli.json'), '{"permissions":{"deny":["Shell(*)"]}}')
    await writeFile(
      join(dir, '.cursor/cli.json.agent-call.lock'),
      JSON.stringify({
        pid: 2 ** 22 + 12345,
        captured: true,
        original: Buffer.from(original).toString('base64'),
        createdDir: null,
      }),
    )
    const result = await callAgent(fake(SHOW), spec(dir))
    expect(JSON.parse(result.raw.stdout)).toEqual({
      keep: 1,
      permissions: { allow: ['Read(**)'], deny: ['Shell(*)'] },
    })
    expect(await readFile(join(dir, '.cursor/cli.json'), 'utf8')).toBe(original)
    expect(await readdir(join(dir, '.cursor'))).toEqual(['cli.json'])
  })

  test('refuses to touch a cli.json that is not a JSON object', async () => {
    await mkdir(join(dir, '.cursor'))
    await writeFile(join(dir, '.cursor/cli.json'), '[1]')
    const result = await callAgent(fake(SHOW), spec(dir))
    expect(result.error?.detail).toContain('not a JSON object')
    expect(await readFile(join(dir, '.cursor/cli.json'), 'utf8')).toBe('[1]')
    expect(await readdir(join(dir, '.cursor'))).toEqual(['cli.json'])
  })

  test('does not create a missing working directory', async () => {
    const missing = join(dir, 'missing')
    const result = await callAgent(fake(SHOW), spec(missing))
    expect(result.error?.detail).toContain('does not exist')
    expect(await readdir(dir)).toEqual([])
  })

  test('keeps an existing permissions.deny and adds the call denies, replacing allow', async () => {
    await mkdir(join(dir, '.cursor'))
    await writeFile(
      join(dir, '.cursor/cli.json'),
      '{"permissions":{"allow":["Shell(ls)"],"deny":["Shell(rm)","Shell(*)"]}}',
    )
    const result = await callAgent(fake(SHOW), spec(dir))
    expect(JSON.parse(result.raw.stdout)).toEqual({
      permissions: { allow: ['Read(**)'], deny: ['Shell(rm)', 'Shell(*)'] },
    })
  })

  test('stale takeover of a dead run that created .cursor leaves no .cursor behind', async () => {
    await mkdir(join(dir, '.cursor'))
    await writeFile(join(dir, '.cursor/cli.json'), '{"permissions":{"deny":["Shell(*)"]}}')
    await writeFile(
      join(dir, '.cursor/cli.json.agent-call.lock'),
      JSON.stringify({
        pid: 2 ** 22 + 12345,
        captured: true,
        original: null,
        createdDir: join(dir, '.cursor'),
      }),
    )
    const result = await callAgent(fake(SHOW), spec(dir))
    expect(result.ok).toBe(true)
    expect(await readdir(dir)).toEqual([])
  })

  test('a failing restore keeps the lock with the original bytes', async () => {
    await mkdir(join(dir, '.cursor'))
    const original = '{"keep":1}\n'
    await writeFile(join(dir, '.cursor/cli.json'), original)
    // The agent swaps cli.json for a directory, so writing the original back fails.
    await callAgent(fake('rm .cursor/cli.json && mkdir .cursor/cli.json'), spec(dir))
    const lock = JSON.parse(await readFile(join(dir, '.cursor/cli.json.agent-call.lock'), 'utf8'))
    expect(Buffer.from(lock.original, 'base64').toString()).toBe(original)
    expect(lock.pid).toBe(process.pid)
  })

  describe('lock that cannot be read', () => {
    const lockPath = () => join(dir, '.cursor/cli.json.agent-call.lock')
    beforeEach(async () => {
      await mkdir(join(dir, '.cursor'))
      await writeFile(lockPath(), '')
    })

    test('a fresh empty lock is refused', async () => {
      const result = await callAgent(fake(SHOW), spec(dir))
      expect(result.error?.reason).toBe('spawn-failed')
      expect(result.error?.detail).toContain('in use by another agent-call run')
      expect(await readdir(join(dir, '.cursor'))).toEqual(['cli.json.agent-call.lock'])
    })

    test('an empty lock older than 10 s is taken over', async () => {
      const old = new Date(Date.now() - 60_000)
      await utimes(lockPath(), old, old)
      const result = await callAgent(fake(SHOW), spec(dir))
      expect(result.ok).toBe(true)
      expect(await readdir(join(dir, '.cursor'))).toEqual([])
    })
  })

  test('concurrent takeover of one stale lock: every call wins or is refused, original ends restored', async () => {
    await mkdir(join(dir, '.cursor'))
    const original = '{"keep":1}\n'
    await writeFile(join(dir, '.cursor/cli.json'), '{"permissions":{}}')
    await writeFile(
      join(dir, '.cursor/cli.json.agent-call.lock'),
      JSON.stringify({
        pid: 2 ** 22 + 12345,
        captured: true,
        original: Buffer.from(original).toString('base64'),
        createdDir: null,
      }),
    )
    const edit = {
      path: '.cursor/cli.json',
      key: 'permissions',
      value: { allow: [], deny: [] },
      preview: '',
    }
    // The interleaving is not deterministic, and all callers share one pid here,
    // so this checks the invariants rather than a single winner: every call
    // either holds the file or is refused (a loser can briefly see the winner's
    // half-written file), and releasing leaves the original.
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => applyProjectFile(dir, edit)),
    )
    const won = results.filter((r) => r.status === 'fulfilled')
    expect(won.length).toBeGreaterThanOrEqual(1)
    for (const r of results) {
      if (r.status === 'rejected')
        expect(String(r.reason)).toMatch(/in use|take over|not a JSON object/)
    }
    for (const r of won) await (r as PromiseFulfilledResult<() => Promise<void>>).value()
    expect(await readFile(join(dir, '.cursor/cli.json'), 'utf8')).toBe(original)
    expect(await readdir(join(dir, '.cursor'))).toEqual(['cli.json'])
  })
})
