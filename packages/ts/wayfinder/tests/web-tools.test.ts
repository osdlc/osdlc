// @vitest-environment jsdom
/**
 * Tool info and per-tool trust in the web view: what the runner info and the
 * settings' runner rows say about a tool, and the grant and revoke of one
 * tool's trust, with the same confirmation a repository grant has.
 */
import { mountPage } from './dom.ts'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CATALOG_SCHEMA_VERSION } from '@osdlc/system-model/detect'

import { withheldLabel } from '../src/vocabulary.ts'
import {
  loadTools,
  setTokenForTest,
  toolTrustQuestion,
  trustTool,
  untrustTool,
  type ConfigView,
} from '../src/web/api.ts'
import { handleSettingsClick, openSettings } from '../src/web/settings.ts'
import { $, state, type CatalogDocument, type ToolInfo } from '../src/web/state.ts'
import { showRunnerInfo } from '../src/web/view.ts'

const MISE: ToolInfo = {
  id: 'mise',
  homepage: 'https://mise.jdx.dev',
  description: 'A tool manager <and> task runner.',
  ecosystem: null,
  language: 'any language',
}

function catalog(over: Partial<CatalogDocument> = {}): CatalogDocument {
  return {
    kind: 'catalog',
    schemaVersion: CATALOG_SCHEMA_VERSION,
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: [
      {
        runner: 'mise',
        status: 'ok',
        chain: [{ label: 'task', hint: 'The task name.' }],
        tasks: [],
        skippedForExec: true,
        diagnostics: [],
      },
    ],
    ...over,
  }
}

function config(): ConfigView {
  return {
    settings: [{ key: 'allowExec', value: true, source: 'default' }],
    locations: [
      { layer: 'user', path: '/home/.config/wayfinder/config.json', exists: false },
      { layer: 'project', path: '/repo/wayfinder.config.json', exists: false },
    ],
    trusted: false,
    trustedBy: null,
  }
}

const WAITING = {
  kind: 'withheld' as const,
  runner: 'mise',
  reason: 'tool-untrusted' as const,
  missing: ['mise'],
  label: withheldLabel('tool-untrusted', ['mise']),
}

