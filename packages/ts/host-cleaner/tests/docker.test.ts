/** The `docker` plugin over a fake `docker` CLI: what it proposes, what the core makes of it, and how Docker is asked to delete it. */

import { afterEach, describe, expect, test } from 'vitest'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  BUILT_IN_PLUGINS,
  DISCARD_USER_DATA,
  DOCKER_BUILD_CACHE,
  DOCKER_IMAGE,
  DOCKER_VOLUME,
  clean,
  dockerPlugin,
  plan,
  pluginKit,
  survey,
  type Candidate,
  type RunCtx,
} from '../src/index.ts'
import {
  composeProject,
  dockerBytes,
  dockerDefinition,
  jsonLines,
  reclaimable,
} from '../src/docker.ts'
import { contractSuite, fakeContext, fakeRunner, tempHome } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const OLD = 'sha256:' + 'a'.repeat(64)
const USED = 'sha256:' + 'b'.repeat(64)
const CONTAINER = 'c'.repeat(64)

interface Machine {
  running?: boolean
  volumes?: Array<{ Name: string; Driver?: string; Labels?: string }>
  images?: Array<{ ID: string; Size?: string; CreatedAt?: string }>
  /** Each container's image id. */
  containers?: Record<string, string>
  /** Containers `container ls` lists but that are removed before `container inspect`. */
  gone?: string[]
  /** What `docker builder du` prints; null: buildx is missing; `{ fails }`: it fails with that message. */
  du?: string | null | { fails: string }
  /** Volumes `docker volume rm` refuses, as Docker does one a container took up. */
  inUse?: string[]
}

const DU =
  'ID\tRECLAIMABLE\tSIZE\tLAST ACCESSED\nabc\ttrue\t1.5GB\t2 weeks ago\nShared:\t\t0B\nPrivate:\t1.5GB\nReclaimable:\t1.5GB\nTotal:\t\t1.5GB\n'

/** A fake `docker` CLI over `m`, and the plugin on a kit that runs it. */
function fakeDocker(m: Machine = {}, keepVolumes: string[] = []) {
  const volumes = m.volumes ?? [
    { Name: 'pgdata', Driver: 'local', Labels: 'com.docker.compose.project=shop' },
  ]
  const images = m.images ?? [
    { ID: OLD, Size: '120MB', CreatedAt: '2026-01-01 00:00:00 +0000 UTC' },
    { ID: USED, Size: '1.2GB', CreatedAt: '2026-02-01 00:00:00 +0000 UTC' },
  ]
  const containers = m.containers ?? { [CONTAINER]: USED }
  const json = (rows: object[]) => ({ stdout: rows.map((r) => JSON.stringify(r) + '\n').join('') })
  const fake = fakeRunner({
    docker: (argv) => {
      const cmd = argv.join(' ')
      if (cmd === 'info --format {{.ServerVersion}}') {
        return m.running === false
          ? {
              exitCode: 1,
              stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock\n',
            }
          : { stdout: '29.0.0\n' }
      }
      if (cmd === 'volume ls --filter dangling=true --format {{json .}}') return json(volumes)
      if (cmd === 'image ls --filter dangling=true --no-trunc --format {{json .}}')
        return json(images)
      if (cmd === 'container ls --all --quiet --no-trunc') {
        return {
          stdout: [...Object.keys(containers), ...(m.gone ?? [])].map((id) => `${id}\n`).join(''),
        }
      }
      if (argv[0] === 'container' && argv[1] === 'inspect' && argv[3] === '{{.Image}}') {
        const asked = argv.slice(4)
        const gone = asked.filter((id) => !(id in containers))
        return {
          ...(gone.length === 0 ? {} : { exitCode: 1 }),
          stdout: asked
            .filter((id) => id in containers)
            .map((id) => `${containers[id]}\n`)
            .join(''),
          stderr: gone.map((id) => `Error response from daemon: No such container: ${id}\n`).join(''),
        }
      }
      if (cmd === 'builder du') {
        if (m.du === null)
          return { exitCode: 1, stderr: "docker: 'builder du' is not a docker command.\n" }
        if (typeof m.du === 'object') return { exitCode: 1, stderr: `${m.du.fails}\n` }
        return { stdout: m.du ?? DU }
      }
      if (argv[0] === 'volume' && argv[1] === 'rm') {
        return m.inUse?.includes(argv[3]!) === true
          ? {
              exitCode: 1,
              stderr: `Error response from daemon: remove ${argv[3]}: volume is in use\n`,
            }
          : { stdout: `${argv[3]}\n` }
      }
      if (argv[0] === 'image' && argv[1] === 'rm') return { stdout: `Deleted: ${argv[3]}\n` }
      if (cmd === 'builder prune --all --force')
        return { stdout: 'ID\tRECLAIMABLE\tSIZE\nabc\ttrue\t1.5GB\nTotal:\t1.5GB\n' }
      return undefined
    },
  })
  const plugin = dockerPlugin({ keepVolumes }, pluginKit('docker', { ...fake }))
  const ran = () => fake.calls.map((c) => c.argv.slice(1).join(' '))
  return { plugin, calls: fake.calls, ran }
}

