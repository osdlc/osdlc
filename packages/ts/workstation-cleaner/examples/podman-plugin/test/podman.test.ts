/**
 * The Podman example, built as the core builds it, on a fake `podman`: the
 * contract suite, the volumes it proposes, and a clean that deletes one only
 * when it is picked and `discard-user-data` is allowed.
 */
import { describe, expect, test } from 'vitest'

import {
  HOOK_LIMIT_MS,
  clean,
  plan,
  survey,
  type RunCtx,
  type Survey,
} from '@osdlc/workstation-cleaner'
import { pluginKit } from '@osdlc/workstation-cleaner/plugin'
import {
  contractSuite,
  fakeContext,
  fakeRunner,
  type FakeAnswers,
} from '@osdlc/workstation-cleaner/testing'

import podman from '../src/index.ts'

const ANON = 'a'.repeat(64)

const LS = 'volume ls --filter dangling=true --format json'

/** `podman volume ls` output for these volumes, created at `created`; `ANON` is anonymous. */
const volumes = (names: string[], created = '2026-05-01T09:00:00Z'): string =>
  JSON.stringify(
    names.map((Name) => ({
      Name,
      Driver: 'local',
      Mountpoint: `/var/lib/containers/storage/volumes/${Name}/_data`,
      CreatedAt: created,
      Labels: {},
      ...(Name === ANON ? { Anonymous: true } : {}),
    })),
  )

/** The answers of a reachable `podman` whose `volume ls` prints `stdout`. */
const listing = (stdout: string) => ({ info: {}, [LS]: { stdout } })

/**
 * The plugin with `keepVolumes` set, on a fake `podman` that answers
 * `answers`, or with no `podman` on PATH when `answers` is undefined.
 */
function build(answers: FakeAnswers | undefined, keepVolumes: string[] = []) {
  const fake = fakeRunner(answers === undefined ? {} : { podman: answers })
  const plugin = podman.create({
    settings: podman.settings.parse({ keepVolumes }),
    env: {},
    kit: pluginKit(podman.name, { ...fake }),
  })
  const ran = () => fake.calls.map((c) => c.argv.join(' '))
  const removed = () => ran().filter((c) => c.startsWith('podman volume rm'))
  return { plugin, ran, removed, calls: fake.calls }
}

const ctx: RunCtx = { cwd: process.cwd(), targets: [], allow: [] }
const go: RunCtx = { ...ctx, allow: ['discard-user-data'] }

const picked = (s: Survey) => plan(s, { pick: ['volume:cache'], allow: ['discard-user-data'] })

