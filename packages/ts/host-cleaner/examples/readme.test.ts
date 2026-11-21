/**
 * The README's opening example, run through the package name: a plugin's own
 * candidate goes through survey, plan and clean, and the receipt keeps its
 * result sentence.
 */
import { expect, test } from 'vitest'

import { clean, plan, survey, type Ctx, type Plugin } from '@osdlc/host-cleaner'

const cache: Plugin = {
  name: 'cache',
  detect: () => true,
  discover: () => [
    {
      id: 'artifact:build-cache',
      kind: 'artifact',
      path: 'build-cache',
      owner: 'cache',
      why: 'idle for a week',
      evidence: { bytes: 4096 },
    },
  ],
  delete: (c) => `removed ${c.path}`,
}

test("a plugin's candidate goes through survey, plan and clean", () => {
  const ctx: Ctx = { cwd: process.cwd(), targets: [], allow: [] }
  const receipt = clean(plan(survey([cache], ctx)), [cache], ctx)
  expect(receipt.status).toBe('complete')
  expect(receipt.steps).toMatchObject([
    { id: 'artifact:build-cache', owner: 'cache', result: 'ok', delete: 'removed build-cache' },
  ])
})