const ctx: RunCtx = { cwd: '/', targets: [], allow: [] }
const ids = (cs: readonly Candidate[]) => cs.map((c) => c.id)

describe('discover', () => {
  test('a dangling volume, a dangling image no container uses, and the reclaimable build cache; never an image in use', async () => {
    const { plugin } = fakeDocker()
    const s = await survey([plugin], ctx)
    expect(s.warnings).toEqual([])
    expect(ids(s.candidates)).toEqual([
      `${DOCKER_VOLUME}:pgdata`,
      `${DOCKER_IMAGE}:${OLD}`,
      `${DOCKER_BUILD_CACHE}:reclaimable`,
    ])
    expect(ids(s.candidates)).not.toContain(`${DOCKER_IMAGE}:${USED}`)
    const [volume, image, cache] = s.candidates
    expect(volume).toMatchObject({
      ref: 'pgdata',
      name: 'pgdata',
      costDescription: 'lost',
      held: true,
      why: 'no container uses this volume of compose project shop',
      evidence: { kind: DOCKER_VOLUME, name: 'pgdata', driver: 'local' },
    })
    expect(image).toMatchObject({ ref: OLD, bytes: 120_000_000, costDescription: 're-download' })
    expect(image!.held).toBeUndefined()
    expect(cache).toMatchObject({
      bytes: 1_500_000_000,
      costDescription: 're-download',
      evidence: { kind: DOCKER_BUILD_CACHE },
    })
  })

  test('a stopped container keeps its dangling image out too', async () => {
    // `container ls --all` lists stopped containers, and `image rm` refuses an image one of them uses.
    const { plugin, ran } = fakeDocker({ images: [{ ID: OLD }], containers: { [CONTAINER]: OLD } })
    const s = await survey([plugin], ctx)
    expect(ids(s.candidates)).not.toContain(`${DOCKER_IMAGE}:${OLD}`)
    expect(ran()).toContain('container ls --all --quiet --no-trunc')
  })

  test('keepVolumes leaves those volumes out', async () => {
    const { plugin } = fakeDocker({ volumes: [{ Name: 'pgdata' }, { Name: 'scratch' }] }, [
      'pgdata',
    ])
    const s = await survey([plugin], ctx)
    expect(ids(s.candidates).filter((id) => id.startsWith(DOCKER_VOLUME))).toEqual([
      `${DOCKER_VOLUME}:scratch`,
    ])
  })

  test('no build cache candidate when nothing is reclaimable or buildx is missing; the rest still are', async () => {
    for (const du of ['Reclaimable:\t0B\nTotal:\t0B\n', null]) {
      const { plugin } = fakeDocker({ du })
      const s = await survey([plugin], ctx)
      expect(s.warnings).toEqual([])
      expect(ids(s.candidates)).toEqual([`${DOCKER_VOLUME}:pgdata`, `${DOCKER_IMAGE}:${OLD}`])
    }
  })

  test('a container removed between the listing and the inspect is skipped; the rest still count', async () => {
    const { plugin } = fakeDocker({ gone: ['d'.repeat(64)] })
    const s = await survey([plugin], ctx)
    expect(s.warnings).toEqual([])
    expect(ids(s.candidates)).toEqual([
      `${DOCKER_VOLUME}:pgdata`,
      `${DOCKER_IMAGE}:${OLD}`,
      `${DOCKER_BUILD_CACHE}:reclaimable`,
    ])
  })

  test('containers are inspected in batches, so the argv stays bounded', async () => {
    const containers = Object.fromEntries(
      Array.from({ length: 1201 }, (_, i) => [String(i).padStart(64, '0'), USED]),
    )
    const { plugin, ran } = fakeDocker({ containers })
    await survey([plugin], ctx)
    const inspects = ran().filter((c) => c.startsWith('container inspect'))
    expect(inspects.map((c) => c.split(' ').length - 4)).toEqual([500, 500, 201])
  })

  test('builder du gets the hook limit, and a failure other than buildx missing fails discover', async () => {
    const ok = fakeDocker()
    await survey([ok.plugin], ctx)
    const du = ok.calls.find((c) => c.argv.join(' ') === 'docker builder du')
    expect(du?.opts.timeoutMs).toBe(120_000)
    const { plugin } = fakeDocker({ du: { fails: 'ERROR: permission denied' } })
    const s = await survey([plugin], ctx)
    expect(s.warnings).toEqual([
      expect.stringContaining('docker builder du failed: ERROR: permission denied'),
    ])
  })

  test('the compose project is read from its own label, values with = and , kept', () => {
    expect(composeProject('com.docker.compose.project=shop')).toBe('shop')
    expect(composeProject('a=b,com.docker.compose.project=x=y,z,c=d')).toBe('x=y,z')
    expect(composeProject('note=com.docker.compose.project=no')).toBeUndefined()
    expect(composeProject('')).toBeUndefined()
  })

  test('no container: the images are not looked up against any', async () => {
    const { plugin, ran } = fakeDocker({ containers: {} })
    const s = await survey([plugin], ctx)
    expect(ids(s.candidates)).toContain(`${DOCKER_IMAGE}:${USED}`)
    expect(ran().some((c) => c.startsWith('container inspect'))).toBe(false)
  })
})

