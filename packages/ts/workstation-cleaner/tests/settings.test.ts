/** A plugin's settings schema as the config validates it: strict, with `enabled`, and its own refinements kept. */

import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import { PLUGIN_API, definePlugin } from '../src/index.ts'
import { resolveSettings, settingsIssues } from '../src/settings.ts'

/** A plugin whose settings may name volumes to keep or to drop, not both. */
const volumes = definePlugin({
  name: 'volumes',
  api: PLUGIN_API,
  settings: z
    .strictObject({
      keep: z.array(z.string()).default([]),
      drop: z.array(z.string()).default([]),
    })
    .refine((s) => s.keep.length === 0 || s.drop.length === 0, {
      message: 'set keep or drop, not both',
    }),
  create: () => ({ name: 'volumes', detect: () => true }),
})

describe('a refined settings schema', () => {
  test("its refinement still fires, beside the strict keys and the core's enabled", () => {
    const issues = (raw: Record<string, unknown>) =>
      settingsIssues({ volumes: raw }, 'plugins', [volumes])
    expect(issues({ keep: ['a'], drop: ['b'] })).toEqual([
      'plugins.volumes: set keep or drop, not both',
    ])
    expect(issues({ keep: ['a'], enabled: false })).toEqual([])
    expect(issues({ kept: ['a'] })).toEqual([expect.stringMatching(/^plugins\.volumes: .*kept/)])
  })

  test('resolveSettings fills in the defaults and enabled, and refuses what the refinement refuses', () => {
    expect(resolveSettings('volumes', { keep: ['a'] }, {}, [volumes]).settings).toEqual({
      keep: ['a'],
      drop: [],
      enabled: true,
    })
    expect(
      () => resolveSettings('volumes', { keep: ['a'], drop: ['b'] }, {}, [volumes]).settings,
    ).toThrow(/set keep or drop, not both/)
  })
})

test('resolveSettings gives the settings and where each came from', () => {
  const sourcesOf = (...args: Parameters<typeof resolveSettings>) =>
    resolveSettings(...args).sources
  expect(sourcesOf('cargo', { idleHours: 3 }, { idleHours: 3 })).toEqual({ idleHours: 'config' })
  expect(sourcesOf('cargo', { idleHours: undefined }, { idleHours: 3 })).toEqual({
    idleHours: 'shared',
  })
  expect(sourcesOf('cargo', {})).toEqual({})
  // git has no idleHours setting.
  expect(sourcesOf('git', {}, { idleHours: 3 })).toEqual({})

  const shared = resolveSettings('cargo', { enabled: true }, { idleHours: 3 })
  expect([shared.settings.idleHours, shared.sources]).toEqual([
    3,
    { enabled: 'config', idleHours: 'shared' },
  ])
  const own = resolveSettings('cargo', { idleHours: 0 }, { idleHours: 3 })
  expect([own.settings.idleHours, own.sources]).toEqual([0, { idleHours: 'config' }])
})