describe('the podman example', () => {
  test("keeps the contract, and refuses the suite's outside folder before running anything", async () => {
    const { plugin, removed } = build(listing(volumes(['cache', ANON])))
    expect(await contractSuite(plugin)).toEqual([])
    // The suite's escaped candidate is a path; a volume is a ref, so delete
    // refuses it and never calls podman volume rm.
    expect(removed()).toEqual([])
  })

  test('proposes each unused volume as a lost ref, but those in keepVolumes', async () => {
    const { plugin } = build(listing(volumes(['pgdata', 'cache', ANON])), ['pgdata'])
    const s = await survey([plugin], ctx)
    expect(s.warnings).toEqual([])
    expect(s.candidates).toMatchObject([
      {
        id: 'volume:cache',
        ref: 'cache',
        name: 'cache',
        owner: 'podman',
        why: 'no container uses it',
        costDescription: 'lost',
        held: true,
      },
      { id: `volume:${ANON}`, ref: ANON, why: 'an anonymous volume no container uses' },
    ])
    expect(s.candidates.every((c) => c.path === undefined)).toBe(true)
    expect(s.objections).toMatchObject([
      {
        by: 'workstation-cleaner',
        candidate: 'volume:cache',
        level: 'protest',
        code: 'discard-user-data',
      },
      { by: 'workstation-cleaner', candidate: `volume:${ANON}`, code: 'discard-user-data' },
    ])
  })

  test('a volume runs only when picked and discard-user-data is allowed', async () => {
    const { plugin, removed } = build({
      ...listing(volumes(['cache'])),
      'volume rm cache': { stdout: 'cache\n' },
    })
    const s = await survey([plugin], ctx)

    const unpicked = await clean(plan(s, { allow: ['discard-user-data'] }), [plugin], ctx)
    expect(unpicked.steps).toEqual([])
    const unallowed = await clean(plan(s, { pick: ['volume:cache'] }), [plugin], ctx)
    expect(unallowed.steps).toEqual([])
    expect(unallowed.dropped).toMatchObject([{ id: 'volume:cache', reason: 'not-allowed' }])
    expect(removed()).toEqual([])

    const receipt = await clean(picked(s), [plugin], go)
    expect(receipt.status).toBe('complete')
    expect(receipt.steps).toMatchObject([
      { id: 'volume:cache', result: 'ok', delete: 'removed volume cache' },
    ])
    expect(removed()).toEqual(['podman volume rm cache'])
  })

  test('a volume made again since the plan is dropped as changed, and not removed', async () => {
    let created = '2026-05-01T09:00:00Z'
    const { plugin, removed } = build((argv) => {
      const key = argv.join(' ')
      if (key === 'info') return {}
      if (key === LS) return { stdout: volumes(['cache'], created) }
      return undefined
    })
    const p = picked(await survey([plugin], go))
    created = '2026-11-20T12:00:00Z'
    const receipt = await clean(p, [plugin], go)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped).toMatchObject([{ id: 'volume:cache', reason: 'changed' }])
    expect(removed()).toEqual([])
  })

  test('a volume podman refuses to remove fails that step', async () => {
    const { plugin } = build({
      ...listing(volumes(['cache'])),
      'volume rm cache': { exitCode: 2, stderr: 'Error: volume cache is being used\n' },
    })
    const receipt = await clean(picked(await survey([plugin], go)), [plugin], go)
    expect(receipt.status).toBe('failed')
    expect(receipt.steps).toMatchObject([
      {
        id: 'volume:cache',
        result: 'failed',
        delete: null,
        error: expect.stringContaining('volume cache is being used'),
      },
    ])
  })

  test('a volume with no creation time is not proposed, since the re-check could not tell it changed', async () => {
    const listed = [{ Name: 'cache', Driver: 'local' }, ...JSON.parse(volumes(['logs']))]
    const { plugin } = build(listing(JSON.stringify(listed)))
    const s = await survey([plugin], ctx)
    expect(s.warnings).toEqual([])
    expect(s.candidates.map((c) => c.id)).toEqual(['volume:logs'])
  })

  test.each(['0001-01-01T00:00:00Z', 'not a time'])(
    'a volume whose creation time is %s is not proposed either',
    async (created) => {
      const listed = [...JSON.parse(volumes(['cache'], created)), ...JSON.parse(volumes(['logs']))]
      const { plugin } = build(listing(JSON.stringify(listed)))
      const s = await survey([plugin], ctx)
      expect(s.warnings).toEqual([])
      expect(s.candidates.map((c) => c.id)).toEqual(['volume:logs'])
    },
  )

  test('a volume delete would refuse is not proposed', async () => {
    const { plugin } = build(listing(volumes(['-odd', 'logs'])))
    const s = await survey([plugin], ctx)
    expect(s.candidates.map((c) => c.id)).toEqual(['volume:logs'])
  })

  test('a 64-hex-digit name is not called anonymous unless podman says so', async () => {
    const named = 'b'.repeat(64)
    const { plugin } = build(listing(volumes([named])))
    const s = await survey([plugin], ctx)
    expect(s.candidates).toMatchObject([{ id: `volume:${named}`, why: 'no container uses it' }])
  })

  test('delete refuses anything but a volume it could have proposed, and runs nothing', async () => {
    const { plugin, ran } = build({})
    const base = { kind: 'volume', owner: 'podman', why: 'x', evidence: {} }
    await expect(
      plugin.delete!({ ...base, id: 'volume:/tmp/x', path: '/tmp/x' }, fakeContext()),
    ).rejects.toThrow('podman: volume:/tmp/x is not a volume')
    await expect(
      plugin.delete!({ ...base, id: 'volume:--all', ref: '--all' }, fakeContext()),
    ).rejects.toThrow('podman: volume:--all is not a volume')
    expect(ran()).toEqual([])
  })

  test('is not detected when podman is not on PATH, or podman info fails, which it gives as its note', async () => {
    const missing = build(undefined)
    const absent = await survey([missing.plugin], ctx)
    expect(absent.plugins).toEqual([])
    expect(absent.notes).toEqual({})
    const stopped = build({ info: { exitCode: 125, stderr: 'Cannot connect to Podman\n' } })
    const down = await survey([stopped.plugin], ctx)
    expect(down.plugins).toEqual([])
    expect(down.notes).toEqual({ podman: 'podman info failed: Cannot connect to Podman' })
    expect(stopped.ran()).toEqual(['podman info'])
  })

  test('a podman info that never finishes gives why as its note, within a limit under the hook timeout', async () => {
    const hung = build({
      info: { exitCode: 1, neverExited: true, reason: 'timeout', stdout: '', stderr: '' },
    })
    const timedOut = await survey([hung.plugin], ctx)
    expect(timedOut.warnings).toEqual([])
    expect(timedOut.notes).toEqual({ podman: 'podman info failed: did not finish (timeout)' })
    // info must give up before the detect hook does.
    expect(hung.calls[0]?.opts.timeoutMs).toBeLessThan(HOOK_LIMIT_MS)

    const unstartable = build({
      info: { exitCode: 1, neverExited: true, reason: 'spawn', error: 'spawn podman EACCES' },
    })
    const refused = await survey([unstartable.plugin], ctx)
    expect(refused.notes).toEqual({ podman: 'podman info failed: spawn podman EACCES' })

    // A warning printed before it hung is not the reason.
    const warned = build({
      info: {
        exitCode: 1,
        neverExited: true,
        reason: 'timeout',
        stderr: 'WARN[0000] "/run/user/501" is not writable\n',
        error: 'timed out after 5000 ms',
      },
    })
    const late = await survey([warned.plugin], ctx)
    expect(late.notes).toEqual({ podman: 'podman info failed: timed out after 5000 ms' })
  })

  test('the same creation time printed another way is not a change', async () => {
    let created = '2026-05-01T09:00:00.123456789Z'
    const { plugin, removed } = build((argv) => {
      const key = argv.join(' ')
      if (key === 'info') return {}
      if (key === LS) return { stdout: volumes(['cache'], created) }
      if (key === 'volume rm cache') return { stdout: 'cache\n' }
      return undefined
    })
    const p = picked(await survey([plugin], go))
    created = '2026-05-01T11:00:00.123456789+02:00'
    const receipt = await clean(p, [plugin], go)
    expect(receipt.dropped).toEqual([])
    expect(removed()).toEqual(['podman volume rm cache'])
  })

  test('no volumes is no candidates, whether podman prints [], null or nothing', async () => {
    for (const stdout of ['[]\n', 'null\n', '']) {
      const { plugin } = build(listing(stdout))
      const s = await survey([plugin], ctx)
      expect(s.warnings).toEqual([])
      expect(s.candidates).toEqual([])
    }
  })
})
