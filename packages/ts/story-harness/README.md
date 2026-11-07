# @osdlc/story-harness

A component's static Storybook build, used as its test harness: exact
screenshot baselines, Playwright interaction specs, and perf scenes with
budgets, all run against `storybook-static/`.

**The problem.** Screenshot baselines made on a laptop do not match the ones CI
makes, because fonts rasterise differently on each platform. Perf numbers from
parallel Playwright workers overwrite each other. And a story whose `play`
throws still finishes with status `success`, so a check can shoot or measure
a broken story without noticing.

**What this package does about it.**

- `story-shots` shoots every story in light and dark inside the pinned
  Playwright image, always as `linux/amd64`, and compares each shot with a
  committed baseline at zero pixel tolerance. The same command gives the same
  answer on a laptop and in CI.
- `preparePage` and `openStory` make a page deterministic (fixed clock, seeded
  `Math.random`) and wait until a story is ready to shoot. They fail the story
  when Storybook reports an error from it or its `play`.
- `storyMetrics` (in the story) and the Playwright helpers (in the spec)
  measure first rows, long tasks, mounted rows and reply-to-paint. They write
  one JSON report that every worker merges into.

**Who it is for.** Teams that keep a Storybook per UI component package, and
want baselines, interaction specs and perf scenes for each package without
Chromatic or another hosted service.

**When not to use it.**

- You want hosted review of visual changes, with approvals in a web UI. Use
  Chromatic.
- You run interaction tests inside Storybook's own test runner, or as Vitest
  browser tests (`@storybook/addon-vitest`). This package drives a static
  build from plain Playwright specs, and does not replace those runners.
- You cannot run Docker. The baselines are made and checked only in the
  container. The Playwright helpers and the perf report work without it.
- You need Windows. The baseline check needs bash and Docker, and is
  supported on Linux and macOS.

## Install

```sh
npm install --save-dev @osdlc/story-harness @playwright/test
```

`@playwright/test` is a peer dependency (1.62 or later), so your specs and the
helpers share one copy. Node 22 or later. ESM only.

## Guide

Step-by-step pages with worked examples, in [`docs/guide/`](./docs/guide/):

| Page | Covers |
|---|---|
| [Getting started](./docs/guide/getting-started.md) | What each part is for, and setting up one component package |
| [Screenshot baselines](./docs/guide/screenshot-baselines.md) | `story-shots`, story parameters, CI, and reading a failed check |
| [Interaction specs](./docs/guide/interaction-specs.md) | Driving a story from a Playwright test |
| [Perf scenes](./docs/guide/perf-scenes.md) | Measuring a big story, budgets, and the report |
| [Shots for documentation](./docs/guide/docs-shots.md) | PNGs for a README, with no comparison |

## Screenshot baselines: `story-shots`

```sh
story-shots <package dir> [--update] [--include p1,p2] [--exclude p3] [--settle-ms N]
```

`<package dir>` holds the built `storybook-static/` (build it first) and the
baselines in `.storybook/baselines/`. Each story is shot as
`<story id>--<theme>.png`. `--include` and `--exclude` take story id prefixes.
`--update` writes the baselines instead of comparing, and deletes the
baselines of stories that no longer exist, among those the filter covers.
Commit what it writes. On a failure, the expected, actual and diff images are
in `<package dir>/test-results/story-shots/`.

A package enrols with two scripts:

```json
"storybook:check": "story-shots . --include my-component-",
"storybook:baseline": "story-shots . --update --include my-component-"
```

The story id goes into `iframe.html?id=<id>&viewMode=story&globals=theme:<theme>`,
so the Storybook reads its theme from the `theme` global, as
`@storybook/addon-themes` does.

Per story, `parameters.screenshot` (on the story or its meta) can set:

| Key | Effect |
|---|---|
| `skip: '<why>'` | Leave the story out of the baselines and of `captureStories`. Perf scenes set it. |
| `narrow: true` | Also shoot it at the narrow viewport, 1024x720, as `<id>--<theme>--narrow.png`. |
| `settleMs: n` | Wait `n` ms after `play` instead of the default 1500 ms. |

A story id that ends in `-narrow` is shot at the narrow viewport only.

