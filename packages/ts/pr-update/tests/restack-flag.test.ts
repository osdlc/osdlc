import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'

import { main } from '../src/cli.ts'
import { fakeTools, isolatedEnv } from './support.ts'

const seen = vi.hoisted(() => ({ args: [] as Record<string, unknown>[] }))

vi.mock('../src/update.ts', async (original) => ({
  ...(await original<typeof import('../src/update.ts')>()),
  runUpdate: vi.fn(async (args: Record<string, unknown>) => {
    seen.args.push(args)
    return { results: [], skipped: [], notFound: [] }
  }),
}))

describe('pr-update update --restack / --no-restack', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pr-update-restack-'))
  afterAll(() => rmSync(cwd, { recursive: true, force: true }))
  beforeEach(() => {
    seen.args = []
  })

  async function run(...flags: string[]): Promise<Record<string, unknown>> {
    const ctx = captureContext({ cwd, env: isolatedEnv(cwd) })
    await main(['update', '--repo', 'o/r', ...flags], ctx, fakeTools)
    expect(seen.args).toHaveLength(1)
    return seen.args[0]!
  }

  test('--no-restack reaches runUpdate as restack: false', async () => {
    expect((await run('--no-restack')).restack).toBe(false)
  })

  test('--restack reaches runUpdate as restack: true', async () => {
    expect((await run('--restack')).restack).toBe(true)
  })

  test('no flag sends no restack key', async () => {
    expect(await run()).not.toHaveProperty('restack')
  })

  test('--keep-failed reaches runUpdate as keepFailed: true', async () => {
    expect((await run('--keep-failed')).keepFailed).toBe(true)
  })

  test('--no-keep-failed reaches it as false, and no flag sends no key', async () => {
    expect((await run('--no-keep-failed')).keepFailed).toBe(false)
  })

  test('--discard-kept reaches runUpdate', async () => {
    const args = await run('--discard-kept')
    expect(args.discardKept).toBe(true)
    expect(args).not.toHaveProperty('keepFailed')
  })
})
