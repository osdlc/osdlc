---
title: Interaction specs
sidebar:
  order: 3
description: Drive a story from a plain Playwright test against the static build.
---

An interaction spec is a normal Playwright test. It opens one story from the built Storybook,
uses the component, and checks the result. The harness gives you the config and the page
setup, so every spec starts from the same, deterministic page.

## The config

```ts
// playwright.e2e.config.ts
import { defineStoryConfig } from '@osdlc/story-harness/playwright'

export default defineStoryConfig({ port: 6106, mode: 'e2e' })
```

That one call sets up:

| Setting | Value |
|---|---|
| Specs | `tests-stories/**/*.e2e.ts` (`testDir` changes the folder) |
| Server | Serves `storybook-static/` on `127.0.0.1:6106` while the tests run (`storybookDir` changes the folder) |
| Browser | Chromium, 1440x900, `en-US`, timezone UTC |
| Parallelism | Every test in parallel, no retries |
| Output | `test-results/playwright-e2e/` |

Run it after building the Storybook:

```sh
npm run storybook:build
npx playwright test -c playwright.e2e.config.ts
```

## A spec

```ts
// tests-stories/search.e2e.ts
import { expect, test } from '@playwright/test'
import { openStory, preparePage } from '@osdlc/story-harness/playwright'

test('typing filters the list', async ({ page, baseURL }) => {
  await preparePage(page) // before the first navigation
  await openStory(page, baseURL!, 'search-box--with-results', 'light')

  await page.getByRole('searchbox').fill('app')
  await expect(page.getByRole('option')).toHaveText(['apple', 'apricot'])
})
```

### `preparePage(page, options?)`

Call it once per page, before the first navigation. It:

- starts Playwright's clock at a fixed time (`START_TIME`, 2026-09-28 12:00 UTC), so "3 days
  ago" renders the same every run;
- seeds `Math.random`, so generated ids and fixture data are stable;
- listens for Storybook's error events, which `openStory` checks.

Pass `{ clock: false }` in perf specs. The fake clock also fakes `performance.now()`, timers
and animation frames, which would make every measurement meaningless.

### `openStory(page, baseURL, id, theme, options?)`

Opens one story and waits until it is ready: the story and its `play` finished, fonts
loaded, the network went idle, and the settle time passed (default 1500 ms, or the story's
`parameters.screenshot.settleMs`). It throws if the story failed. Pass
`{ onStoryError: (message) => … }` to collect the error instead of throwing.

It returns the story's `parameters.screenshot`. For a story marked `skip`, it returns as soon
as the story has rendered, without the error check or the waits.

## Useful exports

| Export | Value |
|---|---|
| `storyUrl(baseURL, id, theme)` | The story's iframe URL, for a spec that navigates itself |
| `THEMES` | `['light', 'dark']`, to run a spec in both |
| `VIEWPORT`, `NARROW_VIEWPORT` | `{ width: 1440, height: 900 }` and `{ width: 1024, height: 720 }` |
| `START_TIME`, `DEFAULT_SETTLE_MS` | The fixed clock time and the default settle wait |

Running a spec in both themes:

```ts
import { openStory, preparePage, THEMES } from '@osdlc/story-harness/playwright'

for (const theme of THEMES) {
  test(`the menu opens with the keyboard (${theme})`, async ({ page, baseURL }) => {
    await preparePage(page)
    await openStory(page, baseURL!, 'menu--default', theme)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
  })
}
```