/** Resolve the microtasks the settings' async handlers run on. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  mountPage()
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  setTokenForTest('t')
  state.catalog = catalog()
  state.unknowns = []
  state.trustable = false
  state.tools = []
  state.fingerprint = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tool info', () => {
  test('loadTools reads way providers', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        return Response.json({
          providers: [{ ...MISE, roles: ['runner'], kind: 'exec', binary: 'mise', onPath: true }],
        })
      }),
    )
    await loadTools()
    expect(urls).toEqual(['/api/commands/providers'])
    expect(state.tools).toEqual([MISE])
  })

  test('a failed read leaves the tools empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'no' }, { status: 500 })),
    )
    await loadTools()
    expect(state.tools).toEqual([])
  })

  test('the runner info shows the description, language and homepage link', () => {
    state.tools = [MISE]
    showRunnerInfo('mise')
    const body = $('help-body')
    expect(body.querySelector('.tool-desc')!.textContent).toBe(MISE.description)
    expect(body.querySelector('.tool-facts')!.textContent).toContain('any language')
    const link = body.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://mise.jdx.dev')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('names the ecosystem beside the language', () => {
    state.tools = [{ ...MISE, ecosystem: 'node', language: 'JavaScript' }]
    showRunnerInfo('mise')
    expect($('help-body').querySelector('.tool-facts')!.textContent).toContain('JavaScript')
  })

  test('a homepage that is not http or https is not a link', () => {
    state.tools = [{ ...MISE, homepage: 'javascript:alert(1)' }]
    showRunnerInfo('mise')
    expect($('help-body').querySelector('a')).toBeNull()
    expect($('help-body').innerHTML).not.toContain('javascript:')
  })

  test('escapes a custom tool description', () => {
    state.tools = [{ ...MISE, description: '<img src=x onerror=alert(1)>' }]
    showRunnerInfo('mise')
    expect($('help-body').querySelector('img')).toBeNull()
  })

  test("the settings' runner rows carry the same info", () => {
    state.tools = [MISE, { ...MISE, id: 'just', homepage: 'file:///etc/passwd' }]
    const html = openSettings(config(), ['mise', 'just'])
    document.getElementById('settings-body')!.innerHTML = html
    const links = [...document.querySelectorAll('#settings-body .set-table a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://mise.jdx.dev'])
    expect(html).toContain('A tool manager &lt;and&gt; task runner.')
    expect(html).not.toContain('file:')
  })
})

describe('per-tool trust in settings', () => {
  test('lists the tools trusted on their own, each with Untrust', () => {
    state.catalog = catalog({ trustedTools: ['mise'] })
    const html = openSettings(config(), ['mise'])
    expect(html).toContain('trusted on its own')
    expect(html).toContain('data-untrust-tool="mise"')
  })

  test('names a withheld runner with the tool it is missing and offers that grant', () => {
    state.unknowns = [WAITING]
    state.trustable = true
    const html = openSettings(config(), ['mise'])
    expect(html).toContain('withheld: mise is not trusted')
    expect(html).toContain('data-trust-tool="mise"')
  })

  test('offers no grant when a grant would change nothing', () => {
    state.unknowns = [WAITING]
    state.trustable = false
    expect(openSettings(config(), ['mise'])).not.toContain('data-trust-tool')
  })

  test('has no Tools part with nothing trusted or missing', () => {
    expect(openSettings(config(), ['mise'])).not.toContain('<h4>Tools</h4>')
  })
})

describe('granting and revoking a tool', () => {
  const calls: { url: string; body: unknown; confirm: string | null }[] = []
  let grantAnswer: () => Response

  beforeEach(() => {
    calls.length = 0
    grantAnswer = () => Response.json({ action: 'trust', changed: true, roots: [] })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const headers = new Headers(init.headers)
        const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
        calls.push({ url, body, confirm: headers.get('x-confirm') })
        if (url.endsWith('/trust') && body['untrust'] === true) {
          return body['scope'] === 'gone'
            ? Response.json({ message: 'no marker to remove' }, { status: 422 })
            : Response.json({ action: 'untrust', changed: true, roots: [] })
        }
        if (url.endsWith('/trust') && body['show'] === true) {
          return Response.json({ roots: [{ trusted: false, by: null }] })
        }
        if (url.endsWith('/trust')) {
          return headers.get('x-confirm') === null
            ? Response.json({ message: 'confirm first', nonce: 'n1' }, { status: 428 })
            : grantAnswer()
        }
        if (url.endsWith('/config/list')) return Response.json(config())
        return Response.json(catalog({ trustedTools: ['mise'] }))
      }),
    )
  })

  const trustCalls = () => calls.filter((c) => c.url.endsWith('/trust'))

  test('asks, then sends the same grant again with the nonce', async () => {
    const asked: string[] = []
    const result = await trustTool('mise', (q) => (asked.push(q), true))
    expect(result).toEqual({ ok: true })
    expect(asked).toEqual([toolTrustQuestion('mise')])
    expect(trustCalls()).toEqual([
      { url: '/api/commands/trust', body: { scope: 'mise' }, confirm: null },
      { url: '/api/commands/trust', body: { scope: 'mise' }, confirm: 'n1' },
    ])
    // The catalog is read again, now with the tool trusted.
    expect(calls.at(-1)!.url).toBe('/api/commands/list')
    expect(state.catalog?.trustedTools).toEqual(['mise'])
  })

  test('sends nothing more when the person declines', async () => {
    const result = await trustTool('mise', () => false)
    expect(result).toEqual({ ok: false, declined: true, detail: 'not confirmed' })
    expect(trustCalls()).toHaveLength(1)
  })

  test('reports a refused confirmation', async () => {
    grantAnswer = () =>
      Response.json({ message: 'the confirmation is not valid; ask again' }, { status: 403 })
    const result = await trustTool('mise', () => true)
    expect(result).toEqual({
      ok: false,
      declined: false,
      detail: 'the confirmation is not valid; ask again',
    })
  })

  test('revokes with --untrust --scope', async () => {
    expect(await untrustTool('mise')).toEqual({ ok: true })
    expect(trustCalls()).toEqual([
      { url: '/api/commands/trust', body: { untrust: true, scope: 'mise' }, confirm: null },
    ])
  })

  test('a revoke the server refuses says why', async () => {
    expect(await untrustTool('gone')).toEqual({ ok: false, detail: 'no marker to remove' })
  })

  test("the settings' Trust button grants after the confirm and says so", async () => {
    vi.stubGlobal('confirm', () => true)
    state.unknowns = [WAITING]
    state.trustable = true
    document.getElementById('settings-body')!.innerHTML = openSettings(config(), ['mise'])
    handleSettingsClick(document.querySelector('[data-trust-tool="mise"]') as HTMLElement)
    await settle()
    expect(trustCalls().filter((c) => c.confirm === 'n1')).toHaveLength(1)
    expect(document.querySelector('.set-notice')!.textContent).toContain('Trusted mise.')
  })

  test("the settings' Untrust button revokes and says so", async () => {
    state.catalog = catalog({ trustedTools: ['mise'] })
    document.getElementById('settings-body')!.innerHTML = openSettings(config(), ['mise'])
    handleSettingsClick(document.querySelector('[data-untrust-tool="mise"]') as HTMLElement)
    await settle()
    expect(trustCalls()[0]!.body).toEqual({ untrust: true, scope: 'mise' })
    expect(document.querySelector('.set-notice')!.textContent).toContain('Untrusted mise.')
  })

  test("the settings' Untrust button shows a refusal", async () => {
    state.catalog = catalog({ trustedTools: ['gone'] })
    document.getElementById('settings-body')!.innerHTML = openSettings(config(), [])
    handleSettingsClick(document.querySelector('[data-untrust-tool="gone"]') as HTMLElement)
    await settle()
    const notice = document.querySelector('.set-notice')!
    expect(notice.getAttribute('data-kind')).toBe('err')
    expect(notice.textContent).toBe('untrust gone failed: no marker to remove')
  })
})
