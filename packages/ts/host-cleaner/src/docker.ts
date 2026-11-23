/**
 * The `docker` plugin: volumes no container uses, dangling images no
 * container uses, and the build cache Docker can reclaim.
 *
 * Detected when `docker` is on PATH and `docker info` answers. Docker missing
 * is silent; installed but not running warns, and the plugin stays out of the
 * run. Every candidate is a ref that Docker deletes itself (`docker volume rm`,
 * `docker image rm`, `docker builder prune`), so Docker's data folder is never
 * touched and Docker refuses a volume or image a container took up since.
 * A volume is `lost`, so it is held and needs `--allow discard-user-data`;
 * images and the build cache are `re-download`.
 * Settings: `plugins.docker.keepVolumes` (default none), volume names never proposed.
 */

import { z } from 'zod'

import { pluginKit, type Kit, type KitOptions } from './kit.ts'
import { DELETE_LIMIT_MS } from './run.ts'
import { PLUGIN_API, definePlugin, type Candidate, type Ctx, type Plugin } from './types.ts'

export const DOCKER_PLUGIN = 'docker'

export const DOCKER_VOLUME = 'docker-volume'
export const DOCKER_IMAGE = 'docker-image'
export const DOCKER_BUILD_CACHE = 'docker-build-cache'

/** `discover` runs several Docker commands, and `docker builder du` may wait on its builder. */
const DISCOVER_LIMIT_MS = 2 * 60_000

/** The ref of the one build cache candidate: what `docker builder prune` reclaims. */
const BUILD_CACHE_REF = 'reclaimable'

export interface DockerOptions extends KitOptions {
  /** Volume names never proposed, even when no container uses them. */
  keepVolumes?: readonly string[] | undefined
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const UNITS: Record<string, number> = { '': 1, k: 1e3, m: 1e6, g: 1e9, t: 1e12, p: 1e15 }

/**
 * Bytes in a size as Docker prints it (`1.2GB`, `512kB`, `0B`, also `1.5GiB`);
 * undefined when it is not one, such as `N/A`.
 */
export function dockerBytes(text: string): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kmgtp]?)(i?)b\s*$/i.exec(text)
  if (m === null) return undefined
  const unit = m[2]!.toLowerCase()
  const scale = m[3] === '' ? UNITS[unit]! : 1024 ** Object.keys(UNITS).indexOf(unit)
  return Math.round(Number(m[1]) * scale)
}

/** The objects in `--format '{{json .}}'` output, one per line; a line that is not one is skipped. */
export function jsonLines(stdout: string): Record<string, unknown>[] {
  return stdout.split('\n').flatMap((line) => {
    if (line.trim() === '') return []
    try {
      const row: unknown = JSON.parse(line)
      return isObject(row) ? [row] : []
    } catch {
      return []
    }
  })
}

/** The bytes on the `Reclaimable:` line of `docker builder du`; undefined when there is none. */
export function reclaimable(stdout: string): number | undefined {
  const line = /^\s*Reclaimable:\s*(\S+)\s*$/m.exec(stdout)
  return line === null ? undefined : dockerBytes(line[1]!)
}

/** The compose project a volume belongs to, from its `Labels` (`a=b,c=d`). */
const composeProject = (labels: string): string | undefined =>
  labels
    .split(',')
    .map((l) => l.split('='))
    .find(([k]) => k === 'com.docker.compose.project')?.[1]

