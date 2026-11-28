/**
 * The plugin's own test, with `@osdlc/workstation-cleaner/testing` and no test
 * runner: one idle folder, the contract suite, and the problems as JSON.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { pluginKit } from '@osdlc/workstation-cleaner/plugin'
import { contractSuite, fakeContext, tempHome } from '@osdlc/workstation-cleaner/testing'

import scratch from './plugin.js'

const home = tempHome('outside-plugin-')
try {
  const dir = join(home.home, '.scratch', 'build-1')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'out.bin'), 'x')
  // Just made and holding no files yet: not idle.
  mkdirSync(join(home.home, '.scratch', 'build-2'))
  const make = (settings: Record<string, unknown>) =>
    scratch.create({
      settings: scratch.settings.parse(settings),
      env: home.env,
      kit: pluginKit(scratch.name, { env: home.env }),
    })
  const plugin = make({ idleHours: 0 })
  const discovered = await plugin.discover?.(fakeContext({ cwd: home.home }))
  const problems = await contractSuite(plugin, { cwd: home.home })
  const relative = await make({ dir: '~/.scratch' }).detect(fakeContext({ cwd: home.home }))
  process.stdout.write(
    `${JSON.stringify({ ids: discovered?.map((c) => c.id), problems, relative })}\n`,
  )
} finally {
  home.cleanup()
}
