---
title: Shots for documentation
sidebar:
  order: 5
description: PNGs of stories for a README or a design review, with no comparison.
---

Sometimes you want pictures, not a check: screenshots of a few stories for a README, a pull
request or a design review. `captureStories` writes them, using the same page setup as the
baseline check but on your own machine's browser, with nothing to compare against.

## A script

```ts
// scripts/capture-docs.ts
import { captureStories } from '@osdlc/story-harness/runner'

const ok = await captureStories({
  storybookDir: 'storybook-static',
  prefix: 'my-button--', // which stories; stripped from the file names
  outDir: 'docs/screenshots',
  port: 6107,
  themes: ['light', 'dark'],
  outLayout: 'by-theme',
})
if (!ok) process.exit(1)
```

With stories `my-button--primary` and `my-button--ghost`, it writes:

```text
docs/screenshots/
  primary/light.png
  primary/dark.png
  ghost/light.png
  ghost/dark.png
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `storybookDir` | (required) | The built Storybook |
| `prefix` | (required) | Story id prefix to capture; removed from file names |
| `outDir` | (required) | Where the PNGs go |
| `port` | (required) | Port for the static server while it runs |
| `contains` | none | Only ids that contain this text |
| `themes` | one shot: dark for an id containing `-dark`, else light | Shoot each story in each of these |
| `viewport` | 1440x900 (1024x720 for an id ending in `-narrow`) | One size for every shot |
| `outLayout` | `flat` | `flat`: `<name>.png`, or `<name>--<theme>.png` with several themes. `by-theme`: `<name>/<theme>.png` |

A story with `parameters.screenshot.narrow` also gets a `--narrow` shot, unless you set
`viewport`. A story marked `skip` is left out.

`captureStories` resolves `false` when no story matches, so a mistyped prefix fails, and when
any story failed or the page reported an error. It
still writes the failed story's shot, so a set of docs keeps its picture, and logs why.

## As a command

`captureCli` turns the same thing into a script that takes flags, with your package's
defaults:

```ts
// scripts/capture-docs.ts
import { fileURLToPath } from 'node:url'

import { captureCli } from '@osdlc/story-harness/runner'

await captureCli({
  packageDir: fileURLToPath(new URL('..', import.meta.url)),
  prefix: 'my-button--',
  out: 'docs/screenshots',
  port: 6107,
})
```

Node 22.18 or later runs a `.ts` file directly; on an older Node 22, add
`--experimental-strip-types`.

```sh
node scripts/capture-docs.ts            # every my-button story
node scripts/capture-docs.ts primary    # only ids containing "primary"
node scripts/capture-docs.ts --out /tmp/shots --port 7000
```

It reads `<packageDir>/storybook-static`, and exits 1 on a failure.

## Serving a build yourself

`serveStatic(dir, port)` serves a static build on `127.0.0.1` only. A path outside `dir` gets a
404, and so does a missing file, so a story that loads a missing asset shows the error. A
directory serves its `index.html`. Use it for a script that drives its
own browser:

```ts
import { chromium } from '@playwright/test'
import { serveStatic } from '@osdlc/story-harness/runner'

const close = await serveStatic('storybook-static', 6107)
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:6107/iframe.html?id=my-button--primary&viewMode=story')
  await page.screenshot({ path: 'primary.png' })
} finally {
  await browser.close()
  close()
}
```

It rejects if the port is taken. Use a fixed port: the function does not tell you which port
it bound.

## Picking stories

`selectStories(index, filter)` lists the story ids of a build's `index.json`, in order, with
docs pages left out. Use it to check that a filter matches anything before you start a long
capture:

```ts
import { readFileSync } from 'node:fs'
import { selectStories } from '@osdlc/story-harness/runner'

const index = JSON.parse(readFileSync('storybook-static/index.json', 'utf8'))
selectStories(index, { include: ['my-button--'], exclude: ['my-button--ghost'] })
// → ['my-button--primary']
```