/** The `docker` plugin on `kit`, or on a kit built from `opts`. Settings: `keepVolumes`. */
export function dockerPlugin(
  opts: DockerOptions = {},
  kit: Kit = pluginKit(DOCKER_PLUGIN, opts),
): Plugin {
  const keep = new Set(opts.keepVolumes ?? [])

  /** The stdout of `docker <args>`; throws with Docker's own message when it fails. */
  const docker = async (args: readonly string[], ctx: Ctx, timeoutMs?: number): Promise<string> => {
    const r = await kit.run(['docker', ...args], { signal: ctx.signal, timeoutMs })
    if (!r.ok) {
      const reason = r.stderr.trim().split('\n')[0] || r.error || `exit ${r.exitCode}`
      throw new Error(`docker ${args.join(' ')} failed: ${reason}`)
    }
    return r.stdout
  }

  /** The image ids of every container, running or stopped: any one of them keeps its image. */
  const imagesInUse = async (ctx: Ctx): Promise<Set<string>> => {
    const ids = (await docker(['container', 'ls', '--all', '--quiet', '--no-trunc'], ctx))
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
    if (ids.length === 0) return new Set()
    const out = await docker(['container', 'inspect', '--format', '{{.Image}}', ...ids], ctx)
    return new Set(out.split('\n').map((l) => l.trim()))
  }

  const volumes = async (ctx: Ctx): Promise<Candidate[]> => {
    const out = await docker(
      ['volume', 'ls', '--filter', 'dangling=true', '--format', '{{json .}}'],
      ctx,
    )
    return jsonLines(out).flatMap((row): Candidate[] => {
      const name = str(row.Name)
      if (name === '' || keep.has(name)) return []
      const project = composeProject(str(row.Labels))
      return [
        kit.candidate({
          kind: DOCKER_VOLUME,
          ref: name,
          name,
          why:
            project === undefined
              ? 'no container uses this volume'
              : `no container uses this volume of compose project ${project}`,
          costDescription: 'lost',
          evidence: { kind: DOCKER_VOLUME, name, driver: str(row.Driver) },
        }),
      ]
    })
  }

  const images = async (ctx: Ctx): Promise<Candidate[]> => {
    const out = await docker(
      ['image', 'ls', '--filter', 'dangling=true', '--no-trunc', '--format', '{{json .}}'],
      ctx,
    )
    const rows = jsonLines(out).filter((row) => str(row.ID) !== '')
    if (rows.length === 0) return []
    const used = await imagesInUse(ctx)
    return rows.flatMap((row): Candidate[] => {
      const id = str(row.ID)
      if (used.has(id)) return []
      const bytes = dockerBytes(str(row.Size))
      return [
        kit.candidate({
          kind: DOCKER_IMAGE,
          ref: id,
          why: 'a dangling image: it has no tag and no container uses it',
          ...(bytes === undefined ? {} : { bytes }),
          costDescription: 're-download',
          evidence: { kind: DOCKER_IMAGE, id, created: str(row.CreatedAt) },
        }),
      ]
    })
  }

  const buildCache = async (ctx: Ctx): Promise<Candidate[]> => {
    let bytes: number | undefined
    try {
      bytes = reclaimable(await docker(['builder', 'du'], ctx))
    } catch {
      // A Docker without buildx has no `builder du`; its volumes and images still count.
      return []
    }
    if (bytes === undefined || bytes === 0) return []
    return [
      kit.candidate({
        kind: DOCKER_BUILD_CACHE,
        ref: BUILD_CACHE_REF,
        why: 'build cache no build is using',
        bytes,
        costDescription: 're-download',
        // The size moves with every build, so it stays out of the evidence.
        evidence: { kind: DOCKER_BUILD_CACHE },
      }),
    ]
  }

  return {
    name: DOCKER_PLUGIN,
    limits: { discover: DISCOVER_LIMIT_MS },
    async detect(ctx) {
      if (!kit.onPath('docker')) return false
      try {
        await docker(['info', '--format', '{{.ServerVersion}}'], ctx)
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err)
        throw new Error(
          `Docker is installed but did not answer; its volumes, images and build cache are left alone (${why})`,
        )
      }
      return true
    },
    async discover(ctx) {
      return [...(await volumes(ctx)), ...(await images(ctx)), ...(await buildCache(ctx))]
    },
    async delete(c, ctx) {
      if (c.ref === undefined)
        throw new Error(`docker: ${c.id} is not a Docker volume, image or build cache`)
      if (c.kind === DOCKER_VOLUME) {
        await docker(['volume', 'rm', '--', c.ref], ctx)
        return `docker volume rm removed volume ${c.ref}`
      }
      if (c.kind === DOCKER_IMAGE) {
        await docker(['image', 'rm', '--', c.ref], ctx)
        return `docker image rm removed image ${c.ref}`
      }
      if (c.kind === DOCKER_BUILD_CACHE && c.ref === BUILD_CACHE_REF) {
        const out = await docker(['builder', 'prune', '--force'], ctx, DELETE_LIMIT_MS)
        const total = /^\s*Total(?: reclaimed space)?:\s*(\S+)\s*$/m.exec(out)?.[1]
        return total === undefined
          ? 'docker builder prune removed the build cache'
          : `docker builder prune freed ${total}`
      }
      throw new Error(`docker: ${c.id} is not a Docker volume, image or build cache`)
    },
  }
}

/** The `docker` plugin as the command line builds it. Settings: `keepVolumes`. */
export const dockerDefinition = definePlugin({
  name: DOCKER_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({
    keepVolumes: z
      .array(z.string())
      .default([])
      .describe('Volume names never proposed, even when no container uses them.'),
  }),
  create: ({ settings, kit }) => dockerPlugin({ keepVolumes: settings.keepVolumes }, kit),
})
