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

import { errorText, isObject, str } from './helpers.ts'
import { pluginKit, type Kit, type KitOptions, type KitRunResult } from './kit.ts'
import { DELETE_LIMIT_MS } from './run.ts'
import { PLUGIN_API, definePlugin, type Candidate, type Ctx, type Plugin } from './types.ts'

export const DOCKER_PLUGIN = 'docker'

export const DOCKER_VOLUME = 'docker-volume'
export const DOCKER_IMAGE = 'docker-image'
export const DOCKER_BUILD_CACHE = 'docker-build-cache'

/** `discover` runs several Docker commands, and `docker builder du` may wait on its builder. */
const DISCOVER_LIMIT_MS = 2 * 60_000

/** `docker builder du` waits on its builder, which may be remote or stopped; well inside {@link DISCOVER_LIMIT_MS}. */
const DU_LIMIT_MS = 60_000

/** A running daemon answers `docker info` at once; well inside detect's 30s hook limit. */
const INFO_LIMIT_MS = 10_000

/** The ref of the one build cache candidate: what `docker builder prune` reclaims. */
const BUILD_CACHE_REF = 'reclaimable'

export interface DockerOptions extends KitOptions {
  /** Volume names never proposed, even when no container uses them. */
  keepVolumes?: readonly string[] | undefined
}

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

/**
 * The bytes deleting an image frees, from its `docker image ls` row: those of
 * its layers no other image shares. Undefined when Docker did not report what
 * is shared (`N/A`), rather than the whole size, which counts shared layers.
 */
