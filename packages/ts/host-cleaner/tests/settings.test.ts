/** A plugin's settings schema as the config validates it: strict, with `enabled`, and its own refinements kept. */

import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import { PLUGIN_API, definePlugin } from '../src/index.ts'
import { settingsIssues, settingsOf, sourcesOf } from '../src/settings.ts'

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

  test('settingsOf fills in the defaults and enabled, and refuses what the refinement refuses', () => {
    expect(settingsOf('volumes', { keep: ['a'] }, {}, [volumes])).toEqual({
      keep: ['a'],
      drop: [],
      enabled: true,
    })
    expect(() => settingsOf('volumes', { keep: ['a'], drop: ['b'] }, {}, [volumes])).toThrow(
      /set keep or drop, not both/,
    )
  })
})

test('sourcesOf names where each setting came from, as settingsOf resolves it', () => {
  expect(sourcesOf('cargo', { idleHours: 3 }, { idleHours: 3 })).toEqual({ idleHours: 'config' })
  expect(sourcesOf('cargo', { enabled: true }, { idleHours: 3 })).toEqual({
    enabled: 'config',
    idleHours: 'shared',
  })
  expect(sourcesOf('cargo', { idleHours: undefined }, { idleHours: 3 })).toEqual({
    idleHours: 'shared',
  })
  expect(sourcesOf('cargo', {})).toEqual({})
  // git has no idleHours setting.
  expect(sourcesOf('git', {}, { idleHours: 3 })).toEqual({})
})
