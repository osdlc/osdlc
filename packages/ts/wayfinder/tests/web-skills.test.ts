// @vitest-environment jsdom
/**
 * The Skills group in the web view: its tab, its rows, the search over them,
 * and what Run and Copy do on one. A skill has no command line, so both
 * copy `/<name>` and nothing is sent to `/run`.
 */
import { mountPage } from './dom.ts'

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { CATALOG_SCHEMA_VERSION, type Task } from '@osdlc/system-model/detect'

import type { SkillRow } from '../src/core/skills.ts'
import { wireInput } from '../src/web/input.ts'
import { $, SKILLS, state, type CatalogDocument } from '../src/web/state.ts'
import { render } from '../src/web/view.ts'

function task(name: string): Task {
  return {
    id: `just:${name}`,
    runner: 'just',
    path: ['just', name],
    argv: ['just', name],
    cwd: '.',
    display: `just ${name}`,
    parameters: [],
    source: 'justfile',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}

function skill(name: string, over: Partial<SkillRow> = {}): SkillRow {
  return {
    id: `skill:.claude/skills/${name}/SKILL.md`,
    name,
    description: `About ${name}.`,
    argumentHint: null,
    path: `.claude/skills/${name}/SKILL.md`,
    scope: 'project',
    origin: 'project',
    harnesses: ['claude'],
    invoke: `/${name}`,
    ...over,
  }
}

function catalog(skills: SkillRow[]): CatalogDocument {
  return {
    kind: 'catalog',
    schemaVersion: CATALOG_SCHEMA_VERSION,
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: [
      {
        runner: 'just',
        status: 'ok',
        chain: [{ label: 'recipe', hint: 'The recipe name.' }],
        tasks: [task('build'), task('lint')],
        skippedForExec: false,
        diagnostics: [],
      },
    ],
    skills,
  }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

const SKILL_ROWS = '#out tr[data-skill]'

const CLIPBOARD = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
const nativeFetch = globalThis.fetch
afterAll(() => {
  if (CLIPBOARD) Object.defineProperty(globalThis.navigator, 'clipboard', CLIPBOARD)
  else delete (globalThis.navigator as unknown as { clipboard?: unknown }).clipboard
  globalThis.fetch = nativeFetch
})

const copied: string[] = []
const fetched: string[] = []

beforeAll(() => {
  mountPage()
  wireInput()
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) },
    configurable: true,
  })
  globalThis.fetch = vi.fn(async (url: string) => {
    fetched.push(String(url))
    return Response.json({ kind: 'error', message: 'no' }, { status: 500 })
  }) as never
})

beforeEach(() => {
  copied.length = 0
  fetched.length = 0
  state.catalog = catalog([
    skill('review', { argumentHint: '[pr-number]', harnesses: ['claude', 'codex'] }),
    skill('deploy-notes'),
  ])
  state.query = ''
  state.mode = 'fuzzy'
  state.servicesOnly = false
  state.runner = 'all'
  state.collapsed = new Set()
  state.enabled = null
  state.focusedId = null
  render()
})

describe('the Skills tab', () => {
  test('follows the runner tabs under its group label, with the skill count', () => {
    const tab = $('tabs').querySelector(`button[data-runner="${SKILLS}"]`)!
    expect(tab.textContent).toBe('Skills2')
    expect(tab.hasAttribute('draggable')).toBe(false)
    const labels = [...$('tabs').querySelectorAll('.tabgroup')].map((e) => e.textContent)
    expect(labels.at(-1)).toBe('Skills')
  })

  test('is not offered in the runner picker', () => {
    expect($('pickerhost').querySelector(`[data-toggle-runner="${SKILLS}"]`)).toBeNull()
  })

  test('is absent when the catalog has no skills', () => {
    state.catalog = catalog([])
    render()
    expect($('tabs').querySelector(`button[data-runner="${SKILLS}"]`)).toBeNull()
  })

  test('shows only the skills, with the skill count on the status line', () => {
    state.runner = SKILLS
    render()
    expect(document.querySelectorAll('#out tbody tr')).toHaveLength(2)
    expect(document.querySelectorAll(SKILL_ROWS)).toHaveLength(2)
    expect($('status').textContent).toContain('2 of 2 skills')
  })

  test('falls back to all when the skills go away', () => {
    state.runner = SKILLS
    state.catalog = catalog([])
    render()
    expect(state.runner).toBe('all')
  })
})

