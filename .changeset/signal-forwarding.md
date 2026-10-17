---
'@osdlc/command-seam': minor
---

Add process-group signal forwarding and `unref` on the managed-process runner. These exports are experimental (see the README's Stability section).

- `installGroupSignalForwarding(opts?)`, with options type
  `GroupSignalForwardingOptions`: opt-in. While a group started with
  `processGroup: true` (async and managed runners) is live, `SIGINT`,
  `SIGTERM` and `SIGHUP` send `SIGTERM` to every group, `SIGKILL` after
  `graceMs` (default 1000), then exit with `128 + signal number`. A repeat
  signal escalates to `SIGKILL` at once; an `exit` handler `SIGKILL`s groups
  whose run is still in flight. Listeners are attached only while a group is
  starting or live, ahead of the host's own. A host with its own listener,
  `process.once` included, keeps the exit; its groups still get `SIGKILL`
  after `graceMs`, or on exit if sooner and the run is in flight. Returns an
  uninstall function. POSIX only; a no-op on Windows. `SIGKILL` of the host
  still orphans its groups. When forwarding owns the exit, a new
  `processGroup: true` run after the first forwarded signal is refused: it
  starts nothing and settles with `reason: 'abort'`. The uninstall function
  resets this.
- `forwardedSignal()`: the signal forwarded when forwarding owns the exit, or
  `undefined`. A host that runs one command after another checks it to stop.
- `forwardedExitCode()`: `128 + signal number` for `forwardedSignal()`, or
  `undefined`. A host that sets its own exit code keeps this one over it.
- `liveProcessGroups()`: the pids of the groups currently registered. A group
  stays registered until it is empty, also after its run settles or its
  leader exits, so a forwarded signal still kills a background member or one
  waiting for the `SIGKILL` follow-up. The host's normal exit kills only the
  groups whose run is still in flight, so a daemon a settled run left behind
  keeps running.
- `unref` on the managed-process runner's options: the parent can exit while
  the (usually `processGroup`) child keeps running. Such a group is not
  tracked by `installGroupSignalForwarding`: a signal to the parent does not
  reach it and the parent's exit does not `SIGKILL` it.
