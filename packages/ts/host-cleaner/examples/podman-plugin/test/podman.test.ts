/**
 * The Podman example, built as the core builds it, on a fake `podman`: the
 * contract suite, the volumes it proposes, and a clean that deletes one only
 * when it is picked and `discard-user-data` is allowed.
 */
import { describe, expect, test } from 'vitest'

import { clean, plan, survey, type Candidate, type RunCtx } from '@osdlc/host-cleaner'
import { pluginKit } from '@osdlc/host-cleaner/plugin'
import {
  contractSuite,
  fakeContext,
  fakeRunner,
  type FakeAnswers,
} from '@osdlc/host-cleaner/testing'

import podman from '../src/index.ts'

const ANON = 'a'.repeat(64)

const LS = 'volume ls --filter dangling=true --format json'

/** `podman volume ls` output for these volumes, created on 1 May 2026. */
const volumes = (...names: string[]): string =>
  JSON.stringify(
    names.map((Name) => ({
      Name,
      Driver: 'local',
      Mountpoint: `/var/lib/containers/storage/volumes/${Name}/_data`,
      CreatedAt: '2026-05-01T09:00:00Z',
      Labels: {},
    })),
  )

/** The plugin on a fake `podman` that answers `answers`, with `keepVolumes` set. */
function build(answers: FakeAnswers, keepVolumes: string[] = []) {
  const fake = fakeRunner({ podman: answers })
  const plugin = podman.create({
    settings: podman.settings.parse({ keepVolumes }),
    env: {},
    kit: pluginKit(podman.name, { ...fake }),
  })
  const ran = () => fake.calls.map((c) => c.argv.join(' '))
  return { plugin, ran }
}

const ctx: RunCtx = { cwd: process.cwd(), targets: [], allow: [] }

describe('the podman example', () => {
  test("keeps the contract, and refuses the suite's outside folder before running anything", async () => {
    const { plugin, ran } = build({ info: {}, [LS]: { stdout: volumes('cache', ANON) } })
    expect(await contractSuite(plugin)).toEqual([])
    // The suite's escaped candidate is a path; a volume is a ref, so delete
    // refuses it and never calls podman volume rm.
    expect(ran().filter((c) => c.startsWith('podman volume rm'))).toEqual([])
  })

  test('proposes each unused volume as a lost ref, but those in keepVolumes', async () => {
    const { plugin } = build({ info: {}, [LS]: { stdout: volumes('pgdata', 'cache', ANON) } }, [
      'pgdata',
    ])
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
    expect(s.candidates.every((c: Candidate) => c.path === undefined)).toBe(true)
    expect(s.objections).toMatchObject([
      {
        by: 'host-cleaner',
        candidate: 'volume:cache',
        level: 'protest',
        code: 'discard-user-data',
      },
      { by: 'host-cleaner', candidate: `volume:${ANON}`, code: 'discard-user-data' },
    ])
  })

  test('a volume runs only when picked and discard-user-data is allowed', async () => {
    const { plugin, ran } = build({
      info: {},
      [LS]: { stdout: volumes('cache') },
      'volume rm cache': { stdout: 'cache\n' },
    })
    const s = await survey([plugin], ctx)

    const unpicked = await clean(plan(s, { allow: ['discard-user-data'] }), [plugin], ctx)
    expect(unpicked.steps).toEqual([])
    const unallowed = await clean(plan(s, { pick: ['volume:cache'] }), [plugin], ctx)
    expect(unallowed.steps).toEqual([])
    expect(unallowed.dropped).toMatchObject([{ id: 'volume:cache', reason: 'not-allowed' }])
    expect(ran()).not.toContain('podman volume rm cache')

    const go = { ...ctx, allow: ['discard-user-data'] }
    const receipt = await clean(
      plan(s, { pick: ['volume:cache'], allow: ['discard-user-data'] }),
      [plugin],
      go,
    )
    expect(receipt.status).toBe('complete')
    expect(receipt.steps).toMatchObject([
      { id: 'volume:cache', result: 'ok', delete: 'removed volume cache' },
    ])
    expect(ran()).toContain('podman volume rm cache')
  })

  test('a volume made again since the plan is dropped as changed, and not removed', async () => {
    let created = '2026-05-01T09:00:00Z'
    const { plugin, ran } = build((argv) => {
      const key = argv.join(' ')
      if (key === 'info') return {}
      if (key === LS) return { stdout: JSON.stringify([{ Name: 'cache', CreatedAt: created }]) }
      return undefined
    })
    const go = { ...ctx, allow: ['discard-user-data'] }
    const p = plan(await survey([plugin], go), {
      pick: ['volume:cache'],
      allow: ['discard-user-data'],
    })
    created = '2026-11-20T12:00:00Z'
    const receipt = await clean(p, [plugin], go)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped).toMatchObject([{ id: 'volume:cache', reason: 'changed' }])
    expect(ran().filter((c) => c.startsWith('podman volume rm'))).toEqual([])
  })

  test('a volume podman refuses to remove fails that step', async () => {
    const { plugin } = build({
      info: {},
      [LS]: { stdout: volumes('cache') },
      'volume rm cache': { exitCode: 2, stderr: 'Error: volume cache is being used\n' },
    })
    const go = { ...ctx, allow: ['discard-user-data'] }
    const p = plan(await survey([plugin], go), {
      pick: ['volume:cache'],
      allow: ['discard-user-data'],
    })
    const receipt = await clean(p, [plugin], go)
    expect(receipt.steps).toMatchObject([{ id: 'volume:cache', result: 'failed' }])
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

  test('is not detected when podman is not on PATH, or podman info fails', async () => {
    const missing = podman.create({
      settings: podman.settings.parse({}),
      env: {},
      kit: pluginKit(podman.name, { ...fakeRunner({}) }),
    })
    expect((await survey([missing], ctx)).plugins).toEqual([])
    const stopped = build({ info: { exitCode: 125, stderr: 'Cannot connect to Podman\n' } })
    expect((await survey([stopped.plugin], ctx)).plugins).toEqual([])
    expect(stopped.ran()).toEqual(['podman info'])
  })

  test('no volumes is no candidates, whether podman prints [] or nothing', async () => {
    for (const stdout of ['[]\n', '']) {
      const { plugin } = build({ info: {}, [LS]: { stdout } })
      const s = await survey([plugin], ctx)
      expect(s.warnings).toEqual([])
      expect(s.candidates).toEqual([])
    }
  })
})