describe('detect', () => {
  test('docker not on PATH: not detected, and nothing said', async () => {
    const plugin = dockerPlugin({}, pluginKit('docker', { ...fakeRunner({}) }))
    const s = await survey([plugin], ctx)
    expect(s.plugins).toEqual([])
    expect(s.warnings).toEqual([])
  })

  test('the daemon not running: not detected, with the reason in a note', async () => {
    const { plugin, ran } = fakeDocker({ running: false })
    const s = await survey([plugin], ctx)
    expect(s.plugins).toEqual([])
    expect(s.candidates).toEqual([])
    expect(s.warnings).toEqual([])
    expect(s.notes).toEqual({
      docker:
        'Docker is installed but did not answer; its volumes, images and build cache are left alone (docker info --format {{.ServerVersion}} failed: Cannot connect to the Docker daemon at unix:///var/run/docker.sock)',
    })
    expect(ran()).toEqual(['info --format {{.ServerVersion}}'])
  })
})

describe('clean', () => {
  test('the default runs the image and the build cache; the volume is held', async () => {
    const { plugin, ran } = fakeDocker()
    const receipt = await clean(plan(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => [s.id, s.result, s.delete])).toEqual([
      [`${DOCKER_IMAGE}:${OLD}`, 'ok', `docker image rm removed image ${OLD}`],
      [`${DOCKER_BUILD_CACHE}:reclaimable`, 'ok', 'docker builder prune freed 1.5GB'],
    ])
    expect(ran()).toContain(`image rm -- ${OLD}`)
    expect(ran()).toContain('builder prune --all --force')
    expect(ran().some((c) => c.startsWith('volume rm'))).toBe(false)
  })

  test('a dangling volume picked still needs --allow discard-user-data, and with it Docker removes it', async () => {
    const id = `${DOCKER_VOLUME}:pgdata`
    const only = { select: [id], pick: [id] }
    const denied = fakeDocker()
    const s = await survey([denied.plugin], ctx)
    expect(s.objections).toContainEqual(
      expect.objectContaining({
        candidate: id,
        level: 'protest',
        code: DISCARD_USER_DATA,
        by: 'host-cleaner',
      }),
    )
    const refused = await clean(plan(s, only), [denied.plugin], ctx)
    expect(refused.steps).toEqual([])
    expect(refused.dropped).toEqual([expect.objectContaining({ id, reason: 'not-allowed' })])
    expect(denied.ran().some((c) => c.startsWith('volume rm'))).toBe(false)

    const allowed = fakeDocker()
    const run = { ...ctx, allow: [DISCARD_USER_DATA] }
    const receipt = await clean(
      plan(await survey([allowed.plugin], run), { ...only, allow: [DISCARD_USER_DATA] }),
      [allowed.plugin],
      run,
    )
    expect(receipt.steps.map((st) => [st.id, st.result, st.delete])).toEqual([
      [id, 'ok', 'docker volume rm removed volume pgdata'],
    ])
    expect(allowed.ran()).toContain('volume rm -- pgdata')
  })

  test('a volume a container took up since the plan: Docker refuses, and the step fails', async () => {
    const id = `${DOCKER_VOLUME}:pgdata`
    const { plugin } = fakeDocker({ inUse: ['pgdata'] })
    const run = { ...ctx, allow: [DISCARD_USER_DATA] }
    const receipt = await clean(
      plan(await survey([plugin], run), { select: [id], pick: [id], allow: [DISCARD_USER_DATA] }),
      [plugin],
      run,
    )
    expect(receipt.steps).toEqual([
      expect.objectContaining({
        id,
        result: 'failed',
        error: expect.stringContaining('volume is in use'),
      }),
    ])
  })
})

