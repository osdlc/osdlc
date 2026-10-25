/**
 * The terminal UI, captured as text.
 *
 * `frame()` returns the whole screen as a string, so the committed artifact is
 * that string. An image diff says "these pixels moved", where a reader wants
 * "this column moved two characters".
 *
 * The file has two uses:
 *
 *   1. Documentation. `tests/frames/*.txt` shows what the terminal UI looks
 *      like, can be quoted in the guide, and is readable in a pull request.
 *   2. A regression test. It asserts by default. A change that moves the
 *      layout fails here and shows exactly which line moved, which a set of
 *      screenshots cannot do.
 *
 * Regenerate after an intended change:
 *
 *     CAPTURE_FRAMES=1 pnpm exec vitest run tests/frames.test.ts
 *
 * The catalog is written out rather than detected. See
 * `fixtures/showcase-catalog.ts`. These assert in CI, so their input has to be
 * the same everywhere, and collecting from the fixture is not: `just`'s
 * parameters need `just --dump`, and a runner without the binary sees none.
 *
 * The UI is made with plain styles, as for a stream that is not a terminal,
 * so the committed text has no color or attributes. Every state still shows
 * through a text mark, which is also what a reader compares by eye.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { orderedCatalog } from '../src/catalog.ts'
import type { Tui } from '../src/tui/app.ts'
import { showcaseCatalog } from './fixtures/showcase-catalog.ts'
import { cleanupAll, testTui } from './tui-support.ts'

const FRAMES = fileURLToPath(new URL('./frames', import.meta.url))
const CAPTURING = process.env['CAPTURE_FRAMES'] === '1'

/** A fixed terminal, so a frame changes only when the UI does. */
const WIDTH = 78
const HEIGHT = 22

let tui: Tui

beforeAll(async () => {
  ;({ tui } = await testTui())
  const catalog = showcaseCatalog()
  // Ordered explicitly: a catalog's own order is provider-registration order,
  // and a frame that depended on it would churn whenever a provider was added
  // anywhere in the library.
  tui.state.catalog = orderedCatalog(catalog, [])
  tui.state.probed = true
  tui.state.cache = catalog.reports.map((r) => ({
    runner: r.runner,
    state: 'fresh' as const,
    estimateMs: null,
    slow: false,
  }))
})
afterAll(cleanupAll)

/**
 * Compare against the committed frame, or rewrite it under CAPTURE_FRAMES=1.
 *
 * Escape sequences are stripped: the frame's own cursor and clear sequences
 * are real output and invisible, and a committed file full of them would be
 * unreadable.
 */
function checkFrame(name: string): void {
  const rendered = tui
    .frame(WIDTH, HEIGHT)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // The status line's clock is `toLocaleTimeString`, so even a pinned
    // instant renders differently in another timezone. Padded to the width
    // it replaces so the columns after it do not shift.
    .replace(/checked \d{1,2}:\d{2}:\d{2}(\s?[AP]M)?/, 'checked HH:MM:SS   ')
  const file = join(FRAMES, `${name}.txt`)
  if (CAPTURING) {
    mkdirSync(FRAMES, { recursive: true })
    writeFileSync(file, rendered, 'utf-8')
    return
  }
  if (!existsSync(file)) {
    throw new Error(
      `no committed frame for ${name}. Run: CAPTURE_FRAMES=1 pnpm exec vitest run tests/frames.test.ts`,
    )
  }
  expect(rendered).toBe(readFileSync(file, 'utf-8'))
}

/** Back to the list as it opens. */
function reset(): void {
  const s = tui.state
  s.query = ''
  s.runner = 'all'
  s.servicesOnly = false
  s.selectedId = null
  s.entering = null
  s.scroll = 0
  s.view = 'list'
  s.settings = null
  s.message = null
  tui.recompute()
}

describe('the terminal UI, frame by frame', () => {
  test('the list, as it opens', () => {
    reset()
    checkFrame('list')
  })

  test('a query narrowing the list', () => {
    reset()
    tui.state.query = 'dep'
    tui.recompute()
    checkFrame('query')
  })

  test('the services filter', () => {
    reset()
    tui.state.servicesOnly = true
    tui.recompute()
    checkFrame('services')
  })

  test('the settings screen', async () => {
    // Read from the throwaway repository and HOME, with the file paths
    // pinned, since they are temporary directories.
    reset()
    tui.handle(',')
    await tui.idle()
    const screen = tui.state.settings!
    expect(screen).not.toBeNull()
    screen.settings.loaded.locations.project = '/repo/wayfinder.config.json'
    screen.settings.loaded.locations.user = '~/.config/wayfinder/config.json'
    checkFrame('settings')
    reset()
  })

  test('the help screen', () => {
    reset()
    tui.handle('?')
    checkFrame('help')
    reset()
  })

  test('the argument entry line for a parameterised recipe', () => {
    reset()
    const parameterised = tui.state.rows.find((r) => r.task.parameters.length > 0)
    // Checked rather than assumed: this frame exists to show the entry line,
    // and saving the plain list under its name would be wrong with no warning.
    expect(parameterised).toBeDefined()
    tui.state.selectedId = parameterised!.task.id
    tui.handle('\r')
    for (const ch of 'staging') tui.handle(ch)
    expect(tui.state.entering?.text).toBe('staging')
    checkFrame('entry-line')
    reset()
  })
})
