# Changelog

## 0.8.0

### Minor Changes

- ac5f0d1: The licence is now `MIT OR Apache-2.0`, with `LICENSE-MIT` and `LICENSE-APACHE`. It was `MIT`.

## 0.7.0

### Minor Changes

- ce3bf64: Add a `stdio` option to `managedProcessRunner` and `streamRunner`: `'inherit'` (the default, as before), `'ignore'` (stdin, stdout and stderr all `/dev/null`), or `{ stdout, stderr }`, file descriptors the caller opened, with stdin from `/dev/null`. Pass the same fd for both to get one log in the order the child wrote it. The child gets its own copy of each fd when it starts, so the caller may close its fd once `run` returns; the runner never closes it. An fd that is not open is a failed spawn (`reason: 'spawn'`, `EBADF` in `error`), and an fd that is not a whole number, 0 or more, or an unknown mode, throws before spawning. `stdio: 'ignore'` with `unref` and `processGroup` on the managed runner is a fire-and-forget launch: the child outlives the parent, does not keep it running, and does not write to its terminal. The new `StdioOption` type names the option. A pipe from one child into another is out of scope. ([#235](https://github.com/osdlc/osdlc/issues/235))
  
  Add `quiet` to `streamRunner`'s options: it stops the runner writing its own line to the parent's stderr when the spawn fails, the timeout fires or a signal ends the child. The result's `reason`, `signal` and `error` are set either way. `StreamRunOptions` is now an interface with the same fields plus `stdio` and `quiet`. ([#235](https://github.com/osdlc/osdlc/issues/235))
  
  Add `spawnRunnerBytes` and `spawnRunnerBytesAsync`, experimental: capture runners that return stdout as the `Buffer` the child wrote, never decoded, typed by the new `BytesCommandRunner` and `AsyncBytesCommandRunner` interfaces. `CommandResult` takes the stdout type as a parameter, `CommandResult<Buffer>`, which defaults to `string`, so existing code is unchanged. Stderr is still decoded as UTF-8. `maxOutputBytes` cuts bytes stdout at exactly the cap. `runChecked` and `runCheckedAsync` return `CommandResult<Buffer>` for a bytes runner, and a failure throws the usual `CommandFailed` with stdout decoded as UTF-8 in `result`, so its `message` and `detail` read as for text. `failureText` decodes a `Buffer` stdout, and `asAsync` wraps a bytes runner as an async bytes runner. `fakeRunner` returns `bytesRunner` and `asyncBytesRunner` too, and an answer's `stdout` may be a string or a `Buffer`; each form converts it to its own type. ([#234](https://github.com/osdlc/osdlc/issues/234))

## 0.6.0

### Minor Changes

- 778129e: Add a `maxOutputBytes` option to the capture runners: the most bytes to read from each of stdout and stderr. The cap counts the bytes the child wrote, so output that is not valid UTF-8 can decode to a longer string. A child that writes more to either stream is killed with `SIGKILL`, or its whole group with `processGroup`. The result has `neverExited: true`, `reason: 'output'`, and that stream cut to the cap on a character boundary. A child that exits before the kill lands keeps its exit code and gets `outputIncomplete: true`. The async runners have no default cap; on the sync runners the option replaces the default 256 MB. Over the cap, the sync runner now also cuts each stream back to the cap on a character boundary, since `spawnSync` can return more than its limit. The `bun test` capture path ignores the option. `StreamRunOptions` leaves it out, since a streaming run captures nothing. ([#233](https://github.com/osdlc/osdlc/issues/233))
  
  The sync runner, `streamRunner` and the README now point runs that may start background work at `spawnRunnerAsync` or `managedProcessRunner` with `processGroup: true`, since the sync and streaming runners kill only the direct child on timeout. ([#247](https://github.com/osdlc/osdlc/issues/247))

## 0.5.0

### Minor Changes

- 2f3fc7c: `CommandFailed` now names the program that failed, and the sync runner flags output it stopped reading early.
  
  - `CommandFailed.message` includes the binary: `command failed (exit 1): git nope` instead of `command failed (exit 1): nope`. The new `binary` field holds it, and the constructor takes it as an optional third argument. `runChecked` and `runCheckedAsync` read it from the runner's new optional `binary` property. `spawnRunner`, `spawnRunnerAsync`, `asAsync` and `withDefaults` runners have it. A fake runner without `binary` keeps the old argv-only message. ([#231](https://github.com/osdlc/osdlc/issues/231))
  - `CommandResult` has a new `outputIncomplete` flag. The sync runner sets it when the child exited but a process it started still held stdout or stderr open at `timeoutMs`. That run used to look like a success with a stray `ETIMEDOUT` in `error`. A child that passes the output cap but exits before the runner's kill lands gets the flag too, on Node or Bun. The `bun test` capture path never sets it. `exitCode` stays the child's own and `reason` stays absent, so `ran` and `runChecked` still count the run as a success. Check `outputIncomplete` when the output must be whole. ([#232](https://github.com/osdlc/osdlc/issues/232))
  - **Breaking:** `CommandFailed.message` now starts with the binary, so code that matches on the message text sees a different string. `CommandRunner` and `AsyncCommandRunner` gain an optional public `readonly binary?: string` member, so a class that implements one of them with a private or non-string `binary` field no longer type-checks. Make the field public and a string, or rename it.
- 2f3fc7c: Add `which(binary, opts?)`, experimental: the absolute path a spawn of `binary` would run, or `undefined`, without running it. It uses the runners' lookup rules: a name with a `/` resolves against `cwd`, a bare name is searched on `PATH`, and a match must be an executable file. `opts` takes `cwd` and `env` (merged over the parent's, as the runners take it), typed `WhichOptions`. ([#236](https://github.com/osdlc/osdlc/issues/236))

## 0.4.1

### Patch Changes

- 4fa373f: The npm package no longer contains `smoke.mjs`. It was a check for this
  repository's CI, not part of the API.

## 0.4.0

### Minor Changes

- e30f155: **Breaking:** the package is now `@osdlc/command-seam`, renamed from `@sksizer/command-seam`. The repository moved from `sksizer/sdlc` to [osdlc/osdlc](https://github.com/osdlc/osdlc).
  
  To move, replace `@sksizer/command-seam` with `@osdlc/command-seam` in `package.json` and in every import, including `@osdlc/command-seam/testing`. `@sksizer/command-seam` gets no further releases.
- e30f155: Add process-group signal forwarding and `unref` on the managed-process runner. These exports are experimental (see the README's Stability section).
  
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

## [0.3.0] - 2026-10-15

The first release on npm. Version numbers before 0.3.0 were used only during
development and were never published, so this entry lists everything the
package does.

### Added

#### Runners

Each runner factory takes a binary, as a name looked up on `PATH` or a path,
and returns an object with one `run` method. Code takes the runner as a
parameter, so a test can pass a fake.

- `spawnRunner(binary)`: the sync capture runner (`CommandRunner`). `run`
  returns a `CommandResult` with `exitCode`, `stdout` and `stderr`. When the
  child never reported an exit status, the result also has
  `neverExited: true` and a `reason`, plus `signal` when the runner knows it.
  `error` holds the runner's own message (see Results and output). A death by
  a signal from elsewhere has none. The options (`CommandRunOptions`) are
  `cwd` (required), `timeoutMs`, `input` and `env`.
- `spawnRunnerAsync(binary)`: the async capture runner
  (`AsyncCommandRunner`). Its options (`AsyncCommandRunOptions`) add
  `signal` (an `AbortSignal`), `onSpawn` (called with the child's pid as soon
  as it starts) and `processGroup`.
- `streamRunner(binary)`: runs with inherited stdio, so the child's output
  and prompts reach the terminal live (`StreamRunner`, `StreamRunOptions`,
  `StreamResult`). The result says only how the child ended.
- `managedProcessRunner(binary)`: starts a long-running process and returns a
  handle at once (`ManagedProcessRunner`, `ManagedProcessRunOptions`,
  `ManagedProcessHandle`, `ManagedProcessExit`). The handle has `pid`,
  `kill()` and an `exited` promise. `processGroup: true` makes `kill()`
  signal the whole process group.
- `NeverExitedReason`: why a child never reported an exit status. `spawn`:
  it never started. `timeout`: `timeoutMs` ran out. `abort`: the caller
  stopped it (an `AbortSignal`, an `onSpawn` that threw, or `kill()` on a
  managed process). `signal`: a signal from elsewhere ended it. `output`:
  the sync runner killed it for passing its 256 MB output cap.
- `EnvOverrides`: variables merged over `process.env`. An `undefined` value
  removes that variable from the child's environment.
- `asAsync(runner)`: wraps a sync runner as an async one, so one test fake
  serves both.
- `resolveRunner(binary, injected?)` and `resolveRunnerAsync`: the injected
  runner when given, else the default runner for `binary`.
- `withDefaults(runner, opts)`, with `DefaultedRunner`: a runner that fills
  in default options on every call. It works with every runner type. A
  per-call option replaces the default of the same name, and a per-call
  `undefined` keeps the default. The exception is `env`: a per-call `env` is
  merged over the bound `env`, key by key, and a per-call `undefined` value
  removes a bound variable.
- `stopProcess(handle, { graceMs })`: stops a managed process with
  `SIGTERM`, then `SIGKILL` if it is still running after `graceMs` (default
  5 s). Resolves with the exit. Works with any `ManagedProcessHandle`.

#### Shell helpers

- `runShell(verb, opts)` and `runShellAsync`: run a shell string once as
  `sh -c -- <verb>` and capture the result. `scriptName` sets `$0` and
  `args` sets `$1` onward. They are passed as separate arguments, so they
  need no quoting (`ShellPositionals`, `ShellRunOptions`,
  `AsyncShellRunOptions`).
- `shellRunner(sh?)` and `shellRunnerAsync`: shell runners over a given
  runner, for injection (`ShellRunner`, `AsyncShellRunner`). The injected
  runner receives `['-c', '--', verb]`, then `scriptName` and `args` when
  given.
- `shellQuote(word)` and `shellJoin(argv)`: POSIX quoting for a command line
  printed for a person to paste. `shellJoin` quotes a first word that
  contains `=`, so it runs as a command, not as an assignment.

#### JSON helpers

- `runJson(runner, argv, opts)` and `runJsonAsync`: run a command and parse
  its stdout as JSON.
- `parseJsonResult(result, opts?)`: parse the stdout of a finished run. It
  takes the same `okExitCodes`.
- `JsonRun`: the outcome. It is `{ ok: true, value, result }`, or
  `ok: false` with a `reason`: `failed` (the command did not run or exited
  non-zero), `unparseable` (stdout was not JSON) or `invalid` (the `parse`
  option threw, and `cause` holds what it threw).
- `RunJsonOptions`: `tolerateLeadingLog` skips log lines and banners before
  the JSON. The JSON starts at the first line that begins with `{` or `[`
  and parses to the end of stdout. `okExitCodes` lists the exit codes that
  count as an answer, such as `[0, 1]` for `npm outdated --json`. Default
  `[0]`. A run that never exited is still `failed`, and the output must
  still parse.
- `runJson` and `runJsonAsync` take an explicit type with a runner that needs
  no options, such as one with `cwd` bound: `runJson<T>(bound, argv)`
  compiles.
- The `parse` option takes a function that checks the parsed value and
  returns it typed, such as a schema's `parse`. The value's type is what
  `parse` returns. `parse` must be sync: one that returns a promise gives
  `invalid`.

#### Failure helpers

- `runChecked(runner, argv, opts)` and `runCheckedAsync`: run a command and
  throw `CommandFailed` when `exitCode` is not 0. That includes a missing
  binary and a timeout. They take any runner whose `run` returns a
  `CommandResult`, such as a `withDefaults` runner.
- `CommandFailed`: an error with `argv`, the full `result` and `detail`.
  `detail` is both output streams, trimmed and newline-joined, for showing a
  person why the command failed. `message` quotes argv with `shellJoin`, so
  `['a b']` and `['a', 'b']` look different. It carries the full argv, so
  pass secrets through `env` or `input`, not argv.
- `mapFailed` and `mapFailedAsync`: rethrow a `CommandFailed` as another
  error. `catchFailed` and `catchFailedAsync`: turn a `CommandFailed` into a
  value. Other errors pass through. The async mapper and handler may return
  a promise.
- `ran(result)`: `true` when the child started and exited 0. It reads the
  result of any runner.
- `failureText(result, opts?)`, with `FailureTextOptions`: the text to show
  a person for a failed run. By default it is trimmed stderr, else the
  trimmed `error`, else trimmed stdout, else `exit N`. `{ both: true }` joins both streams, as
  `CommandFailed.detail` does.
- `firstLine(text, fallback?)`: the first non-blank line, trimmed.
- `stderrOrError(result)`: trimmed stderr, else the runner's trimmed
  `error`, else `''`. `failureText` and `CommandFailed` use it.

#### Test fakes

A second entry point, `@sksizer/command-seam/testing`, holds the fakes. It
has the same `bun`, `types` and `default` export conditions as the main
entry.

- `fakeRunner(answers)`: a `CommandRunner` that answers from a table, or from
  a function of the call, and records each call. The table is keyed by each
  argument quoted with `shellQuote`, joined with spaces, so `['-m', 'a b']`
  and `['-m', 'a', 'b']` do not share a key. A key whose arguments hold a
  space or a shell character must be quoted, such as
  `"tag -m 'Release 1.2.0'"`. A call with no answer reports a failed spawn,
  so `ran()` is false and `runChecked` throws. The "no answer for" message
  prints the same key. It also returns `asyncRunner`, the same fake as an
  `AsyncCommandRunner`.
- `fakeProcess(opts?)`: a `ManagedProcessHandle` that starts nothing. The
  test ends it with `exit()`, and `kill()` ends it as an abort, unless
  `exitOnKill: false`. `exitOnKill` also takes a list of signals, such as
  `['SIGKILL']`, for a process that survives `SIGTERM`. It records the
  signals sent and comes with a runner that returns it.
- `fakeNeverExited(reason, fields?)`: builds a fake answer for a run that
  never exited, with the fields the runners set together for that reason.
- The types `FakeRunner`, `FakeCall`, `FakeProcess` and
  `FakeProcessOptions`, so a test helper can name what the fakes return.

### Behaviour

#### Timeouts

- `timeoutMs` follows one rule on every runner that has it: the sync, async,
  stream and shell runners. `undefined` and `Infinity` mean no cap. A
  fraction rounds up, so `1.2` is `2`. A value above 2^31 - 1 ms (about 24.8
  days) is clamped to it. `0`, a negative value and `NaN` are a caller error
  (`RangeError`). A value that is not a number is a `TypeError`.
- A timeout kills the child with `SIGKILL`, so a child that ignores
  `SIGTERM` still stops. The child gets no chance to clean up, so a timed-out
  git can leave its lock files. For a graceful stop on the async runners,
  pass `signal: AbortSignal.timeout(ms)` instead: an abort sends `SIGTERM`
  first.
- The result of a timeout has `neverExited: true`, `reason: 'timeout'` and
  the output captured so far. On the async runner, a deadline that fires
  after the child exited, inside the 250 ms exit grace, keeps the child's
  exit code instead.
- The async runner resolves at the deadline. It does not wait for output
  pipes that a surviving grandchild still holds open. Its timeout message
  is `timed out after <N>ms`, in `error`.
- The streaming runner writes the spawn error, the timeout message or
  `<binary> was killed by <signal>` to the parent's stderr, since it has no
  captured stderr.

#### Process groups

- The async runners (`spawnRunnerAsync`, `runShellAsync`,
  `shellRunnerAsync`) take `processGroup: true`. The child then runs as its
  own process-group leader. A timeout or an abort signals the whole group,
  so processes the child started do not outlive it.
- `managedProcessRunner` takes `processGroup: true` too. `kill()` then
  signals the whole group.
- The sync runners (`spawnRunner`, `runShell`, `shellRunner`) and
  `streamRunner` kill the direct child only on timeout. Processes it started
  keep running. These runners have no `processGroup` option.
- A process group does not get the terminal's Ctrl-C. To stop it on Ctrl-C,
  listen for `SIGINT` and abort through `signal`, or call `kill()`.
- Process groups are POSIX only.

#### Abort and exit

- An abort sends `SIGTERM`, then `SIGKILL` 1 s later if the child is still running. The `SIGTERM`
  lets a child such as git remove its lock files. The promise resolves at once with
  `neverExited: true`, `reason: 'abort'` and `The operation was aborted` in `error`. An abort that
  lands after the child exited keeps the child's exit code. While a child ignores `SIGTERM`, the
  pending `SIGKILL` keeps the host alive for up to 1 s.
- The async runner settles when the child's stdio closes, or 250 ms after
  the child exits if a process it started still holds the pipes. In the
  second case `exitCode` is the child's own, and the pipes are closed: that
  process loses any later output. With `processGroup`, the group gets
  `SIGKILL` at that point.
- If `onSpawn` throws, the child is killed and the run resolves with
  `neverExited: true`, `reason: 'abort'` and `onSpawn threw: <message>`.
- Without `processGroup`, a managed process's `kill()` does nothing once the
  process has exited, so a reused pid is never signalled. With
  `processGroup`, it still signals any member of the group that is left. A
  death by a signal sent through `kill()` reports `reason: 'abort'`.

#### What throws

- `run` never throws, and an async `run` never rejects, for a failed
  command. A missing binary, a timeout or an abort is a result with a
  non-zero `exitCode`, `neverExited: true` and a `reason`.
- Programmer errors throw from a sync runner and reject from an async one:
  an invalid `timeoutMs` and a NUL byte in argv or env.
- A managed process reports a failed spawn through `exited`, which never
  rejects. A NUL byte in argv or env throws from `run`.
- `runChecked` and `runCheckedAsync` throw `CommandFailed` for a failed run.
  `runJson`, `parseJsonResult`, `ran` and `failureText` never throw for one.
- `asAsync` turns a throw from the sync runner into a rejected promise.
  `shellRunnerAsync` does the same for the runner it wraps.

#### `bun test`

- Under `bun test`, once a large module graph is loaded, Bun can hand child
  processes stdio that the parent reads back as empty. `spawnRunner` works
  around this when it runs under Bun with `NODE_ENV=test`. It runs the
  command through `/bin/sh` with stdin, stdout and stderr redirected to temp
  files, then reads the files back. Arguments are still not parsed by the
  shell.
- Results on that path match `spawnRunner` outside `bun test`. For example,
  a missing binary is a failed spawn with `exitCode: 1`, `neverExited: true`
  and a spawn message. The path has no output cap.
- Jest and Vitest on Node do not take that path. The async runner has no
  workaround.

#### Results and output

- `stderr` is only the child's output. When a capture runner has its own
  message (spawn failure, timeout, abort, `onSpawn` throw, output cap,
  failed stdin write), it is only in `error`, never copied into `stderr`.
  `stderrOrError(result)` reads both: trimmed stderr, else trimmed `error`.
  `failureText` and `CommandFailed` use it, so their text names the failure
  either way.
- `error` can come with a real exit code and no `reason`: after a failed
  stdin write, or, under Bun, a child that exits right at the output cap.
- If the child closes stdin before `input` is fully written, the result
  keeps the child's exit code, and the host process does not crash. The
  async runner, and the sync runner on Node, put the write error in `error`.
  The sync runner under Bun does not report it.
- Output is decoded as UTF-8. A character split across pipe chunks is kept
  whole. Output that ends in the middle of a character shows U+FFFD.
- `spawnRunner` (outside `bun test`) caps each stream at 256 MB and usually
  kills a child that passes it, with `reason: 'output'`. The async runner
  has no cap.

#### Arguments, environment and `cwd`

- `argv` is never parsed by a shell. Spaces, quotes and `$()` in an argument
  reach the binary unchanged. Only the shell helpers run a shell string.
- `env` merges over `process.env`, read at call time on every runner, so a
  variable set after startup reaches the child.
- `cwd` is required on every call. An empty, missing or non-directory `cwd`
  is a failed spawn whose message names the `cwd`.
- Optional option fields are typed `?: T | undefined`, so callers can pass
  an explicit `undefined` under `exactOptionalPropertyTypes`. A custom
  runner must accept `undefined` for these fields.

#### Requirements and stability

- Node.js 22 or later, tested on Node 22 and 24 on Linux and macOS. Windows
  is not supported. Bun also works, and resolves to the TypeScript source
  through the `bun` export condition. ESM only. TypeScript 5.4 or later, with
  `@types/node` as an optional peer dependency.
- Each export is stable or experimental. Any release may change or remove an
  experimental export. The README's Stability section lists the experimental
  exports. A breaking change to a stable export will be listed under
  "Breaking".

[0.3.0]: https://github.com/sksizer/sdlc/tree/command-seam/v0.3.0/packages/command-seam
