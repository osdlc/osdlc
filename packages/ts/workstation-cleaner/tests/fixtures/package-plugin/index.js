/**
 * A plugin package as the loader finds it installed: built JavaScript that
 * imports `@osdlc/workstation-cleaner/plugin` alone. `tests/fixtures/packages.ts` installs it in a temporary `node_modules`.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { PLUGIN_API, definePlugin, z } from '@osdlc/workstation-cleaner/plugin'

export default definePlugin({
  name: 'fixture',
  api: PLUGIN_API,
  settings: z.strictObject({ keep: z.array(z.string()).default([]) }),
  create({ settings, env, kit }) {
    const root = join(env.HOME ?? '', '.fixture')
    return {
      name: 'fixture',
      detect: () => existsSync(root),
      roots: () => [root],
      discover: () =>
        readdirSync(root)
          .filter((n) => !settings.keep.includes(n))
          .map((n) =>
            kit.candidate({
              kind: 'scratch',
              path: join(root, n),
              why: 'a fixture folder',
              costDescription: 're-download',
            }),
          ),
      delete: (c, ctx) => kit.remove(c.path, ctx),
    }
  },
})
