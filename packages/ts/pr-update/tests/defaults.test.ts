/** The standalone `Ports` built from a `PrUpdateConfig`. */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { prUpdateConfigSchema, prUpdateStandaloneSchema } from '../src/config.ts'
import { commandRepair, standalonePorts } from '../src/defaults.ts'
import { listAttempts } from '../src/update/attempts.ts'
import type { RepairRequest } from '../src/ports.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pr-update-repair-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const request = (): RepairRequest => ({
  kind: 'conflict',
  pr: 7,
  base: 'main',
  head: 'topic',
  worktree: dir,
  paths: ['a.ts', 'b.ts'],
  reason: 'unclaimed conflicts',
})

describe('commandRepair', () => {
  test('runs in the worktree with the request on stdin and in the environment', async () => {
    const repair = commandRepair('cat > req.json; echo "$PR_UPDATE_KIND #$PR_UPDATE_PR"')
    expect(await repair(request())).toEqual({ ok: true, note: 'conflict #7' })
    expect(JSON.parse(readFileSync(join(dir, 'req.json'), 'utf8'))).toEqual(request())
  })

  test('a non-zero exit is a failed repair, with its last line as the note', async () => {
    const repair = commandRepair('echo trying; echo "cannot fix" >&2; exit 3')
    expect(await repair(request())).toEqual({ ok: false, note: 'trying' })
  })
})

describe('commandRepair timeout', () => {
  test('a command past repair.timeout_seconds is killed and reads as giving up', async () => {
    const repair = commandRepair('sleep 30', 1)
    const res = await repair(request())
    expect(res.ok).toBe(false)
  })
})

describe('standalonePorts', () => {
  test('no repair without a command', () => {
    expect(standalonePorts(prUpdateConfigSchema.parse({})).repair).toBeUndefined()
  })

  test('a configured command becomes the repair port', () => {
    const cfg = prUpdateConfigSchema.parse({ repair: { command: 'true' } })
    expect(cfg.repair.on).toEqual(['conflict'])
    expect(typeof standalonePorts(cfg).repair).toBe('function')
  })

  test('the attempts store is wired only with a project root', () => {
    const cfg = prUpdateConfigSchema.parse({})
    expect(standalonePorts(cfg).attempts).toBeUndefined()
    const { attempts } = standalonePorts(cfg, dir)
    const key = { repo: 'o/r', head: 'h', headOid: '1', base: 'main', baseOid: '2' }
    attempts!.recordFailure(key, 'boom')
    expect(listAttempts(join(dir, '.pr-update', 'attempts'))).toHaveLength(1)
  })

  test('verify: test runs test_command', async () => {
    const cfg = prUpdateStandaloneSchema.parse({ verify: 'test', test_command: 'make test' })
    expect(await standalonePorts(cfg).resolveVerifyVerbs({ which: 'test', trust: false })).toEqual([
      'make test',
    ])
  })

  test.each([undefined, null])('verify: test with test_command %p fails loudly', async (cmd) => {
    const cfg = prUpdateStandaloneSchema.parse({ verify: 'test', test_command: cmd })
    await expect(
      standalonePorts(cfg).resolveVerifyVerbs({ which: 'test', trust: false }),
    ).rejects.toThrow('verify: test needs test_command')
  })

  test('verify: check fails loudly even with test_command set', async () => {
    const cfg = prUpdateStandaloneSchema.parse({ verify: 'check', test_command: 'make test' })
    await expect(
      standalonePorts(cfg).resolveVerifyVerbs({ which: 'check', trust: false }),
    ).rejects.toThrow('verify: check has no meaning in a standalone run')
  })
})