export function imageBytes(row: Record<string, unknown>): number | undefined {
  const unique = dockerBytes(str(row.UniqueSize))
  if (unique !== undefined) return unique
  const size = dockerBytes(str(row.Size))
  const shared = dockerBytes(str(row.SharedSize))
  return size === undefined || shared === undefined ? undefined : Math.max(0, size - shared)
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

/** Containers or volumes inspected per `docker ... inspect`, so its argv stays well under ARG_MAX. */
const INSPECT_BATCH = 500

/** Whether Docker printed at least one error line, and every one says a container, volume or image is gone. */
const onlyGone = (r: KitRunResult): boolean => {
  const errors = lines(r.stderr)
  return (
    errors.length > 0 && errors.every((l) => /no such (container|volume|image|object)/i.test(l))
  )
}

/** Whether `docker builder du` failed only because this Docker has no `builder du` (no buildx). */
const noBuilderDu = (r: KitRunResult): boolean =>
  /is not a docker command|unknown command|unknown flag/i.test(failureText(r))

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

  /**
   * `docker <args>` once it exited 0, or failed in a way `tolerate` accepts;
   * otherwise throws with Docker's own message.
   */
  const docker = async (
    args: readonly string[],
    ctx: Ctx,
    o: { timeoutMs?: number; tolerate?: (r: KitRunResult) => boolean } = {},
  ): Promise<KitRunResult> => {
    const r = await kit.run(['docker', ...args], { signal: ctx.signal, timeoutMs: o.timeoutMs })
    if (!r.ok && o.tolerate?.(r) !== true) {
      throw new Error(`docker ${args.join(' ')} failed: ${firstLine(failureText(r))}`)
    }
    return r
  }

  /** The stdout of `docker <args> <names>`, in batches; a name gone since its listing is not a failure. */
  const inspect = async (args: readonly string[], names: readonly string[], ctx: Ctx) => {
    let out = ''
    for (let i = 0; i < names.length; i += INSPECT_BATCH) {
      const batch = names.slice(i, i + INSPECT_BATCH)
      out += (await docker([...args, ...batch], ctx, { tolerate: onlyGone })).stdout
    }
    return out
  }

  /** The image ids of every container, running or stopped: any one of them keeps its image. */
  const imagesInUse = async (ctx: Ctx): Promise<Set<string>> => {
    const listed = await docker(['container', 'ls', '--all', '--quiet', '--no-trunc'], ctx)
    const ids = lines(listed.stdout)
    const out = await inspect(['container', 'inspect', '--format', '{{.Image}}'], ids, ctx)
    return new Set(lines(out))
  }

  /**
   * Each volume's `CreatedAt` by name, as the daemon keeps it, so a volume
   * removed and made again under its name is told apart. One removed since
   * its listing has none.
   */
  const volumesCreated = async (
    names: readonly string[],
    ctx: Ctx,
  ): Promise<Map<string, string>> => {
    const out = await inspect(['volume', 'inspect', '--format', '{{json .}}'], names, ctx)
    return new Map(jsonLines(out).map((row) => [str(row.Name), str(row.CreatedAt)]))
  }

  const volumes = async (ctx: Ctx): Promise<Candidate[]> => {
    const out = await docker(
      ['volume', 'ls', '--filter', 'dangling=true', '--format', '{{json .}}'],
      ctx,
    )
    const rows = jsonLines(out.stdout).filter(
      (row) => str(row.Name) !== '' && !keep.has(str(row.Name)),
    )
    if (rows.length === 0) return []
    const created = await volumesCreated(rows.map((row) => str(row.Name)), ctx)
    return rows.flatMap((row): Candidate[] => {
      const name = str(row.Name)
      const at = created.get(name) ?? ''
      // Without its creation time, a volume made again under this name could not be told apart.
      if (at === '') return []
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
          evidence: { kind: DOCKER_VOLUME, name, driver: str(row.Driver), created: at },
        }),
      ]
    })
  }

  const images = async (ctx: Ctx): Promise<Candidate[]> => {
    const out = await docker(
      ['image', 'ls', '--filter', 'dangling=true', '--no-trunc', '--format', '{{json .}}'],
      ctx,
    )
    const rows = jsonLines(out.stdout).filter((row) => str(row.ID) !== '')
    if (rows.length === 0) return []
    const used = await imagesInUse(ctx)
    return rows.flatMap((row): Candidate[] => {
      const id = str(row.ID)
      if (used.has(id)) return []
      const bytes = imageBytes(row)
      return [
        kit.candidate({
          kind: DOCKER_IMAGE,
          ref: id,
          why: 'a dangling image: it has no tag and no container uses it',
          ...(bytes === undefined ? {} : { bytes }),
          costDescription: 're-download',
          // The id is the image's content; `CreatedAt` is printed in the local time zone, so it stays out.
          evidence: { kind: DOCKER_IMAGE, id },
        }),
      ]
    })
  }

  const buildCache = async (ctx: Ctx): Promise<Candidate[]> => {
    // Without buildx there is no build cache to propose.
    const r = await docker(['builder', 'du'], ctx, {
      timeoutMs: DU_LIMIT_MS,
      tolerate: noBuilderDu,
    })
    if (!r.ok) return []
    const bytes = reclaimable(r.stdout)
    if (bytes === undefined || bytes === 0) return []
    return [
      kit.candidate({
        kind: DOCKER_BUILD_CACHE,
        ref: BUILD_CACHE_REF,
        why: 'build cache no build is using',
        bytes,
        costDescription: 're-download',
        // The size moves with every build, so it stays out of the evidence; `delete` holds it to the plan's.
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
        await docker(['info', '--format', '{{.ServerVersion}}'], ctx, { timeoutMs: INFO_LIMIT_MS })
      } catch (err) {
        return {
          active: false,
          note: `Docker is installed but did not answer; its volumes, images and build cache are left alone (${errorText(err)})`,
        }
      }
      return true
    },
    /**
     * Volumes, images and the build cache, each on its own: one that fails
     * leaves out only its own candidates. Throws when all three fail.
     */
    async discover(ctx) {
      const found = await Promise.allSettled([volumes(ctx), images(ctx), buildCache(ctx)])
      const failed = found.flatMap((f) => (f.status === 'rejected' ? [errorText(f.reason)] : []))
      if (failed.length === found.length) throw new Error(failed.join('; '))
      return found.flatMap((f) => (f.status === 'fulfilled' ? f.value : []))
    },
    async delete(c, ctx) {
      if (c.ref === undefined)
        throw new Error(`docker: ${c.id} is not a Docker volume, image or build cache`)
      if (c.kind === DOCKER_VOLUME) {
        const r = await docker(['volume', 'rm', '--', c.ref], ctx, { tolerate: onlyGone })
        return r.ok ? `docker volume rm removed volume ${c.ref}` : `already gone: volume ${c.ref}`
      }
      if (c.kind === DOCKER_IMAGE) {
        const r = await docker(['image', 'rm', '--', c.ref], ctx, { tolerate: onlyGone })
        return r.ok ? `docker image rm removed image ${c.ref}` : `already gone: image ${c.ref}`
      }
      if (c.kind === DOCKER_BUILD_CACHE && c.ref === BUILD_CACHE_REF) {
        // The prune takes every unused record, so it runs only while they come to no more than the plan showed.
        if (c.bytes === undefined) {
          throw new Error('changed: the plan has no size for the build cache')
        }
        const du = await docker(['builder', 'du'], ctx, { timeoutMs: DU_LIMIT_MS })
        const now = reclaimable(du.stdout)
        if (now === undefined) throw new Error('docker builder du printed no Reclaimable: total')
        if (now > c.bytes) {
          throw new Error(
            `changed: the build cache grew from ${c.bytes} to ${now} bytes reclaimable since the plan`,
          )
        }
        // `--all`: every unused record, as du's `Reclaimable:` counts, not only dangling ones.
        const pruned = await docker(['builder', 'prune', '--all', '--force'], ctx, {
          timeoutMs: DELETE_LIMIT_MS,
        })
        const total = /^\s*Total(?: reclaimed space)?:\s*(\S+)\s*$/m.exec(pruned.stdout)?.[1]
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
