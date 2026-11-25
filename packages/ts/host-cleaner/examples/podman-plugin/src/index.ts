/**
 * A tier 3 plugin: Podman volumes that no container uses. Each is a ref
 * candidate, deleted by name with `podman volume rm`, and `lost`, since a
 * volume holds data nothing can download or rebuild. ../README.md says what
 * the core does with such a candidate.
 */

import { PLUGIN_API, definePlugin, z, type Kit } from '@osdlc/host-cleaner/plugin'

/** A volume name as Podman accepts one; anything else is not a volume this plugin proposed. */
const VOLUME_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

/** Go's zero `time.Time`, which Podman writes for a volume with no creation time. */
const GO_ZERO_TIME = Date.parse('0001-01-01T00:00:00Z')

/** The fields of one entry of `podman volume ls --format json` this plugin reads. */
const Volume = z.object({
  Name: z.string(),
  Driver: z.string().optional(),
  CreatedAt: z.string().optional(),
  // Podman leaves it out when false.
  Anonymous: z.boolean().optional(),
})

/** The volumes no container uses, running or stopped. */
async function unusedVolumes(kit: Kit, signal: AbortSignal): Promise<z.output<typeof Volume>[]> {
  const r = await kit.run(
    ['podman', 'volume', 'ls', '--filter', 'dangling=true', '--format', 'json'],
    { signal, check: true },
  )
  // Older Podman prints nothing, not `[]`, when there are no volumes; a nil list prints `null`.
  if (r.stdout.trim() === '') return []
  return z.array(Volume).nullable().parse(JSON.parse(r.stdout)) ?? []
}

export default definePlugin({
  name: 'podman',
  api: PLUGIN_API,
  settings: z.object({
    keepVolumes: z
      .array(z.string())
      .default([])
      .describe("Volume names never proposed, such as a database's."),
  }),
  create({ settings, kit }) {
    return {
      name: 'podman',
      async detect(ctx) {
        if (!kit.onPath('podman')) return false
        // `podman info` fails when it can't reach Podman, such as a stopped machine.
        const r = await kit.run(['podman', 'info'], { signal: ctx.signal })
        if (r.ok) return true
        return { active: false, note: `podman info failed: ${r.stderr.trim() || 'no output'}` }
      },
      async discover(ctx) {
        return (await unusedVolumes(kit, ctx.signal)).flatMap((v) => {
          if (settings.keepVolumes.includes(v.Name)) return []
          // delete would refuse it.
          if (!VOLUME_NAME.test(v.Name)) return []
          // Without a creation time, a volume made again under the same name
          // would have the same evidence, so it is not proposed. Podman gives
          // a missing one as Go's zero time, 0001-01-01T00:00:00Z.
          if (!(Date.parse(v.CreatedAt ?? '') > GO_ZERO_TIME)) return []
          return kit.candidate({
            kind: 'volume',
            ref: v.Name,
            name: v.Name,
            why:
              v.Anonymous === true
                ? 'an anonymous volume no container uses'
                : 'no container uses it',
            costDescription: 'lost',
            // A volume made again under the same name since the plan is
            // another volume: the re-check drops it as changed.
            evidence: { created: v.CreatedAt, driver: v.Driver ?? null },
          })
        })
      },
      async delete(c, ctx) {
        if (c.ref === undefined || !VOLUME_NAME.test(c.ref)) {
          throw new Error(`podman: ${c.id} is not a volume`)
        }
        // Without --force, Podman refuses a volume a container has started using since.
        await kit.run(['podman', 'volume', 'rm', c.ref], { signal: ctx.signal, check: true })
        return `removed volume ${c.ref}`
      },
    }
  },
})