describe('delete', () => {
  test('refuses a folder, outside or not, and a ref that is not one of its kinds, and runs nothing', async () => {
    const home = tempHome()
    cleanups.push(home.cleanup)
    const dir = join(home.home, 'outside')
    mkdirSync(dir)
    writeFileSync(join(dir, 'keep'), 'x')
    const { plugin, ran } = fakeDocker()
    const folder: Candidate = {
      id: `escaped:${dir}`,
      kind: DOCKER_VOLUME,
      owner: 'docker',
      why: 'x',
      path: dir,
      evidence: {},
    }
    await expect(async () => plugin.delete!(folder, fakeContext())).rejects.toThrow(
      /is not a Docker volume, image or build cache/,
    )
    expect(readdirSync(dir)).toEqual(['keep'])
    const other: Candidate = {
      id: 'orca-record:x',
      kind: 'orca-record',
      owner: 'docker',
      why: 'x',
      ref: 'x',
      evidence: {},
    }
    await expect(async () => plugin.delete!(other, fakeContext())).rejects.toThrow(
      /is not a Docker volume/,
    )
    expect(ran()).toEqual([])
  })
})

describe('the contract', () => {
  test('passes the contract suite', async () => {
    expect(await contractSuite(fakeDocker().plugin)).toEqual([])
  })

  test('is a built-in, after orca, with keepVolumes defaulting to none', () => {
    expect(BUILT_IN_PLUGINS.at(-1)).toBe(dockerDefinition)
    expect(dockerDefinition.settings.parse({})).toEqual({ keepVolumes: [] })
  })
})

describe('parsing', () => {
  test('sizes as Docker prints them', () => {
    expect(dockerBytes('0B')).toBe(0)
    expect(dockerBytes('512kB')).toBe(512_000)
    expect(dockerBytes('1.2GB')).toBe(1_200_000_000)
    expect(dockerBytes('1.5GiB')).toBe(1.5 * 1024 ** 3)
    expect(dockerBytes('N/A')).toBeUndefined()
  })

  test('JSON lines and the reclaimable total', () => {
    expect(jsonLines('{"Name":"a"}\n\nnot json\n[1]\n{"Name":"b"}\n')).toEqual([
      { Name: 'a' },
      { Name: 'b' },
    ])
    expect(reclaimable(DU)).toBe(1_500_000_000)
    expect(reclaimable('')).toBeUndefined()
  })
})