| Variable | Effect |
|---|---|
| `SHOT_WORKERS` | Playwright workers in the container. Default 6. |
| `STORY_SHOTS_PLATFORM` | The container platform. Default `linux/amd64`, as on CI runners; on Apple silicon Docker emulates it. |

The command needs a running Docker engine and bash. It pulls the image
anonymously, mounts the build and the runner read-only, and writes only the
baselines and the results folders. A change to the pinned image is released
as a minor version, because it can move pixels.

## Stories: `@osdlc/story-harness/browser`

From [examples/stories.test.ts](./examples/stories.test.ts):

```ts
import { seeded, storyMetrics } from '@osdlc/story-harness/browser'

const random = seeded(42) // the same sequence on every run
const harness = storyMetrics({ rows: '[data-row]' })
await harness.ready
```

- `seeded(seed)` is a deterministic PRNG (mulberry32): floats in `[0, 1)`, the
  same sequence for the same seed.
- `storyMetrics({ rows })` takes a row selector or a counting function. Call it
  once in a perf story's setup. It marks `story:mount` (`MOUNT_MARK`) when
  called, and `story:first-rows` (`FIRST_ROWS_MARK`) on the first painted
  frame with at least one row. It sets `window.__storyHarness`, a
  `StoryHarness`: `rows()`, `ready` (settles with the `story:first-rows`
  time) and `marks()`, every `StoryMark` whose name starts with `story:`
  (`MARK_PREFIX`), a story's own marks included. A second call stops the
  first call's frame loop; the first `ready` then never settles.
  `StoryMetricsOptions` is its argument.

## Specs: `@osdlc/story-harness/playwright`

A Playwright config for a package's specs against its build, from
[examples/config.test.ts](./examples/config.test.ts):

```ts
import { defineStoryConfig } from '@osdlc/story-harness/playwright'

export default defineStoryConfig({ port: 6106, mode: 'perf' })
```

`defineStoryConfig(StoryConfigOptions)` serves `storybookDir` (default
`storybook-static`) on `127.0.0.1:<port>`, runs `*.e2e.ts` in parallel
(`mode: 'e2e'`) or `*.perf.ts` on one worker (`mode: 'perf'`) from `testDir`
(default `tests-stories`), with no retries. It sets `STORY_PERF_FILE` to
`<configDir>/test-results/story-perf.json` unless it is set already.

A perf spec, from [examples/perf.spec.ts](./examples/perf.spec.ts):

```ts
await preparePage(page, { clock: false })
await observeLongTasks(page)
await openPerfStory(page, baseURL, 'demo-card--perf')
const peak = await maxMountedRows(page, () => scrollSteps(page, '#list', 5, 200))
budget('rows mounted while scrolling', peak, 10)
await noLongTasks(page, 'first rows', 'story:mount', 'story:first-rows')
```

| Helper | Does |
|---|---|
| `preparePage(page, PreparePageOptions)` | Once per page, before the first navigation. Starts Playwright's clock at `START_TIME` (unless `clock: false`), seeds `Math.random`, and records Storybook's finish and error events. Under the clock, an error thrown in a timer callback is still a page error. Perf specs pass `clock: false`, since the clock also fakes `performance.now()`, timers and frames. |
| `openStory(page, baseURL, id, Theme, OpenStoryOptions)` | Opens a story and waits until it finished, fonts loaded, the load reached network idle and the settle wait passed (default `DEFAULT_SETTLE_MS`). A failed story throws, unless `onStoryError` takes the message. Returns its `ShotParameters`; a story with `skip` returns at once. |
| `storyUrl(baseURL, id, theme)`, `THEMES`, `VIEWPORT`, `NARROW_VIEWPORT`, `START_TIME` | The story URL, and the fixed conditions shots are taken in. |
| `openPerfStory(page, baseURL, id, timeoutMs?)` | Opens a perf story (it sets `skip`) and waits for `story:first-rows`, following a re-rendered story's newer hook. Throws when the story failed or no first rows land in time. Experimental. |
| `observeLongTasks(page)`, `longTasks(page, fromMark?, toMark?)` | A buffered `longtask` observer installed before any page script; the `LongTask` entries that overlap the span between two marks. |
| `noLongTasks(page, name, fromMark, toMark)` | Records the long tasks between two marks and budgets them at none. Experimental. |
| `mountedRows(page, selector?)`, `maxMountedRows(page, run, selector?)` | Rows mounted now, from the hook or a selector; the most mounted at once while `run` executes, sampled every frame. |
| `holdKey(page, key, presses, intervalMs)`, `scrollSteps(page, selector, steps, px)` | Input at a fixed pace: a held key's repeats, and scrolling one frame apart. |
| `paintedAt(page, selector)`, `responseEnd(page, urlPart)` | The time of the frame after a selector first matches, and the `responseEnd` of the latest matching request. Their difference is reply-to-paint. Experimental. |
| `budget(name, value, limit)`, `record(name, value)`, `recordBrowser(page)` | Write the perf report: values, `Verdict`s, user agent, CPU model, and load average before and after, as a `PerfReport`. |

