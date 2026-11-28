# command-seam

A seam for running child processes from Rust. Callers take a `CommandRunner`
instead of spawning directly, so tests can substitute a fake.

The Rust twin of `@osdlc/command-seam` (TypeScript), with the same semantics:
no shell, captured output, a failed run is a value rather than an error, and a
checked form turns any run that did not exit 0, or whose output was cut short,
into a typed error.

Synchronous, on `std::process`; on unix `rustix` provides `poll` and the group
kill, and `signal-hook` the opt-in signal forwarding. For fan-out, run the sync
runner on threads.

## Install

```sh
cargo add command-seam
```

## Usage

```rust
use std::time::Duration;
use command_seam::{args, run_checked, CommandRunner, RunOptions, SpawnRunner};

let git = SpawnRunner::new("git");
let opts = RunOptions::in_dir("/path/to/repo")
    .env("GIT_TERMINAL_PROMPT", "0")
    .timeout(Duration::from_secs(30));

// A value: inspect it, nothing fails here.
let result = git.run(&args(["status", "--short"]), &opts);
if result.timed_out() { /* ... */ }

// Checked: a non-zero exit, a missing binary, a timeout or output that was
// cut short is an Err.
let ok = run_checked(&git, &args(["rev-parse", "HEAD"]), &opts)?;
println!("{}", ok.stdout_lossy());
```

In a test, use `command_seam::testing::FakeRunner`:

```rust
use command_seam::testing::FakeRunner;
use command_seam::CommandResult;

let fake = FakeRunner::new().answer("rev-parse HEAD", CommandResult::exited(0).stdout("abc\n"));
// pass &fake wherever a &dyn CommandRunner is taken, then read fake.calls()
```

## Behaviour

- On unix one `poll` loop on the calling thread reads stdout and stderr and
  writes stdin, so a full pipe cannot deadlock the child and no thread starts.
  Other platforms read each pipe on its own thread.
- Environment: inherit, extend (set or remove variables) or replace.
- `max_output_bytes` caps each stream (default 256 MiB); passing it stops the
  run as a timeout does and reports `StopReason::Output`.
- Without a process group a timeout kills the child alone (SIGKILL on unix);
  the run reports `StopReason::Timeout`.
- With `RunOptions::process_group(&groups)` (unix) the child leads its own
  group, which no longer gets the terminal's Ctrl-C. A timeout, the output cap
  or `ProcessGroups::stop_all` sends the group SIGTERM, then SIGKILL after
  `kill_grace` (default 1 s) unless it has emptied. Its pipes are not read
  meanwhile, so a group that fills one is killed when `kill_grace` ends.
  `stop_all` ends every run on the handle (reason `Abort`), including one whose
  leader exited while its group holds a pipe, and keeps later runs from
  starting. Off unix no group is started, and `stop_all` kills the child alone.
- `ProcessGroups::stop_on_signals` (unix, opt-in) makes SIGINT, SIGTERM and
  SIGHUP call `stop_all` instead of ending the process; the host exits once its
  runs return, with `Forwarded::exit_code()` (128 plus the signal). A second
  signal ends the process at once, so a host blocked outside a run can still be
  stopped. A signal ignored at the call (under `nohup`, say) stays ignored, on
  Linux with a readable `/proc` only. There is no uninstall.
- A grandchild that holds a pipe after the child is reaped does not hold the
  run: one second later, with or without a timeout (or after a later unix
  `stop_all`), the runner returns what it has read and sets
  `output_incomplete`. On unix the pipes are then closed from this end, so the
  grandchild's next write fails; a process meant to outlive the command should
  not keep its stdout or stderr. On unix the second ends only after a `poll`
  that found nothing, so a busy machine cannot cut a complete run short; the
  thread form elsewhere has a wall-clock limit and leaves a reader on a held
  pipe until it is written or closed.
- `output_incomplete` covers both streams. `run_checked` and
  `classify_failure` fail an accepted exit with it set
  (`CommandFailureKind::OutputIncomplete`), even when only stderr was cut
  short; to keep the stdout, call `run` and read the result.
- A bad working directory, a missing binary and a non-executable file are
  distinct `SpawnProblem`s and `CommandFailureKind`s; `as_str()` gives a kind's
  stable kebab-case name, such as `not-installed`.
- `#![forbid(unsafe_code)]`.

## Ported and left out

