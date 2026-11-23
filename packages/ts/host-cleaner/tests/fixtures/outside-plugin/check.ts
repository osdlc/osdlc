/**
 * The plugin's own test, with `@osdlc/host-cleaner/testing` and no test
 * runner: one idle folder, the contract suite, and the problems as JSON.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { pluginKit } from '@osdlc/host-cleaner/plugin'
import { contractSuite, fakeContext, tempHome } from '@osdlc/host-cleaner/testing'

import scratch from './plugin.js'

const home = tempHome('outside-plugin-')
try {
  const dir = join(home.home, '.scratch', 'build-1')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'out.bin'), 'x')
  const plugin = scratch.create({
    settings: scratch.settings.parse({ idleHours: 0 }),
    env: home.env,
    kit: pluginKit(scratch.name, { env: home.env }),
  })
  const discovered = await plugin.discover?.(fakeContext({ cwd: home.home }))
  const problems = await contractSuite(plugin, { cwd: home.home })
  process.stdout.write(`${JSON.stringify({ ids: discovered?.map((c) => c.id), problems })}\n`)
} finally {
  home.cleanup()
}
