// @vitest-environment jsdom
/**
 * What the Execution section claims about this session.
 *
 * The section reads two independent facts — the trust STORE, and whether a
 * grant would change this run — and neither of them is "is execution on right
 * now". Untrusting mid-session makes the store say no while the process keeps
 * the gate it started with, and the screen has to say that rather than assert
 * the opposite.
 */
import { mountPage } from './dom.ts'

import { beforeEach, describe, expect, test } from 'vitest'

import { openSettings } from '../src/web/settings.ts'
import { state } from '../src/web/state.ts'
import type { ConfigResponse } from '../src/web/api.ts'

function config(over: Partial<ConfigResponse>): ConfigResponse {
  return {
    effective: {},
    project: null,
    user: null,
    sources: {},
    locations: {
      project: '/repo/wayfinder.config.json',
      user: '/home/.config/wayfinder/config.json',
    },
    warnings: [],
    trusted: false,
    trustable: false,
    ...over,
  } as ConfigResponse
}

describe('the Execution section', () => {
  beforeEach(() => {
    mountPage()
    state.catalog = null
  })

  test('does not claim execution is off while this session is still running probes', () => {
    // After Untrust: the store says no, the hint is gone (so a re-grant would
    // change nothing and is not offered), and the gate this process resolved
    // is still on.
    state.catalog = { allowExec: true, reports: [] } as never
    const html = openSettings(config({ trusted: false, trustable: false }), [])

    expect(html).not.toContain('Execution is off for this project')
    expect(html).toContain('this session')
  })

  test('makes no promise about what restarting would do', () => {
    // The page cannot tell the two ways execution can be on without trust
    // apart: untrusted mid-session, and `--exec` on a repository that was
    // never trusted. Restarting drops the gate in the first and keeps it in
    // the second, so the section must not prescribe one.
    state.catalog = { allowExec: true, reports: [] } as never
    const html = openSettings(config({ trusted: false, trustable: false }), [])

    expect(html).not.toContain('start wayfinder again')
  })

  test('still says execution is off when it really is', () => {
    state.catalog = { allowExec: false, reports: [] } as never
    const html = openSettings(config({ trusted: false, trustable: false }), [])
    expect(html).toContain('Execution is off for this project')
  })

  test('a trusted repository reads as trusted, and offers the way back', () => {
    state.catalog = { allowExec: true, reports: [] } as never
    const html = openSettings(config({ trusted: true, trustable: false }), [])
    expect(html).toContain('This repository is trusted')
    expect(html).toContain('data-untrust-repo')
  })
})
