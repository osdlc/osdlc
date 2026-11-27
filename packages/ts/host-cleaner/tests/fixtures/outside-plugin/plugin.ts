/**
 * A plugin as an outside package writes it, with `@osdlc/host-cleaner/plugin`
 * alone: the folders under `~/.scratch` (or `dir`) that have sat idle.
 * `tests/outside.test.ts` builds it in a package of its own.
 */
import { readdirSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import {
  PLUGIN_API,
  coveredBy,
  definePlugin,
  idleHoursOr,
  idleHoursSetting,
  z,
  type Candidate,
  type Idle,
} from '@osdlc/host-cleaner/plugin'

export default definePlugin({
  name: 'scratch',
  api: PLUGIN_API,
  settings: z.object({ dir: z.string().optional(), idleHours: idleHoursSetting }),
  create({ settings, env, kit }) {
    const root = settings.dir ?? join(env.HOME ?? '', '.scratch')
    const idleHours = idleHoursOr(settings.idleHours)
    return {
      name: 'scratch',
      // The core refuses a relative root, so say why the plugin does not run.
      detect: () =>
        isAbsolute(root)
          ? statSync(root, { throwIfNoEntry: false })?.isDirectory() === true
          : { active: false, note: `${root} is not absolute` },
      roots: () => [root],
      discover(ctx) {
        return readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .flatMap((e): Candidate[] => {
            const path = join(root, e.name)
            // The core leaves out an ignored folder, so do not measure it.
            if (coveredBy(path, ctx.ignore ?? []) !== undefined) return []
            let idle: Idle
            try {
              idle = kit.idle(path)
            } catch {
              // A folder it cannot read: leave it out, and keep the others.
              return []
            }
            if (idle.unmeasured) {
              return [
                kit.candidate({
                  kind: 'scratch',
                  path,
                  why: 'too big to measure',
                  unmeasured: true,
                }),
              ]
            }
            // No files yet: just made, or still being written, so not idle.
            if (idle.hours === null || idle.hours < idleHours) return []
            return [
              kit.candidate({
                kind: 'scratch',
                path,
                why: `idle ${Math.floor(idle.hours)} hours`,
                costDescription: 'rebuild',
              }),
            ]
          })
      },
      delete(c, ctx) {
        if (c.path === undefined) throw new Error(`scratch: ${c.id} is not a folder`)
        return kit.remove(c.path, ctx)
      },
    }
  },
})