describe('a skill row', () => {
  test('shows the /name line, the harnesses and the description', () => {
    const row = document.querySelector(SKILL_ROWS)!
    expect(row.querySelector('td.name')!.textContent).toBe('/review [pr-number]')
    expect([...row.querySelectorAll('.skill-for')].map((e) => e.textContent)).toEqual([
      'claude',
      'codex',
    ])
    expect(row.querySelector('td.run')!.textContent).toContain('About review.')
    expect(row.querySelector('.runbtn')).toBeNull()
  })

  test('sits in its own group after the runners in the combined tree', () => {
    const heads = [...document.querySelectorAll('#out .node > .head .seg-name')].map(
      (e) => e.textContent,
    )
    expect(heads.at(-1)).toBe('Skills')
  })

  test('escapes repository text', () => {
    state.catalog = catalog([
      skill('x', {
        description: '<img src=x onerror=alert(1)>',
        argumentHint: '<b>hint</b>',
        harnesses: ['<i>h</i>'],
      }),
    ])
    render()
    const row = document.querySelector(SKILL_ROWS)!
    expect(row.querySelector('img, b, i')).toBeNull()
    expect(row.querySelector('td.run')!.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(row.querySelector('td.name')!.textContent).toBe('/x <b>hint</b>')
  })
})

describe('the search', () => {
  test('ranks skills with the tasks and marks the matched name', () => {
    state.query = 'review'
    render()
    const rows = document.querySelectorAll('#out tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.hasAttribute('data-skill')).toBe(true)
    expect(rows[0]!.querySelector('td.name mark')!.textContent).toBe('review')
  })

  test('matches a description', () => {
    state.query = 'About deploy'
    render()
    expect(
      [...document.querySelectorAll(SKILL_ROWS)].map(
        (r) => r.querySelector('td.name')!.textContent,
      ),
    ).toEqual(['/deploy-notes'])
  })

  test('Services hides every skill', () => {
    state.servicesOnly = true
    render()
    expect(document.querySelectorAll(SKILL_ROWS)).toHaveLength(0)
  })

  test("a runner's tab shows no skills", () => {
    state.runner = 'just'
    render()
    expect(document.querySelectorAll(SKILL_ROWS)).toHaveLength(0)
    expect(document.querySelectorAll('#out tbody tr')).toHaveLength(2)
  })
})

describe('Run and Copy on a skill', () => {
  test('Copy puts /name on the clipboard and sends nothing', async () => {
    const copy = document.querySelector(`${SKILL_ROWS} .copy`) as HTMLElement
    copy.click()
    await settle()
    expect(copied).toEqual(['/review'])
    expect(copy.textContent).toBe('copied')
    expect(fetched).toEqual([])
  })

  test('Shift+Enter on a skill row copies /name and never posts /run', async () => {
    const row = document.querySelector(SKILL_ROWS) as HTMLElement
    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
    await settle()
    expect(copied).toEqual(['/review'])
    expect(fetched.filter((u) => u.includes('/run'))).toEqual([])
  })

  test('Shift+Enter in the search box copies the top skill hit', async () => {
    state.query = 'deploy'
    render()
    $('q').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    )
    await settle()
    expect(copied).toEqual(['/deploy-notes'])
    expect(fetched).toEqual([])
  })

  test('a skill name with a control character is not copied, by Copy or Shift+Enter', async () => {
    state.catalog = catalog([skill('ok', { invoke: '/ok\u001b[201~\necho PWNED\n' })])
    render()
    const copy = document.querySelector(`${SKILL_ROWS} .copy`) as HTMLButtonElement
    expect(copy.disabled).toBe(true)
    copy.click()
    const row = document.querySelector(SKILL_ROWS) as HTMLElement
    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
    await settle()
    expect(copied).toEqual([])
    expect(copy.textContent).toBe('refused')
  })

  test('a refused clipboard write says blocked', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    })
    const copy = document.querySelector(`${SKILL_ROWS} .copy`) as HTMLElement
    copy.click()
    await settle()
    expect(copy.textContent).toBe('blocked')
    expect(fetched).toEqual([])
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) },
      configurable: true,
    })
  })
})
