/**
 * One test per story, light theme only: Tab through the story from the start
 * of the document, then Shift+Tab back, and write what happened to
 * `<ARTIFACTS_DIR>/walk/<id>/walk.json` with a viewport screenshot per stop
 * (`walk.ts`). It is a walk, not a gate: findings never fail a test, only a
 * story that errors does. A story with `parameters.screenshot.skip` or
 * `parameters.walk.skip` is skipped.
 *
 * Run through `story-shots --walk`, never directly. `WALK_MAX` is the stop
 * limit per story (default 40).
 */
import { join } from 'node:path'
import { test } from '@playwright/test'
import {
  isNarrowOnly,
  NARROW_VIEWPORT,
  openStory,
  preparePage,
  storyParameters,
  storyRunEnv,
} from './story.ts'
import { DEFAULT_WALK_MAX, walkPage, type WalkParameters } from './walk.ts'

const { settleMs, ids } = storyRunEnv('--walk')
const max = Number(process.env.WALK_MAX ?? DEFAULT_WALK_MAX)
if (!Number.isInteger(max) || max < 1)
  throw new Error(`WALK_MAX must be a positive integer, got "${process.env.WALK_MAX}"`)
const walkDir = join(process.env.ARTIFACTS_DIR ?? './test-results', 'walk')

for (const id of ids) {
  test(`${id} walk`, async ({ page, baseURL }) => {
    await preparePage(page)
    if (isNarrowOnly(id)) await page.setViewportSize(NARROW_VIEWPORT)
    const shot = await openStory(page, baseURL!, id, 'light', { settleMs })
    test.skip(!!shot.skip, shot.skip)
    const params = await storyParameters<WalkParameters>(page, 'walk')
    test.skip(!!params.skip, params.skip)

    const record = await walkPage(page, { id, outDir: join(walkDir, id), max })
    test.info().annotations.push({
      type: 'walk',
      description: `${record.stops.length} stops, ended ${record.end}`,
    })
  })
}
