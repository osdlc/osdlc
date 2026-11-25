# @osdlc/story-harness

## 0.5.1

### Patch Changes

- 67c7bdb: Typed accessibility options, documented exports, and tests for every mode parameter.
  
  - `A11Y_OPTIONS` from `@osdlc/story-harness/a11y` is typed so it assigns to axe-core's `RunOptions`, where the guide tells you to pass it. `WCAG_TAGS` and `PAGE_RULES` are `readonly string[]`. The entry still imports nothing.
  - `parseAriaLine` is no longer exported from `@osdlc/story-harness/runner`. It was an internal helper of `walkPage`, and 0.5.0 is days old.
  - `walkPage`, the `Walk*` types and every export of `@osdlc/story-harness/parley-capture` are tagged `@experimental`, and the README lists them. `heading` takes a named, exported `HeadingInput`.
  - Every export has a TSDoc comment, and a test fails on one that has none.
  - The axe-core installed for `story-shots --a11y` is 4.14.1, the version a fresh `@storybook/addon-a11y` install resolves to, in place of 4.14.0.
  - The README compares the package with the accessibility and keyboard tools it replaces, and says every mode instead of three. The decision notes and the changelog history say that the first published version is 0.5.0.
  - New tests cover `parameters.a11y` (`test`, `config`, `options`, `context`), `parameters.walk.skip`, `parameters.screenshot.skip` and `--include` in every mode, and the shape of a `parleyDocument`.

## 0.5.0

### Minor Changes

- fb52d0a: `story-shots` gains an accessibility check and a keyboard walk. This is the first version of the package on npm; the 0.4.0 in the history was never published.
  
  - `story-shots <package dir> --a11y` runs axe-core over every story in light and dark and fails on WCAG 2.2 A and AA violations, unless a story sets `parameters.a11y.test: 'todo'`. It reads the same `parameters.a11y` as `@storybook/addon-a11y`. Violations go to `test-results/story-a11y/a11y-report.json`.
  - `story-shots <package dir> --walk` tabs through every story in light, then Shift+Tabs back, and records each stop (role, name, box, visibility, focus indicator), the reverse order and the focus of a modal dialog, with a screenshot per stop, in `test-results/story-walk/`. It is a survey and fails only on a story that errors. `WALK_MAX` sets the stops per story.
  - `@osdlc/story-harness/a11y` exports the axe rules the check uses (`WCAG_TAGS`, `PAGE_RULES`, `A11Y_OPTIONS`), with no Node imports, so a Storybook preview can pass them to the addon.
  - `@osdlc/story-harness/runner` also exports `walkPage`, `parseAriaLine`, `DEFAULT_WALK_MAX` and the walk's types.
  - `@osdlc/story-harness/parley-capture` builds the blocks of a review page from screenshots.

## History before the first public release

These versions were never published. They are rebuilt from the git history.

The first release of `@osdlc/story-harness` on npm is 0.5.0.

### [0.4.0] - 2026-11-21 (unpublished)

#### Changed

- The package as first prepared for npm, never published. It uses a component's static Storybook build as its test harness.
  
  - `story-shots <package dir>` shoots every story in light and dark inside the pinned Playwright image, as `linux/amd64`, and compares each shot with a committed baseline, failing on any pixel past a 0.02 colour distance. `--update` writes the baselines and deletes those of stories that are gone. `SHOT_WORKERS` sets the worker count. It needs Docker and bash, on Linux or macOS.
  - `@osdlc/story-harness/browser`: `storyMetrics`, the in-page metrics hook for perf stories, and `seeded`, a deterministic PRNG.
  - `@osdlc/story-harness/playwright`: `defineStoryConfig`, `preparePage`, `openStory`, the perf helpers, and `budget`, `record` and `recordBrowser`, which write one report that every worker merges into. `openPerfStory`, `noLongTasks`, `paintedAt` and `responseEnd` are experimental.
  - `@osdlc/story-harness/runner`: `captureStories`, `captureCli`, `serveStatic` and `selectStories`.
  - Compiled ESM with `.d.ts`, Node 22 or newer. `@playwright/test` 1.62 or newer is a peer dependency, and `@osdlc/file-lock` its one runtime dependency. Licence `MIT OR Apache-2.0`.
  
  Changes since the last unpublished version in the history below. Some are breaking, so this version is a minor, 0.4.0:
  
  - **Breaking:** the baseline check is the `story-shots` command, in place of a path to its script. The runner is one `./runner` entry (`captureStories`, `captureCli`, `serveStatic`, `selectStories`), in place of file paths. `createPerfRecorder` is no longer exported; `budget`, `record` and `recordBrowser` write the report.
  - **Breaking:** with several `themes` in the flat layout, `captureStories` writes `<name>--<theme>.png`; before, each theme overwrote the same file.
  - **Breaking:** `serveStatic` answers 404 for a missing file, where it used to answer with `index.html`, so a story that loads a missing asset shows the error. A directory serves its `index.html`.
  - `serveStatic` rejects when the port is taken instead of crashing the process, serves a build at the filesystem root, and knows the types of `.wasm`, `.webp`, `.gif`, `.avif`, `.mp4` and `.webm` files. Run as a script through a symlink, it still serves.
  - `captureStories` closes its server when the browser cannot start, and resolves `false`, naming the filter, when no story matches.
  - `openPerfStory` follows the newer metrics hook of a story that re-renders.
  - `story-shots --update` rewrites only the shots that no longer match, so an untouched story keeps its baseline byte for byte, and deletes the covered baselines it did not shoot. The image is pulled again when the cached one is for another platform.
  - `story-shots` checks a story's page errors before its shot, so `--update` never writes a crashed story's baseline; trims `--include` and `--exclude` items the same way when it prunes; hands what the container wrote back to the host user on Linux; and leaves a remote Docker context's endpoint alone.
  - A perf report keeps the date, CPU and load of the run's first writer, and a writer gives up after 30 s on a lock it cannot take. `defineStoryConfig` gives each `playwright test` run its own id (`STORY_PERF_RUN`), so a new run does not merge into a report an earlier run left (reruns in `--ui` or watch mode share one, as the README says), and a writer releases only its own lock. The report's lock is `@osdlc/file-lock`'s `withLock`, in place of the package's own, which closes a window where two workers could both hold it after a stale-lock takeover.
  - `story-shots` refuses a `--settle-ms` or `SHOT_WORKERS` that is not a whole number. It works around Docker Desktop's credential helper only for the first pull of the image, so `docker run` uses your own Docker config, proxies and context included. The container's npm cache is a named volume (`story-shots-npm-cache`), so only the first run downloads `@playwright/test`.

