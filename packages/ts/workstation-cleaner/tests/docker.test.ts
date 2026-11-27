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
  uniqueSizes,
} from '../src/docker.ts'
import { DELETE_LIMIT_MS } from '../src/run.ts'
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
  /** What `docker info --format {{.SystemTime}}` prints; default {@link NOW}. */
  systemTime?: string
  volumes?: Array<{ Name: string; Driver?: string; Labels?: string; CreatedAt?: string }>
  /** `UniqueSize` is what `system df -v` prints; `image ls` prints `N/A` for it. */
  images?: Array<{ ID: string; Size?: string; UniqueSize?: string; CreatedAt?: string }>
  /** `docker system df` fails with this message. */
  dfFails?: string
  /** Each container's image id. */
  containers?: Record<string, string>
  /** Containers `container ls` lists but that are removed before `container inspect`. */
  gone?: string[]
  /** What `docker builder du` prints; null: buildx is missing; `{ fails }`: it fails with that message. */
  du?: string | null | { fails: string }
  /** `docker image ls` fails with this message. */
  imagesFail?: string
  /** What `docker builder du` prints from its second call on, such as at the delete. */
  duLater?: string
  /** Volumes `docker volume rm` refuses, as Docker does one a container took up. */
  inUse?: string[]
  /** The creation time `volume inspect` gives from its second call on, such as at the delete. */
  madeAgain?: string
  /** Volumes and images someone else removed: `volume rm` and `image rm` say there is no such one. */
  removed?: string[]
}

const CREATED = '2026-10-01T09:00:00Z'

/** The daemon's clock, as `docker info` prints it, after every fixture's `CreatedAt`. */
const NOW = '2026-11-26T06:34:09.678996805Z'

const DU =
  'ID\tRECLAIMABLE\tSIZE\tLAST ACCESSED\nabc\ttrue\t1.5GB\t2 weeks ago\nShared:\t\t0B\nPrivate:\t1.5GB\nReclaimable:\t1.5GB\nTotal:\t\t1.5GB\n'

