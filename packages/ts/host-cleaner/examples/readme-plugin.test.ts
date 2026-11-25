/**
 * The README's plugin example, written with `@osdlc/host-cleaner/plugin`
 * alone, keeps the contract on a folder where it finds something.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { PLUGIN_API, definePlugin, pluginKit, z } from '@osdlc/host-cleaner/plugin'
import { contractSuite, tempHome } from '@osdlc/host-cleaner/testing'

const scratch = definePlugin({
  name: 'scratch',
  api: PLUGIN_API,
  settings: z.object({ dir: z.string() }),
  create: ({ settings, kit }) => ({
    name: 'scratch',
    detect: () => true,
    roots: () => [settings.dir],
    discover: () => [kit.candidate({ kind: 'scratch', path: `${settings.dir}/out`, why: 'built' })],
    delete: (c, ctx) => kit.remove(c.path!, ctx),
  }),
})

test('the README shows the plugin this file tests', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const shown = /```ts\n(import [^\n]*'@osdlc\/host-cleaner\/plugin'\n[\s\S]*?)```/.exec(readme)?.[1]
  const definition = shown?.split('export default ')[1]
  expect(definition).toBeDefined()
  expect(readFileSync(new URL(import.meta.url), 'utf8')).toContain(`const scratch = ${definition}`)
})

test("the README's plugin keeps the contract", async () => {
  const home = tempHome()
  try {
    const dir = join(home.home, '.scratch')
    mkdirSync(join(dir, 'out'), { recursive: true })
    writeFileSync(join(dir, 'out', 'a.bin'), 'x')
    const plugin = scratch.create({
      settings: scratch.settings.parse({ dir }),
      env: home.env,
      kit: pluginKit(scratch.name, { env: home.env }),
    })
    expect(await contractSuite(plugin, { cwd: home.home })).toEqual([])
  } finally {
    home.cleanup()
  }
})
