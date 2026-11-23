/**
 * The README's opening example, run through the package name: a plugin's own
 * candidate goes through survey, plan and clean, and the receipt keeps its
 * result sentence.
 */
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { clean, plan, survey, type Plugin, type RunCtx } from '@osdlc/host-cleaner'

// A path candidate must sit inside a target, or inside the plugin's roots.
const dir = join(process.cwd(), 'build-cache')

const cache: Plugin = {
  name: 'cache',
  detect: () => true,
  discover: () => [
    {
      id: `artifact:${dir}`,
      kind: 'artifact',
      path: dir,
      owner: 'cache',
      why: 'idle for a week',
      evidence: { bytes: 4096 },
    },
  ],
  delete: (c) => `removed ${c.path}`,
}

test("a plugin's candidate goes through survey, plan and clean", async () => {
  const ctx: RunCtx = { cwd: process.cwd(), targets: [process.cwd()], allow: [] }
  const receipt = await clean(plan(await survey([cache], ctx)), [cache], ctx)
  expect(receipt.status).toBe('complete')
  expect(receipt.steps).toMatchObject([
    { id: `artifact:${dir}`, owner: 'cache', result: 'ok', delete: `removed ${dir}` },
  ])
})
