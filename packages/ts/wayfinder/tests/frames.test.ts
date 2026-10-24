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
 * Colour is stripped. `frame()` adds colour only when stdout is a TTY, and
 * under a test runner it is not. So the committed text is the NO_COLOR form,
 * which is also the form a reader can compare by eye.
 */

import { beforeAll, describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { orderedCatalog } from '../src/catalog.ts'

import { frame, recompute, state } from '../src/tui.ts'
import { showcaseCatalog } from './fixtures/showcase-catalog.ts'

const FRAMES = fileURLToPath(new URL('./frames', import.meta.url))
const CAPTURING = process.env['CAPTURE_FRAMES'] === '1'

/** A fixed terminal, so a frame changes only when the UI does. */
const WIDTH = 78
const HEIGHT = 22

beforeAll(() => {
  const catalog = showcaseCatalog()
  state.root = catalog.root
  // Ordered explicitly: a catalog's own order is provider-registration order,
  // and a frame that depended on it would churn whenever a provider was added
  // anywhere in the library.
  state.catalog = orderedCatalog(catalog, [])
  state.cache = catalog.reports.map((r) => ({
    runner: r.runner,
    state: 'fresh' as const,
    estimateMs: null,
    slow: false,
  }))
})

/**
 * Compare against the committed frame, or rewrite it under CAPTURE_FRAMES=1.
 *
 * The trailing clear-to-end-of-line escape is stripped: it is real output and
 * it is invisible, and a committed file full of `ESC[K` would be unreadable.
 */
function checkFrame(name: string): void {
  const rendered = frame(WIDTH, HEIGHT)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // The status line's clock is `toLocaleTimeString`, so even a pinned
    // instant renders differently in another timezone — a contributor in
    // Berlin would regenerate every frame for no reason. Padded to the width
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

describe('the terminal UI, frame by frame', () => {
  test('the list, as it opens', () => {
    state.query = ''
    state.runner = 'all'
    state.servicesOnly = false
    state.selectedId = null
    state.entering = null
    state.scroll = 0
    recompute()
    checkFrame('list')
  })

  test('a query narrowing the list', () => {
    state.query = 'dep'
    state.selectedId = null
    state.entering = null
    recompute()
    checkFrame('query')
  })

  test('the services filter', () => {
    state.query = ''
    state.servicesOnly = true
    state.selectedId = null
    state.entering = null
    recompute()
    checkFrame('services')
  })

  test('the settings screen', () => {
    // The lines are written out rather than produced by `settingsLines()`,
    // which reads `loadConfig` from disk, including the user layer under
    // `~/.config/wayfinder/`. A contributor who has one would get a different
    // screen, and this asserts in CI. The frame checks the layout: the screen
    // replaces the list, section headings stand out from their entries, and
    // the footer says it is read-only.
    state.query = ''
    state.servicesOnly = false
    state.entering = null
    recompute()
    state.settings = [
      'RUNNERS  (this project)',
      '  [x] just',
      '  [x] make',
      '  [ ] gradle   not collected',
      '  order: alphabetical  (default)',
      '',
      'EXECUTION  (trust store)',
      '  not trusted — runners that must be run to be read were skipped (^s to trust)',
      '  allowExec: false  (default)',
      '',
      'DISCOVERY  (default)',
      '  auto',
    ]
    checkFrame('settings')
    state.settings = null
  })

  test('the argument entry line for a parameterised recipe', () => {
    state.query = ''
    state.servicesOnly = false
    state.selectedId = null
    recompute()
    const parameterised = state.rows.find((r) => r.task.parameters.length > 0)
    // Checked rather than assumed: this frame exists to show the entry line,
    // and saving the plain list under its name would be wrong with no warning.
    expect(parameterised).toBeDefined()
    state.entering = { task: parameterised!.task, text: 'staging' }
    checkFrame('entry-line')
    state.entering = null
  })
})
