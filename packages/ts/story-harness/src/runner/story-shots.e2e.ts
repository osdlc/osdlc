/**
 * One test per story and theme: open the story, shoot the viewport, compare it
 * with the committed baseline. A story with `parameters.screenshot.narrow`
 * is shot a second time at the narrow viewport.
 *
 * Run through the `story-shots` command, never directly: the baselines are Linux PNGs
 * made in the Playwright container, and the script sets the environment this
 * file reads.
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  isNarrowOnly,
  NARROW_VIEWPORT,
  openStory,
  type OpenStoryOptions,
  preparePage,
  selectStories,
  splitList,
  THEMES,
} from './story.ts'

const storybookDir = process.env.STORYBOOK_DIR
if (!storybookDir) throw new Error('STORYBOOK_DIR is not set; run through the story-shots command')
// Unset: openStory's own default (DEFAULT_SETTLE_MS) applies.
const openOptions: OpenStoryOptions = process.env.SETTLE_MS
  ? { settleMs: Number(process.env.SETTLE_MS) }
  : {}

const index = JSON.parse(readFileSync(join(storybookDir, 'index.json'), 'utf8'))
const ids = selectStories(index, {
  include: splitList(process.env.STORY_INCLUDE),
  exclude: splitList(process.env.STORY_EXCLUDE),
})

// Each baseline this run shoots, one name per line, so --update can delete the
// baselines of stories that are gone. Workers append short lines, which do not
// interleave.
const shotsList = process.env.SHOTS_LIST
const shoot = async (page: Page, name: string) => {
  await expect(page).toHaveScreenshot(name)
  if (shotsList) appendFileSync(shotsList, `${name}\n`)
}

for (const id of ids) {
  for (const theme of THEMES) {
    test(`${id} ${theme}`, async ({ page, baseURL }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))
      await preparePage(page)

      if (isNarrowOnly(id)) await page.setViewportSize(NARROW_VIEWPORT)
      const params = await openStory(page, baseURL!, id, theme, openOptions)
      test.skip(!!params.skip, params.skip)
      // A shot of a crashed story is worse than none, and in update mode the
      // shot would already be written as a baseline.
      expect(pageErrors, 'page errors').toEqual([])
      await shoot(page, `${id}--${theme}.png`)

      if (params.narrow && !isNarrowOnly(id)) {
        await page.setViewportSize(NARROW_VIEWPORT)
        await openStory(page, baseURL!, id, theme, openOptions)
        expect(pageErrors, 'page errors').toEqual([])
        await shoot(page, `${id}--${theme}--narrow.png`)
      }
    })
  }
}