| TypeScript | Rust | Status |
| --- | --- | --- |
| `CommandRunner`, `spawnRunner` | `CommandRunner`, `SpawnRunner` | ported |
| `CommandRunOptions` (cwd, env, input, timeoutMs, maxOutputBytes) | `RunOptions`, `EnvMode` | ported; env gains an explicit replace mode |
| `CommandResult`, `neverExited`, `reason`, `signal`, `outputIncomplete` | `CommandResult`, `Outcome`, `Stop`, `StopReason` | ported as enums; adds `duration` |
| `runChecked`, `CommandFailed` | `run_checked`, `CommandFailed` | ported, and stricter: an exit 0 with `output_incomplete` set fails too. The original returns it as a success, so a checked caller could parse part of an answer as all of it |
| `failure.ts` (`classifyFailure`, `buildFailure`) | `classify_failure`, `build_failure`, `CommandFailure` | ported; spawn errors are structured, not regex-matched. Adds the kind `output-incomplete` for the stricter checked form |
| `result.ts` (`ran`, `runFailed`, `stderrOrError`, `failureText`, `firstLine`) | same names, snake case | ported; `failureText`'s `both` flag is two functions, `failure_text` and `failure_text_both` |
| `testing.ts` `fakeRunner`, `fakeNeverExited` | `testing::FakeRunner`, `fake_never_exited` | ported |
| `which.ts` (POSIX) | `which` | ported over the `which` crate, which does the executable test: on unix a regular file `access(X_OK)` allows, on Windows each `PATHEXT` extension too (untested). The wrapper keeps the `PATH` fallbacks (`path`, else the parent's `PATH`, else `/usr/bin:/bin`) and resolves an empty or relative entry against `cwd`, as `execvp` does, so `~` is a folder named `~` |
| `quote.ts` `shellQuote`, `shellJoin` | `shell_quote`, `shell_join` | ported |
| `BytesCommandRunner` | `CommandResult.stdout` is bytes | folded in; `stdout_lossy()` for text |
| `runJson`, `parseJsonResult` | none | left out: no `serde_json` need yet |
| `classifyFailed` / install hints | none | left out |
| `withDefaults`, `resolveRunner` | none | left out: `RunOptions` builder covers it |
| `commandString` (PowerShell, cmd) and `spawn-plan.ts` | none | left out: Windows only |
| `stdio` option, `onSpawn`, `absolutePathOnly` | none | left out |
| `groups.ts` (`processGroup`, grace, `installGroupSignalForwarding`, `forwardedSignal`) | `RunOptions::process_group`, `ProcessGroups`, `kill_grace`, `ProcessGroups::stop_on_signals`, `Forwarded` | ported in part: signals are forwarded to the handles given, on request. No registry of live groups (a group outlives the host's exit only if its run returned first), no uninstall, and the host owns the exit, where the original sets the exit code and ends the process |
| `async.ts`, `stream.ts`, `process.ts`, `shell.ts`, fake process | none | out of scope: no async, no long-lived processes |

## Existing crates considered

| Piece | Crates looked at | Outcome |
| --- | --- | --- |
| Spawn, capture with a cap for each stream, stdin feed | `subprocess`, `duct`, `process_control`, `xshell` | Hand-written: `subprocess`, the closest, has one size limit for both streams together, and this runner caps each stream and tells "at the cap" from "past the cap" |
| Wait with a deadline, kill, reap | `shared_child`, `wait-timeout` | Hand-written: both get the deadline from a `SIGCHLD` handler installed for the whole process, and a library should not change its host's signal handling unasked |
| Forwarding SIGINT, SIGTERM and SIGHUP | `signal-hook` | Used, its `flag` module: the standard library cannot set a signal handler, and this crate forbids `unsafe`. Its actions run in the order they were registered, so a conditional default action registered first ends the host on a second signal |
| Bounded wait for a pipe a grandchild holds, and reading both pipes without a thread | `duct`, `subprocess` | Hand-written over `rustix::event::poll`: both crates wait until the grandchild closes the pipe, or time out and discard the output, and this runner returns the bytes read so far with `output_incomplete` set, from one loop on the calling thread that leaves no reader behind |
| Spawn failures told apart | `duct`, `subprocess` | Hand-written: both report a bad working directory as `NotFound`, the same as a missing binary, as `std` does |
| `PATH` lookup | `which` | Used for the executable test; the `which` row above says what the wrapper keeps |
| Shell quoting | `shlex`, `shell-words`, `shell-escape` | Hand-written: none writes the same text as the TypeScript twin, which fake-runner keys and failure messages are built from |
| Process group and group kill | `rustix`, `nix`, `process-wrap`, `command-group` | `rustix::process::kill_process_group` with `std`'s `process_group(0)`; `nix` is not built here in a current version, and `std`'s own group kill is nightly only |

Checked 2026-11-16; the `signal-hook` row 2026-11-20.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
