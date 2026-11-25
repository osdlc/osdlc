---
id: D-04
type: decision
state: accepted
created: 2026-11-07
---

# D-04: Entries, the command and the peer dependency

## Decision

- Five entries. Three are one per place the code runs: `./browser` in the
  story's page, `./playwright` in a spec, `./runner` in a host script.
  `./a11y` holds the axe rules the accessibility check uses, with no Node
  imports so a Storybook preview can load it. `./parley-capture` builds the
  blocks of a review page ([D-08](D-08-parley-capture-placement.md)).
- `story-shots` is the command, in four modes: the baseline check, `--update`,
  `--a11y` and `--walk`. Its script ships in `dist/runner/`, and is not an
  import.
- `serveStatic` keeps its return shape (a function that stops the server) in
  0.5.x; changing it is deferred to 0.6.0.
- The walk's `parseAriaLine` stays internal; `walkPage` and the `Walk*` types
  are exported from `./runner`.
- `@playwright/test` is a peer dependency.
- The perf recorder is reached only through `budget`, `record` and
  `recordBrowser`; the recorder factory is not exported.

## Why

- An entry per runtime keeps DOM code out of Node and Node code out of the
  page.
- A command reads better in a package script than a path into
  `node_modules`, and keeps the layout private.
- Two copies of `@playwright/test` break its fixtures, so the specs and the
  helpers share the consumer's.
- The factory's options are test seams. Hiding it keeps the report's one
  writer per worker.

## Consequences

- A consumer installs `@playwright/test` itself.
