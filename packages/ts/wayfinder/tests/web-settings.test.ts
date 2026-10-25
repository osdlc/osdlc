// @vitest-environment jsdom
/**
 * The settings screen: what the Execution section claims, the read-only
 * settings, and what Save says it wrote.
 */
import { mountPage } from './dom.ts'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { setTokenForTest, type ConfigView } from '../src/web/api.ts'
import { commit, handleSettingsClick, openSettings } from '../src/web/settings.ts'
import { state } from '../src/web/state.ts'

function config(over: Partial<ConfigView> = {}, settings: ConfigView['settings'] = []): ConfigView {
  return {
    settings: [
      { key: 'allowExec', value: true, source: 'default' },
      { key: 'discovery', value: 'auto', source: 'default' },
      ...settings,
    ],
    locations: [
      { layer: 'user', path: '/home/.config/wayfinder/config.json', exists: false },
      { layer: 'project', path: '/repo/wayfinder.config.json', exists: false },
    ],
    trusted: false,
    trustedBy: null,
    ...over,
  }
}

beforeEach(() => {
  mountPage()
  state.catalog = null
  state.trustable = false
})

describe('the Runners section', () => {
  test('lists runners by the name a person reads, and the default order in words', () => {
    state.catalog = { allowExec: true, reports: [] } as never
    const html = openSettings(config(), ['procfile', 'package-manager', 'node-scripts', 'just'])
    const names = [...html.matchAll(/<td><code>([^<]+)<\/code>/g)].map((m) => m[1])
    expect(names).toEqual(['dependencies', 'just', 'node-scripts', 'procfile'])
    expect(html).toContain('Order: alphabetical')
    expect(html).not.toContain('the default the default')
  })
})

describe('the Execution section', () => {
  test('says execution is off for this session when a grant would not change it', () => {
    state.catalog = { allowExec: false, reports: [] } as never
    const html = openSettings(config(), [])
    expect(html).toContain('Execution is off for this session')
    expect(html).not.toContain('data-trust-repo-settings')
  })

  test('offers the grant when trust is what is missing', () => {
    state.catalog = { allowExec: false, reports: [] } as never
    state.trustable = true
    const html = openSettings(config(), [])
    expect(html).toContain('This repository is not trusted')
    expect(html).toContain('data-trust-repo-settings')
  })

  test('makes no promise about what restarting would do', () => {
    state.catalog = { allowExec: true, reports: [] } as never
    const html = openSettings(config(), [])
    expect(html).not.toContain('start wayfinder again')
  })

  test('a repository trusted by marker offers Untrust', () => {
    state.catalog = { allowExec: true, reports: [] } as never
    const html = openSettings(config({ trusted: true, trustedBy: 'marker' }), [])
    expect(html).toContain('This repository is trusted')
    expect(html).toContain('data-untrust-repo')
  })

  test('a repository trusted by policy names the rule and has no Untrust', () => {
    state.catalog = { allowExec: true, reports: [] } as never
    const html = openSettings(config({ trusted: true, trustedBy: 'owner' }), [])
    expect(html).toContain('by your trust policy (owner)')
    expect(html).not.toContain('data-untrust-repo')
  })

  test('shows the effective allowExec, read-only, with its command', () => {
    const html = openSettings(
      { ...config(), settings: [{ key: 'allowExec', value: false, source: 'user' }] },
      [],
    )
    expect(html).toContain('<code>allowExec</code>: <code>false</code>')
    expect(html).toContain('way config set allowExec true --user')
    expect(html).not.toContain('data-set-key="allowExec"')
  })
})

describe('the command-line-only section', () => {
  test('shows trust settings with the commands that change them', () => {
    const html = openSettings(
      config({}, [{ key: 'trust.paths', value: ['~/work'], source: 'user' }]),
      [],
    )
    expect(html).toContain('Command line only')
    expect(html).toContain('trust.paths')
    expect(html).toContain('way trust')
    expect(html).not.toContain('data-set-key="trust.paths"')
  })
})

describe('Save', () => {
  const calls: { path: string; body: Record<string, unknown> }[] = []

  beforeEach(() => {
    calls.length = 0
    setTokenForTest('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
        calls.push({ path: url, body })
        if (url.endsWith('/config/set')) {
          if (body['key'] === 'excludePaths') {
            return Response.json({ kind: 'error', message: 'refused' }, { status: 400 })
          }
          const layer = body['user'] === true ? 'user' : 'project'
          const file =
            layer === 'user' ? '/home/.config/wayfinder/config.json' : '/repo/wayfinder.config.json'
          return Response.json({ key: body['key'], value: body['value'], layer, file })
        }
        if (url.endsWith('/config/list')) return Response.json(config())
        if (url.endsWith('/trust')) return Response.json({ roots: [{ trusted: false, by: null }] })
        return Response.json({ reports: [], generatedAt: 0, unknowns: [], cache: [] })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function click(selector: string): void {
    handleSettingsClick(document.querySelector(selector) as HTMLElement)
  }

  test('names each key and the file it was written to', async () => {
    document.getElementById('settings-body')!.innerHTML = openSettings(config(), [])
    click('[data-set-key="discovery"][data-set-value="walk"]')
    click('[data-set-key="theme"][data-set-value="dark"]')
    expect(document.querySelector('[data-settings-save]')!.textContent).toBe(
      'Save to the project file and your user config',
    )
    await commit()
    const sets = calls.filter((c) => c.path.endsWith('/config/set')).map((c) => c.body)
    expect(sets).toEqual([
      { key: 'discovery', value: '"walk"', project: true },
      { key: 'theme', value: '"dark"', user: true },
    ])
    const notice = document.querySelector('.set-notice')!.textContent
    expect(notice).toBe(
      'Saved discovery to /repo/wayfinder.config.json. ' +
        'Saved theme to /home/.config/wayfinder/config.json.',
    )
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  test('a refused write says what was not saved, and keeps it staged', async () => {
    document.getElementById('settings-body')!.innerHTML = openSettings(config(), [])
    click('[data-set-key="discovery"][data-set-value="git"]')
    ;(document.getElementById('set-path') as HTMLInputElement).value = 'vendor'
    click('[data-add-path]')
    await commit()
    const notice = document.querySelector('.set-notice')!
    expect(notice.getAttribute('data-kind')).toBe('err')
    expect(notice.textContent).toBe(
      'Saved discovery to /repo/wayfinder.config.json. Not saved: excludePaths: refused',
    )
    expect(document.querySelector('.set-dirty')!.textContent).toBe('1 unsaved')
  })
})