The report goes to `STORY_PERF_FILE`, else `test-results/story-perf.json`
under the working directory. Each write merges into the run's report on disk
under a lock file, so parallel workers and a worker restarted after a failure
keep each other's values. A run records by default and fails nothing on a
budget. `PW_PERF_ASSERT=1` makes each verdict an `expect` against
`limit × PW_PERF_SLACK` (default 1). Measure on an idle machine; on a shared
one, use `PW_PERF_ASSERT=1 PW_PERF_SLACK=2`. Never measure in the baseline
container, which may be emulated.

## Host tools: `@osdlc/story-harness/runner`

From [examples/capture.browser.test.ts](./examples/capture.browser.test.ts)
and [examples/serve.test.ts](./examples/serve.test.ts):

```ts
import { captureStories, serveStatic } from '@osdlc/story-harness/runner'

await captureStories({ storybookDir, prefix: 'demo-card--', outDir, port, themes: ['light', 'dark'], outLayout: 'by-theme' })
const close = await serveStatic('storybook-static', 6107)
```

- `captureStories(CaptureOptions)` writes PNGs for docs, with no comparison.
  It serves the build, shoots every story with the id prefix, and names each
  file after the id with the prefix removed. A page error or a failed story
  fails the run (it resolves `false`) after every story is shot. So does a
  filter that matches no story.
- `captureCli(CaptureCliDefaults)` is the same as a script: it reads
  `[contains] --prefix --out --port` over the package's defaults, and exits 1
  on a failure.
- `selectStories(StoryIndex, StoryFilter)` lists the story ids of a built
  `index.json`, in index order, with docs entries dropped: `include` and
  `exclude` take id prefixes, and `contains` a substring.
- `serveStatic(dir, port)` serves a static build on `127.0.0.1` only. A path
  outside `dir` and a missing file are a 404, and a directory serves its
  `index.html`.
  It rejects when the port is taken, and resolves to a function that stops
  the server.

## Stability

The package is 0.x. A minor version may break the API, and the CHANGELOG says
what to change.

The experimental exports:

`openPerfStory`, `noLongTasks`, `paintedAt` and `responseEnd`

They are the newest helpers, and may change in a patch release. Every other export is stable within a
minor version.

## Platforms and runtimes

- Node 22 or later, ESM only. `@playwright/test` 1.62 or later as a peer.
- The Playwright helpers and the perf report run wherever Playwright runs.
- `story-shots` needs bash and Docker, and runs on Linux and macOS. On macOS
  with Colima, start the VM with Rosetta (`colima start --vm-type vz
  --vz-rosetta`) so the amd64 image runs fast, and give it about 6 GB for six
  workers.

## Compared with

| Tool | Covers | Why this package anyway |
|---|---|---|
| Chromatic | Hosted visual review of Storybook stories | A hosted service. This package keeps baselines in the repository and needs no account. |
| `@storybook/test-runner` | Runs stories and `play` functions in Playwright, with hooks to add screenshots | No pinned Linux image, no baseline pruning and no perf report. |
| `@storybook/addon-vitest` | Stories as Vitest browser tests | Runs inside Vitest, not against a static build; no perf helpers. |
| BackstopJS | Screenshot regression of URLs, with a Docker mode | Not Storybook-aware: no story index, no `play` errors, no skip parameter. |
| Lost Pixel, Loki, storycap with reg-suit | Storybook screenshot regression | None had a release in the 12 months before 2026-11-07, and none measures perf. |

## Licence

`MIT OR Apache-2.0`, at your choice: [MIT](./LICENSE-MIT) or
[Apache-2.0](./LICENSE-APACHE).
