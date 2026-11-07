---
title: Getting started
sidebar:
  order: 1
description: What the harness is for, its three parts, and setting up one component package.
---

You have a UI component package with a Storybook. Its stories already show every state the
component can be in. This package uses the **built** Storybook (`storybook-static/`) as the
test harness for that component:

- **Screenshot baselines.** Every story is shot in light and dark and compared with a PNG
  committed next to the code. A change that moves a pixel fails the check.
- **Interaction specs.** Plain Playwright tests open a story and drive it: click, type,
  press keys, and check the result.
- **Perf scenes.** A story renders a big case (10,000 rows, say), and a Playwright spec
  measures it: time to first rows, long tasks, rows kept mounted while scrolling. The
  numbers go into one JSON report, with a budget for each.

## Why not just use Playwright directly?

You can, and this package is plain Playwright underneath. It solves four problems you would
otherwise meet one at a time:

| Problem | What goes wrong | What the harness does |
|---|---|---|
| Fonts rasterise differently per OS | Baselines made on a Mac fail on Linux CI, so people raise the pixel tolerance until the check catches nothing | Shoots every baseline inside one pinned Linux container, so a laptop and CI produce the same pixels |
| A story's `play` throws, but Storybook still reports `success` | The check screenshots a broken story and passes | Listens for Storybook's error events and fails the story |
| Dates, random data and animations differ per run | Shots flicker between runs | Fixes the clock, seeds `Math.random`, waits for fonts and the network, then settles |
| Parallel Playwright workers each write perf numbers | Workers overwrite each other's results | Every write merges into one report under a lock |

## The three parts

| Import or command | Runs in | Use it for |
|---|---|---|
| `story-shots` (a command) | A Docker container | Screenshot baselines: check and update |
| `@osdlc/story-harness/browser` | The story's page | The perf metrics hook, and a seeded PRNG for fixture data |
| `@osdlc/story-harness/playwright` | Your Playwright specs | A config for specs against the static build, page setup, perf helpers and budgets |
| `@osdlc/story-harness/runner` | A Node script | PNGs for documentation, and a small static server |

## Set up a package

### 1. Install

```sh
npm install --save-dev @osdlc/story-harness @playwright/test
```

`@playwright/test` is a peer dependency, version 1.62 or later. The baseline check also needs
Docker and bash, on Linux or macOS.

### 2. Let Storybook switch themes from the URL

The harness opens each story twice, as
`iframe.html?id=<story id>&viewMode=story&globals=theme:light` and then with `theme:dark`.
Your Storybook reads the `theme` global and applies it. `@storybook/addon-themes` does this,
or a small decorator:

```ts
// .storybook/preview.ts
import type { Preview } from '@storybook/vue3'

const preview: Preview = {
  initialGlobals: { theme: 'light' },
  decorators: [
    (story, context) => {
      document.documentElement.dataset.theme = context.globals.theme
      return story()
    },
  ],
}
export default preview
```

### 3. Add two scripts

```json
{
  "scripts": {
    "storybook:build": "storybook build",
    "storybook:check": "story-shots . --include my-button-",
    "storybook:baseline": "story-shots . --update --include my-button-"
  }
}
```

`--include` takes story id prefixes. Leave it out to shoot every story in the build.

### 4. Make the first baselines

```sh
npm run storybook:build
npm run storybook:baseline
git add .storybook/baselines
```

This writes one PNG per story and theme, for example
`.storybook/baselines/my-button--primary--light.png`. Commit them.

### 5. Check on every change

```sh
npm run storybook:build
npm run storybook:check
```

When nothing moved, the output ends with `every shot matches its baseline`. When something
moved, it fails, and the expected, actual and diff images are in
`test-results/story-shots/`.

## Next

- [Screenshot baselines](./screenshot-baselines.md): the flags, story parameters, CI, and
  what to do when a check fails.
- [Interaction specs](./interaction-specs.md): drive a story from a Playwright test.
- [Perf scenes](./perf-scenes.md): measure a story and record budgets.
- [Shots for documentation](./docs-shots.md): PNGs for a README, with no comparison.
