---
title: The cache
sidebar:
  order: 6
description: Where stored probe results live, when they are used, and when they go stale.
---

Some runners are slow to read. moon starts its toolchain and sbt starts a
JVM. wayfinder keeps the last answer per repository and runner, so the
interactive surfaces can show something at once.

## Who reads the store

- **The terminal UI and `--serve`** always start from the store, then probe
  in the background and update in place.
- **`--json`, `--list` and `way query`** re-probe on every run, so a script
  gets what the repository has now. These runs also write the store.
- **`--cached`** makes `--json`, `--list` or `query` answer from the store.
  It names the stale runners on stderr:

```text
wayfinder: --cached: stale: just (35s old, refresh usually about 149ms)
wayfinder: --cached: not cached, probed now: github-actions
```

`--cached` against an empty store probes, stores the result, and says so.
With `--json`, it adds a `cache` array beside the catalog. See
[The task model and JSON](task-model.md#the-cache-array).

`Ctrl+R` in the terminal UI and **Refresh** in the web view always run a
real probe.

## States

Each runner's stored answer is in one of three states:

- **fresh**: the stored answer still holds.
- **stale**: the answer was used and is out of date.
- **miss**: nothing was stored, so the runner was probed now.

A stale answer has a reason:

- `changed`: a file the probe depended on changed.
- `max-age`: an exec runner's entry is older than four hours.
- `excludes`: `excludePaths` changed since the probe.

## Measured cost

Each runner's probe time is measured in this repository. The estimate is the
median of the last five probes. A runner whose estimate is 1.5 seconds or
more is marked slow here, and the surfaces call that out more loudly. A
runner never measured here has no estimate, and the surfaces say
`never timed here`.

## Invalidation

A stored entry carries a content hash over the files the probe depended on,
never an mtime. Touching a file, or rewriting it with the same bytes, does
not invalidate it.

For a parse runner the coverage is close to exact. Every file it reads is
recorded, and every file pattern it lists is re-expanded on each read, so a
new matching file also invalidates the entry.

For an exec runner it is incomplete. The tool reads files the runner never
opens, such as each project's `moon.yml`. A runner's `watch` patterns cover
some of that, and exec entries also expire after four hours.

A task list can still change with no watched file changing, for example
through a global tool config or an environment variable. Treat a cached
answer as a good guess, not a proof.

A fingerprint covers at most 256 paths. A run that hits the cap adds an
`info` diagnostic to the runner's report.

## Where it lives

`$XDG_CACHE_HOME/wayfinder/`, or `~/.cache/wayfinder/` when that variable is
unset. Losing it costs one slow probe. `way clean --cache` removes it, and also
the old `waypost` cache directory when one is left over.

The cache is separate from the trust store and plays no part in deciding
execution. A cached answer is never a trust grant, and clearing the cache does
not change what is trusted. A runner withheld for lack of trust, or one that
errored, is never stored. See [Trust and execution](trust.md).
