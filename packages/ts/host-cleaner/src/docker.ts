/**
 * The `docker` plugin: volumes no container uses, dangling images no
 * container uses, and the build cache Docker can reclaim.
 *
 * Detected when `docker` is on PATH and `docker info` answers. Docker missing
 * is silent; installed but not running gives the reason as detect's note, and
 * the plugin stays out of the run. Every candidate is a ref that Docker deletes
 * itself (`docker volume rm`, `docker image rm`, `docker builder prune --all`),
 * so Docker's data folder is never touched and Docker refuses a volume or image
 * a container took up since.
 * A volume is `lost`, so it is held and needs `--allow discard-user-data`;
 * images and the build cache are `re-download`.
 * Settings: `plugins.docker.keepVolumes` (default none), volume names never proposed.
 */

import { failureText, firstLine } from '@osdlc/command-seam'
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
/** The non-blank lines of `text`, trimmed. */
const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')

/** Size prefixes; each one's index is the power of 1000 (or 1024) it stands for. */
const PREFIXES = ['', 'k', 'm', 'g', 't', 'p']

/**
 * Bytes in a size as Docker prints it (`1.2GB`, `512kB`, `0B`, also `1.5GiB`);
 * undefined when it is not one, such as `N/A`.
 */
export function dockerBytes(text: string): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kmgtp]?)(i?)b\s*$/i.exec(text)
  if (m === null) return undefined
  const power = PREFIXES.indexOf(m[2]!.toLowerCase())
  return Math.round(Number(m[1]) * (m[3] === '' ? 1000 : 1024) ** power)
}

/** The objects in `--format '{{json .}}'` output, one per line; a line that is not one is skipped. */
export function jsonLines(stdout: string): Record<string, unknown>[] {
  return lines(stdout).flatMap((line) => {
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

/** Containers inspected per `docker container inspect`, so its argv stays well under ARG_MAX. */
const INSPECT_BATCH = 500

/** Whether `docker container inspect` printed at least one error line, and every one says a container is gone. */
const onlyGone = (stderr: string): boolean => {
  const errors = lines(stderr)
  return errors.length > 0 && errors.every((l) => /no such (container|object)/i.test(l))
}

/** Whether `docker builder du` failed only because this Docker has no `builder du` (no buildx). */
const noBuilderDu = (text: string): boolean =>
  /is not a docker command|unknown command|unknown flag/i.test(text)

/** The label every Compose volume carries with its project's name. */
const COMPOSE_PROJECT = 'com.docker.compose.project'

/**
 * The compose project a volume belongs to, from its `Labels` (`a=b,c=d`): the value
 * after the first `=`, up to the next `,` that starts another `key=` pair.
 */
export const composeProject = (labels: string): string | undefined => {
  const at = `,${labels}`.indexOf(`,${COMPOSE_PROJECT}=`)
  if (at < 0) return undefined
  const rest = labels.slice(at + COMPOSE_PROJECT.length + 1)
  const next = /,[^,=]+=/.exec(rest)
  return next === null ? rest : rest.slice(0, next.index)
}

/** The `docker` plugin on `kit`, or on a kit built from `opts`. Settings: `keepVolumes`. */
export function dockerPlugin(
  opts: DockerOptions = {},
  kit: Kit = pluginKit(DOCKER_PLUGIN, opts),
): Plugin {
  const keep = new Set(opts.keepVolumes ?? [])

  /** The stdout of `docker <args>`; throws with Docker's own message when it fails. */
  const docker = async (args: readonly string[], ctx: Ctx, timeoutMs?: number): Promise<string> => {
    const r = await kit.run(['docker', ...args], { signal: ctx.signal, timeoutMs })
    if (!r.ok) throw new Error(`docker ${args.join(' ')} failed: ${firstLine(failureText(r))}`)
    return r.stdout
  }

  /**
   * The image ids of every container, running or stopped: any one of them keeps its image.
   * A container removed after the listing keeps no image, so `No such container`
   * for it is not a failure.
   */
  const imagesInUse = async (ctx: Ctx): Promise<Set<string>> => {
    const ids = lines(await docker(['container', 'ls', '--all', '--quiet', '--no-trunc'], ctx))
    const used = new Set<string>()
    for (let i = 0; i < ids.length; i += INSPECT_BATCH) {
      const batch = ids.slice(i, i + INSPECT_BATCH)
      const args = ['container', 'inspect', '--format', '{{.Image}}', ...batch]
      const r = await kit.run(['docker', ...args], { signal: ctx.signal })
      if (!r.ok && !onlyGone(r.stderr))
        throw new Error(`docker container inspect failed: ${firstLine(failureText(r))}`)
      for (const image of lines(r.stdout)) used.add(image)
    }
    return used
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
    const r = await kit.run(['docker', 'builder', 'du'], {
      signal: ctx.signal,
      timeoutMs: DISCOVER_LIMIT_MS,
    })
    if (!r.ok) {
      // Without buildx there is no build cache to propose, but volumes and images still are.
      if (noBuilderDu(failureText(r))) return []
      throw new Error(`docker builder du failed: ${firstLine(failureText(r))}`)
    }
    const bytes = reclaimable(r.stdout)
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
        return {
          active: false,
          note: `Docker is installed but did not answer; its volumes, images and build cache are left alone (${why})`,
        }
      }
      return true
    },
    async discover(ctx) {
      return (await Promise.all([volumes(ctx), images(ctx), buildCache(ctx)])).flat()
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
        // `--all`: every unused record, as du's `Reclaimable:` counts, not only dangling ones.
        const out = await docker(['builder', 'prune', '--all', '--force'], ctx, DELETE_LIMIT_MS)
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