### [0.3.4] - 2026-11-05 (unpublished)

#### Added

- `serveStatic` is exported, so a package's own screenshot scripts can serve a
  static build with it.

### [0.3.3] - 2026-11-03 (unpublished)

#### Fixed

- The baseline check keeps the Docker engine of the active local Docker
  context (such as Colima or OrbStack) when it pulls the image anonymously.

### [0.3.2] - 2026-11-02 (unpublished)

#### Added

- `openPerfStory`, which opens a perf story and waits for its first rows, and
  `noLongTasks`, which records and budgets the long tasks between two marks.

### [0.3.1] - 2026-10-30 (unpublished)

#### Fixed

- The static server listens on `127.0.0.1` only, answers 404 for a path
  outside the build, and no longer crashes when the build has no
  `index.html`.
- Perf report writes hold a lock file, so concurrent workers keep each other's
  values, and two workers cannot both take over a stale lock.
- Under the default fake clock, an error thrown in `setTimeout`, `setInterval`
  or `requestAnimationFrame` is a page error, so a story that crashes this way
  fails.

### [0.3.0] - 2026-10-22 (unpublished)

#### Changed

- Breaking: the source moved under `src/`, and the runner is exported as
  `./runner/capture.ts` and `./runner/story.ts` instead of every file under
  `./runner/`. Scripts that call the baseline check name its new path.

### [0.2.0] - 2026-10-22 (unpublished)

#### Changed

- Breaking: the package moved to a new npm scope. Imports name the new scope.

### [0.1.4] - 2026-10-16 (unpublished)

#### Added

- `CaptureOptions.themes`, `viewport` and `outLayout`: shoot each story in
  several themes, at one viewport, into one folder per story.

### [0.1.3] - 2026-10-15 (unpublished)

#### Added

- `defineStoryConfig` takes `configDir` and sets `STORY_PERF_FILE`, which the
  perf recorder writes to.

#### Fixed

- Parallel workers no longer overwrite each other's perf values and verdicts.
- A second `storyMetrics` call stops the first call's frame loop.
- `maxMountedRows` rethrows the error `run` throws, not an error of its own.

### [0.1.2] - 2026-10-10 (unpublished)

#### Added

- `paintedAt` and `responseEnd`, for reply-to-paint spans in a page.

### [0.1.1] - 2026-10-06 (unpublished)

#### Added

- `./browser`: `storyMetrics`, the in-page metrics hook, and `seeded`, a
  deterministic PRNG.
- `./playwright`: `preparePage` with a `clock` option, `openStory`,
  `observeLongTasks`, `longTasks`, `mountedRows`, `maxMountedRows`, `holdKey`,
  `scrollSteps`, `budget`, `record`, `recordBrowser` and `defineStoryConfig`.

#### Fixed

- A perf report keeps its verdicts across worker restarts.

### [0.1.0] - 2026-09-28 (unpublished)

#### Added

- The screenshot baseline check: every story of a static Storybook build, in
  light and dark, shot in a pinned Linux Playwright container and compared
  with committed baselines.
- `captureStories` and `captureCli`, which write PNGs for docs with no
  comparison.
