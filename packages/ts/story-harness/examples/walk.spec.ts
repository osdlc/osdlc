// The keyboard walk over one open page, as `story-shots --walk` does it for
// each story: Tab through the page and record every stop.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { DEFAULT_WALK_MAX, walkPage } from '@osdlc/story-harness/runner'

test('walkPage records the tab order', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'walk-example-'))
  try {
    await page.goto(
      `data:text/html,${encodeURIComponent('<button>First</button><a href="#x">Second</a>')}`,
    )
    const walk = await walkPage(page, { id: 'demo', outDir: dir, max: DEFAULT_WALK_MAX })
    expect(walk.stops.map((s) => s.name)).toEqual(['First', 'Second'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
