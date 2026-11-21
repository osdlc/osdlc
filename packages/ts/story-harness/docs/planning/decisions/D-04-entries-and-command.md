---
id: D-04
type: decision
state: proposed
created: 2026-11-07
---

# D-04: Entries, the command and the peer dependency

## Decision

- Three entries, one per place the code runs: `./browser` in the story's
  page, `./playwright` in a spec, `./runner` in a host script.
- The baseline check is the `story-shots` command. Its script ships in
  `dist/runner/`, and is not an import.
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
