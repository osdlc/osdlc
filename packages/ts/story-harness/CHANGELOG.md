# @osdlc/story-harness

## History before the first public release

These versions were never published. They are rebuilt from the git history.
The first release of `@osdlc/story-harness` on npm is 0.3.5, and the entry for
it is added above this section when it is released.

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