/** A fake `docker` CLI over `m`, and the plugin on a kit that runs it. */
function fakeDocker(m: Machine = {}, keepVolumes: string[] = []) {
  const volumes = m.volumes ?? [
    { Name: 'pgdata', Driver: 'local', Labels: 'com.docker.compose.project=shop' },
  ]
  const images = m.images ?? [
    { ID: OLD, Size: '120MB', UniqueSize: '100MB', CreatedAt: '2026-01-01 00:00:00 +0000 UTC' },
    { ID: USED, Size: '1.2GB', UniqueSize: '1.2GB', CreatedAt: '2026-02-01 00:00:00 +0000 UTC' },
  ]
  let dus = 0
  let volumeInspects = 0
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
      if (cmd === 'info --format {{.SystemTime}}') return { stdout: `${m.systemTime ?? NOW}\n` }
      if (cmd === 'volume ls --filter dangling=true --format {{json .}}') {
        // As Docker lists them: no `CreatedAt`, which only `volume inspect` gives.
        return json(volumes.map((v) => ({ Name: v.Name, Driver: v.Driver, Labels: v.Labels })))
      }
      if (argv[0] === 'volume' && argv[1] === 'inspect' && argv[3] === '{{json .}}') {
        volumeInspects += 1
        const created = volumeInspects > 1 ? m.madeAgain : undefined
        const asked = argv.slice(5)
        // A volume with an empty `CreatedAt` stands for one removed since `volume ls`.
        const found = volumes.filter((v) => asked.includes(v.Name) && v.CreatedAt !== '')
        const gone = asked.filter((n) => !found.some((v) => v.Name === n))
        return {
          ...(gone.length === 0 ? {} : { exitCode: 1 }),
          ...json(
            found.map((v) => ({ Name: v.Name, CreatedAt: created ?? v.CreatedAt ?? CREATED })),
          ),
          stderr: gone
            .map((n) => `Error response from daemon: get ${n}: no such volume\n`)
            .join(''),
        }
      }
      if (cmd === 'image ls --filter dangling=true --no-trunc --format {{json .}}') {
        if (m.imagesFail !== undefined) return { exitCode: 1, stderr: `${m.imagesFail}\n` }
        return json(images.map((i) => ({ ...i, SharedSize: 'N/A', UniqueSize: 'N/A' })))
      }
      if (cmd === 'system df -v --format {{json .Images}}') {
        return m.dfFails === undefined
          ? { stdout: `${JSON.stringify(images)}\n` }
          : { exitCode: 1, stderr: `${m.dfFails}\n` }
      }
      if (cmd === 'container ls --all --quiet --no-trunc') {
        return {
          stdout: [...Object.keys(containers), ...(m.gone ?? [])].map((id) => `${id}\n`).join(''),
        }
      }
      if (argv[0] === 'container' && argv[1] === 'inspect' && argv[3] === '{{.Image}}') {
        const asked = argv.slice(5)
        const gone = asked.filter((id) => !(id in containers))
        return {
          ...(gone.length === 0 ? {} : { exitCode: 1 }),
          stdout: asked
            .filter((id) => id in containers)
            .map((id) => `${containers[id]}\n`)
            .join(''),
          stderr: gone
            .map((id) => `Error response from daemon: No such container: ${id}\n`)
            .join(''),
        }
      }
      if (cmd === 'builder du') {
        dus += 1
        if (dus > 1 && m.duLater !== undefined) return { stdout: m.duLater }
        if (m.du === null)
          return { exitCode: 1, stderr: "docker: 'builder du' is not a docker command.\n" }
        if (typeof m.du === 'object') return { exitCode: 1, stderr: `${m.du.fails}\n` }
        return { stdout: m.du ?? DU }
      }
      if (argv[1] === 'rm' && m.removed?.includes(argv[3]!) === true) {
        return argv[0] === 'volume'
          ? { exitCode: 1, stderr: `Error response from daemon: get ${argv[3]}: no such volume\n` }
          : { exitCode: 1, stderr: `Error response from daemon: No such image: ${argv[3]}\n` }
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
      evidence: { kind: DOCKER_VOLUME, name: 'pgdata', driver: 'local', created: CREATED },
    })
    // Only the layers no other image shares are freed.
    expect(image).toMatchObject({ ref: OLD, bytes: 100_000_000, costDescription: 're-download' })
    // The id is the content; `CreatedAt`, printed in local time, would move with TZ.
    expect(image!.evidence).toEqual({ kind: DOCKER_IMAGE, id: OLD })
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

  test('buildx missing behind the old builder group, which answers with its usage, or with BuildKit asked for, is not a failure', async () => {
    const usage =
      '\nUsage:  docker builder COMMAND\n\nManage builds\n\nCommands:\n  build       Build an image from a Dockerfile\n  prune       Remove build cache'
    // As Docker 29 answers with DOCKER_BUILDKIT=1 and no buildx.
    const enforced =
      'ERROR: BuildKit is enabled but the buildx component is missing or broken.\n       Install the buildx component to build images with BuildKit:\n       https://docs.docker.com/go/buildx/'
    for (const fails of [usage, enforced]) {
      const { plugin } = fakeDocker({ volumes: [], images: [], du: { fails } })
      const s = await survey([plugin], ctx)
      expect(s.warnings).toEqual([])
      expect(s.candidates).toEqual([])
    }
  })

  test('a container inspect batch whose output lacks its last newline still keeps both batches apart', async () => {
    const OTHER = 'sha256:' + 'e'.repeat(64)
    const ids501 = Array.from({ length: 501 }, (_, i) => String(i).padStart(64, '0'))
    const fake = fakeRunner({
      docker: (argv) => {
        const cmd = argv.join(' ')
        if (cmd.startsWith('info')) return { stdout: '29.0.0\n' }
        if (cmd.startsWith('image ls')) return { stdout: `{"ID":"${USED}"}\n{"ID":"${OTHER}"}\n` }
        if (cmd.startsWith('container ls')) return { stdout: ids501.join('\n') }
        if (cmd.startsWith('container inspect')) {
          const asked = argv.slice(5)
          return { stdout: asked.map((id) => (id === ids501[500] ? OTHER : USED)).join('\n') }
        }
        return { stdout: '' }
      },
    })
    const s = await survey([dockerPlugin({}, pluginKit('docker', { ...fake }))], ctx)
    expect(s.warnings).toEqual([])
    expect(s.candidates).toEqual([])
  })

  test('a failed inspect batch counts its names in the reason instead of listing them', async () => {
    const fake = fakeRunner({
      docker: (argv) => {
        const cmd = argv.join(' ')
        if (cmd.startsWith('info')) return { stdout: '29.0.0\n' }
        if (cmd.startsWith('image ls')) return { stdout: `{"ID":"${OLD}"}\n` }
        if (cmd.startsWith('container ls')) return { stdout: `${CONTAINER}\n${'d'.repeat(64)}\n` }
        if (cmd.startsWith('container inspect'))
          return { exitCode: 1, stderr: 'Error response from daemon: busy\n' }
        return { stdout: '' }
      },
    })
    const s = await survey([dockerPlugin({}, pluginKit('docker', { ...fake }))], ctx)
    expect(s.warnings).toEqual([
      'docker: discover failed: docker container inspect --format {{.Image}} -- <2 names> failed: Error response from daemon: busy',
    ])
  })

  test("a volume made in the ten minutes before the daemon's clock, or with a creation time that does not parse, is not proposed", async () => {
    const { plugin, ran } = fakeDocker({
      volumes: [
        { Name: 'pgdata', CreatedAt: CREATED },
        { Name: 'fresh', CreatedAt: '2026-11-26T06:25:00Z' },
        { Name: 'zoned', CreatedAt: '2026-11-26T08:25:00+02:00' },
        { Name: 'odd', CreatedAt: '1' },
      ],
    })
    const s = await survey([plugin], ctx)
    expect(ids(s.candidates).filter((id) => id.startsWith(DOCKER_VOLUME))).toEqual([
      `${DOCKER_VOLUME}:pgdata`,
    ])
    // The daemon's clock is read before the volumes are inspected.
    const at = ran().indexOf('info --format {{.SystemTime}}')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(ran().findIndex((c) => c.startsWith('volume inspect')))
  })

  test("the daemon's clock, not this one's, decides how lately a volume was made", async () => {
    // A daemon whose clock is a day behind: the volume was made a minute before its time.
    const { plugin } = fakeDocker({
      systemTime: '2026-10-01T09:01:00Z',
      volumes: [{ Name: 'pgdata', CreatedAt: CREATED }],
    })
    const s = await survey([plugin], ctx)
    expect(ids(s.candidates).filter((id) => id.startsWith(DOCKER_VOLUME))).toEqual([])
  })

  test('a daemon clock that cannot be read leaves the volumes out, and says so', async () => {
    const { plugin } = fakeDocker({ systemTime: '29.0.0' })
    const s = await survey([plugin], ctx)
    expect(ids(s.candidates).filter((id) => id.startsWith(DOCKER_VOLUME))).toEqual([])
    expect(s.objections.filter((o) => o.by === 'docker')).toEqual([
      {
        by: 'docker',
        candidate: `${DOCKER_IMAGE}:${OLD}`,
        level: 'note',
        code: 'not-listed',
        reason: 'Docker could not list everything: docker info gave no time: 29.0.0',
      },
    ])
  })

  test('the delete limit leaves the prune its own after builder du', () => {
    expect(fakeDocker().plugin.limits?.delete).toBe(DELETE_LIMIT_MS + 60_000)
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
    expect(inspects.map((c) => c.split(' ').length - 5)).toEqual([500, 500, 201])
  })

  test('builder du has a limit inside the hook limit, and its failure leaves volumes and images proposed', async () => {
    const ok = fakeDocker()
    await survey([ok.plugin], ctx)
    const du = ok.calls.find((c) => c.argv.join(' ') === 'docker builder du')
    expect(du?.opts.timeoutMs).toBe(60_000)
    const { plugin } = fakeDocker({ du: { fails: 'ERROR: permission denied' } })
    const s = await survey([plugin], ctx)
    expect(s.warnings).toEqual([])
    expect(ids(s.candidates)).toEqual([`${DOCKER_VOLUME}:pgdata`, `${DOCKER_IMAGE}:${OLD}`])
    expect(s.objections.filter((o) => o.by === 'docker')).toEqual([
      {
        by: 'docker',
        candidate: `${DOCKER_VOLUME}:pgdata`,
        level: 'note',
        code: 'not-listed',
        reason:
          'Docker could not list everything: docker builder du failed: ERROR: permission denied',
      },
    ])
    // The note goes once the listing answers again.
    const fine = await survey([ok.plugin], ctx)
    expect(fine.objections.filter((o) => o.by === 'docker')).toEqual([])
  })

  test('a failed image listing leaves volumes and the build cache proposed', async () => {
    const { plugin } = fakeDocker({ imagesFail: 'ERROR: broken' })
    const s = await survey([plugin], ctx)
    expect(ids(s.candidates)).toEqual([
      `${DOCKER_VOLUME}:pgdata`,
      `${DOCKER_BUILD_CACHE}:reclaimable`,
    ])
    expect(s.objections).toContainEqual(
      expect.objectContaining({ by: 'docker', reason: expect.stringContaining('ERROR: broken') }),
    )
  })

  test('a failed listing with nothing else to propose is a warning', async () => {
    const { plugin } = fakeDocker({ volumes: [], images: [], du: { fails: 'ERROR: no builder' } })
    const s = await survey([plugin], ctx)
    expect(s.candidates).toEqual([])
    expect(s.warnings).toEqual([
      'docker: discover failed: docker builder du failed: ERROR: no builder',
    ])
  })

  test('an image has no size when docker system df does not answer, and no dangling image means it is not asked', async () => {
    const failing = fakeDocker({ dfFails: 'unknown flag' })
    const s = await survey([failing.plugin], ctx)
    const image = s.candidates.find((c) => c.kind === DOCKER_IMAGE)
    expect(image).toMatchObject({ ref: OLD })
    expect(image!.bytes).toBeUndefined()
    expect(s.warnings).toEqual([])

    const { plugin, ran } = fakeDocker({ images: [] })
    await survey([plugin], ctx)
    expect(ran().some((c) => c.startsWith('system df'))).toBe(false)
  })

  test('docker system df is asked alongside the containers, not after them', async () => {
    const { plugin, ran } = fakeDocker()
    await survey([plugin], ctx)
    const df = ran().findIndex((c) => c.startsWith('system df'))
    expect(df).toBeGreaterThan(-1)
    expect(df).toBeLessThan(ran().findIndex((c) => c.startsWith('container inspect')))
  })

  test('discover fails when every listing fails, with each reason', async () => {
    const fake = fakeRunner({
      docker: (argv) =>
        argv[0] === 'info' ? { stdout: '29.0.0\n' } : { exitCode: 1, stderr: 'ERROR: broken\n' },
    })
    const s = await survey([dockerPlugin({}, pluginKit('docker', { ...fake }))], ctx)
    expect(s.candidates).toEqual([])
    expect(s.warnings).toEqual([expect.stringContaining('docker volume ls')])
    expect(s.warnings[0]).toContain('docker image ls')
    expect(s.warnings[0]).toContain('docker builder du failed: ERROR: broken')
  })

  test('a volume removed between its listing and its inspect is skipped', async () => {
    const { plugin, ran } = fakeDocker({
      volumes: [
        { Name: 'pgdata', CreatedAt: CREATED },
        { Name: 'scratch', CreatedAt: '' },
      ],
    })
    const s = await survey([plugin], ctx)
    expect(s.warnings).toEqual([])
    expect(ids(s.candidates).filter((id) => id.startsWith(DOCKER_VOLUME))).toEqual([
      `${DOCKER_VOLUME}:pgdata`,
    ])
    expect(ran()).toContain('volume inspect --format {{json .}} -- pgdata scratch')
  })

  test('a volume Docker gives no creation time for is not proposed', async () => {
    const fake = fakeRunner({
      docker: (argv) => {
        const cmd = argv.join(' ')
        if (cmd.startsWith('info')) return { stdout: `${NOW}\n` }
        if (cmd.startsWith('volume ls')) return { stdout: '{"Name":"remote","Driver":"nfs"}\n' }
        if (cmd.startsWith('volume inspect')) return { stdout: '{"Name":"remote"}\n' }
        return { stdout: '' }
      },
    })
    const s = await survey([dockerPlugin({}, pluginKit('docker', { ...fake }))], ctx)
    expect(s.warnings).toEqual([])
    expect(s.candidates).toEqual([])
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

  test('docker info has a limit well inside the detect hook limit', async () => {
    const { plugin, calls } = fakeDocker()
    await survey([plugin], ctx)
    expect(calls.find((c) => c.argv[1] === 'info')?.opts.timeoutMs).toBe(10_000)
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
        by: 'workstation-cleaner',
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

describe('the re-check and the delete', () => {
  const run = { ...ctx, allow: [DISCARD_USER_DATA] }
  const volume = `${DOCKER_VOLUME}:pgdata`

  test('a volume removed and made again under its name since the plan is changed, and kept', async () => {
    const before = fakeDocker()
    const p = plan(await survey([before.plugin], run), {
      select: [volume],
      pick: [volume],
      allow: [DISCARD_USER_DATA],
    })
    const after = fakeDocker({
      volumes: [{ Name: 'pgdata', Driver: 'local', CreatedAt: '2026-11-20T08:00:00Z' }],
    })
    const receipt = await clean(p, [after.plugin], run)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped).toEqual([expect.objectContaining({ id: volume, reason: 'changed' })])
    expect(after.ran().some((c) => c.startsWith('volume rm'))).toBe(false)
  })

  test('a volume made again between the re-check and the delete is kept', async () => {
    const { plugin, ran } = fakeDocker({ madeAgain: '2026-11-20T08:00:00Z' })
    const s = await survey([plugin], run)
    const c = s.candidates.find((v) => v.id === volume)!
    await expect(async () => plugin.delete!(c, fakeContext())).rejects.toThrow(
      'changed: volume pgdata is not the one the plan showed',
    )
    expect(ran().some((r) => r.startsWith('volume rm'))).toBe(false)
  })

  test('a volume gone before its last look is already gone, and Docker is not asked to remove it', async () => {
    const { plugin, ran } = fakeDocker({ volumes: [] })
    const c = (await survey([fakeDocker().plugin], run)).candidates.find((v) => v.id === volume)!
    expect(await plugin.delete!(c, fakeContext())).toBe('already gone: volume pgdata')
    expect(ran().some((r) => r.startsWith('volume rm'))).toBe(false)
  })

  test('a volume or image someone else removed after the re-check is already gone, not a failure', async () => {
    const image = `${DOCKER_IMAGE}:${OLD}`
    const { plugin } = fakeDocker({ removed: ['pgdata', OLD] })
    const receipt = await clean(
      plan(await survey([plugin], run), {
        select: [volume, image],
        pick: [volume],
        allow: [DISCARD_USER_DATA],
      }),
      [plugin],
      run,
    )
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((st) => [st.id, st.result, st.delete])).toEqual([
      [volume, 'ok', 'already gone: volume pgdata'],
      [image, 'ok', `already gone: image ${OLD}`],
    ])
  })

  test('a build cache grown past the plan is not pruned; the same or less is', async () => {
    const cache = `${DOCKER_BUILD_CACHE}:reclaimable`
    const p = plan(await survey([fakeDocker().plugin], ctx), { select: [cache] })

    // Grown before the re-check: the re-check reads 20GB, but the plan showed 1.5GB.
    const grown = fakeDocker({ du: 'Reclaimable:\t20GB\n' })
    const refused = await clean(p, [grown.plugin], ctx)
    expect(refused.steps).toEqual([])
    expect(refused.dropped).toEqual([
      {
        id: cache,
        reason: 'changed',
        detail: 'the plan showed 1500000000 bytes, now 20000000000 bytes',
      },
    ])
    expect(grown.ran()).not.toContain('builder prune --all --force')

    // Grown between the re-check and the delete.
    const late = fakeDocker({ duLater: 'Reclaimable:\t3GB\n' })
    const between = await clean(p, [late.plugin], ctx)
    expect(between.steps).toEqual([
      expect.objectContaining({
        result: 'failed',
        error:
          'changed: the build cache grew from 1500000000 to 3000000000 bytes reclaimable since the re-check',
      }),
    ])
    expect(late.ran()).not.toContain('builder prune --all --force')

    const shrunk = fakeDocker({ du: 'Reclaimable:\t1GB\n' })
    const ok = await clean(p, [shrunk.plugin], ctx)
    expect(ok.steps).toEqual([expect.objectContaining({ id: cache, result: 'ok' })])
    expect(shrunk.ran()).toContain('builder prune --all --force')
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
    const names = BUILT_IN_PLUGINS.map((d) => d.name)
    expect(BUILT_IN_PLUGINS[names.indexOf('docker')]).toBe(dockerDefinition)
    expect(names.indexOf('docker')).toBeGreaterThan(names.indexOf('orca'))
    expect(dockerDefinition.settings.parse({})).toEqual({ keepVolumes: [] })
  })
})

describe('parsing', () => {
  test('an image frees only the layers it does not share', () => {
    const sizes = uniqueSizes(
      JSON.stringify([
        { ID: OLD, Size: '120MB', SharedSize: '20MB', UniqueSize: '100MB' },
        { ID: 'b'.repeat(12), Size: '1.2GB', UniqueSize: '5MB' },
        { ID: 'd'.repeat(12), Size: '1.2GB', UniqueSize: 'N/A' },
      ]),
    )
    expect([...sizes]).toEqual([
      ['a'.repeat(12), 100_000_000],
      ['b'.repeat(12), 5_000_000],
    ])
    expect(uniqueSizes('').size).toBe(0)
    expect(uniqueSizes('{}').size).toBe(0)
  })

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
