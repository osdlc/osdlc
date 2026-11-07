---
"@osdlc/story-harness": patch
---

The first release of `@osdlc/story-harness` on npm. It uses a component's static Storybook build as its test harness.

- `story-shots <package dir>` shoots every story in light and dark inside the pinned Playwright image, as `linux/amd64`, and compares each shot with a committed baseline at zero pixel tolerance. `--update` writes the baselines and deletes those of stories that are gone. `SHOT_WORKERS` sets the worker count. It needs Docker and bash, on Linux or macOS.
- `@osdlc/story-harness/browser`: `storyMetrics`, the in-page metrics hook for perf stories, and `seeded`, a deterministic PRNG.
- `@osdlc/story-harness/playwright`: `defineStoryConfig`, `preparePage`, `openStory`, the perf helpers, and `budget`, `record` and `recordBrowser`, which write one report that every worker merges into. `openPerfStory`, `noLongTasks`, `paintedAt` and `responseEnd` are experimental.
- `@osdlc/story-harness/runner`: `captureStories`, `captureCli`, `serveStatic` and `selectStories`.
- Compiled ESM with `.d.ts`, Node 22 or newer. `@playwright/test` 1.62 or newer is a peer dependency. Licence `MIT OR Apache-2.0`.

Changes since the last unpublished version in the history below. No earlier version was published, so the breaking ones cost no version bump:

- **Breaking:** the baseline check is the `story-shots` command, in place of a path to its script. The runner is one `./runner` entry (`captureStories`, `captureCli`, `serveStatic`, `selectStories`), in place of file paths. `createPerfRecorder` is no longer exported; `budget`, `record` and `recordBrowser` write the report.
- **Breaking:** with several `themes` in the flat layout, `captureStories` writes `<name>--<theme>.png`; before, each theme overwrote the same file.
- **Breaking:** `serveStatic` answers 404 for a missing file, where it used to answer with `index.html`, so a story that loads a missing asset shows the error. A directory serves its `index.html`.
- `serveStatic` rejects when the port is taken instead of crashing the process, serves a build at the filesystem root, and knows the types of `.wasm`, `.webp`, `.gif`, `.avif`, `.mp4` and `.webm` files. Run as a script through a symlink, it still serves.
- `captureStories` closes its server when the browser cannot start, and resolves `false`, naming the filter, when no story matches.
- `openPerfStory` follows the newer metrics hook of a story that re-renders.
- `story-shots --update` rewrites only the shots that no longer match, so an untouched story keeps its baseline byte for byte, and deletes the covered baselines it did not shoot. The image is pulled again when the cached one is for another platform.
- `story-shots` checks a story's page errors before its shot, so `--update` never writes a crashed story's baseline; trims `--include` and `--exclude` items the same way when it prunes; hands what the container wrote back to the host user on Linux; and leaves a remote Docker context's endpoint alone.
- A perf report keeps the date, CPU and load of the run's first writer, and a writer gives up after 30 s on a lock it cannot take. `defineStoryConfig` gives each run its own id (`STORY_PERF_RUN`), so a run never merges into a report an earlier run left, and a writer releases only its own lock.
- `story-shots` refuses a `--settle-ms` or `SHOT_WORKERS` that is not a whole number. It works around Docker Desktop's credential helper only for the first pull of the image, so `docker run` uses your own Docker config, proxies and context included. The container's npm cache is a named volume (`story-shots-npm-cache`), so only the first run downloads `@playwright/test`.
