# @osdlc/command-seam

Run external commands through a small interface you can replace in tests.
Timeouts kill the process. Failures come back as values, not exceptions.

## Why

Code that calls `child_process` directly has three common problems:

- **It is hard to test.** You have to mock a Node module, or run the real
  binary in every test.
- **Timeouts do not always stop the command.** Node's `timeout` option sends
  `SIGTERM`, which a process can ignore. A forked grandchild can also keep the
  output pipes open, so the call waits long after the timeout.
- **Failures arrive in several shapes.** A missing binary, a timeout and a
  non-zero exit each show up differently.

This package gives you a _runner_: an object with one `run` method. Code that
needs to run `git` takes a runner as a parameter. In production you pass the
real one, `spawnRunner('git')`. In tests you pass a fake that returns canned
results. Every runner reports failures the same way, and a timeout always
kills the child with `SIGKILL`.

The name comes from the testing term "seam": a place where you can swap
behaviour without changing the code around it. Here the seam is the runner
parameter.

## When not to use it

- **You need Windows.** This package is tested only on Linux and macOS. See
  Requirements below.
- **You want shell-script ergonomics** (template strings, piping, globbing).
  Use [`zx`](https://www.npmjs.com/package/zx) or
  [`execa`](https://www.npmjs.com/package/execa).
- **You need to process output as a stream while the command runs**, with
  backpressure or line-by-line iteration. Use
  [`execa`](https://www.npmjs.com/package/execa),
  [`tinyexec`](https://www.npmjs.com/package/tinyexec) or `child_process`
  directly. The capture runners here buffer all output until the command
  ends.
- **You need a full process manager** (restarts, logs, health checks).

## Install

```sh
npm install @osdlc/command-seam
# or
pnpm add @osdlc/command-seam
# or
bun add @osdlc/command-seam
```

## Requirements

These are the facts today, not a support promise.

- **Node.js 22 or later** (`engines.node` is `>=22`). Node is the primary
  runtime.
- **Bun** also works, through the compiled `dist/`.
- **ESM only.** There is no CommonJS build.
- **POSIX only (Linux, macOS).** `runShell` needs `sh` on `PATH`. The
  `processGroup` options use POSIX process groups. Signals
  follow POSIX rules. Windows is untested and not supported for now.
- **TypeScript 5.4 or later.** The types use the `NodeJS` namespace, so
  install `@types/node` (an optional peer dependency).

## Quick start

```ts
import { CommandFailed, failureText, runChecked, spawnRunner } from '@osdlc/command-seam'

const git = spawnRunner('git')
const cwd = process.cwd()

// run() never throws for a failed command. Read exitCode yourself.
const status = git.run(['status', '--porcelain'], { cwd, timeoutMs: 10_000 })
if (status.exitCode === 0) console.log(status.stdout)
else console.error(failureText(status))

// runChecked() throws CommandFailed on a non-zero exit.
try {
  runChecked(git, ['push', 'origin', 'main'], { cwd, timeoutMs: 30_000 })
} catch (e) {
  if (e instanceof CommandFailed) console.error(e.detail)
  else throw e
}
```

## Concepts

- **Runner**: an object with a `run(argv, options)` method. `argv` is the list
  of arguments, without the binary name. The binary is fixed when you create
  the runner.
- **Result**: what a capture runner returns: `exitCode`, `stdout`, `stderr`,
  `neverExited`, `reason`, `signal`, `outputIncomplete` and `error`. `stdout`
  is a string, or a `Buffer` from the bytes runners (`CommandResult<Buffer>`).
- **`neverExited`**: `true` when the command never reported an exit status.
  The spawn failed, a timeout or abort killed it, a signal ended it, or the
  runner killed it at the output cap.
  `exitCode` is then a stand-in `1`. Check it before you treat an exit code as
  an answer: `grep` exits 1 for "no matches", and a missing `grep` must not
  look the same.
- **`reason`**: which of those causes it was, set whenever `neverExited` is:
  `'spawn'` (it never started), `'timeout'`, `'abort'` (the caller stopped
  it), `'signal'` (a signal from elsewhere ended it) or `'output'` (the
  output cap: `maxOutputBytes`, or the sync runner's default of 256 MB).
  `signal` names the signal when the runner knows it. A timeout may pass on a retry; a spawn failure or the output cap
  will not.
- **`outputIncomplete`**: `true` when the child exited but the runner stopped
  reading its output early, so `stdout` and `stderr` may be cut short. The
  exit code is real and `reason` is absent. See "`error` can come with a real
  exit code" under Behaviour.
- **`error`**: the runner's own message, such as a spawn error or
  `timed out after 500ms`. It is never copied into `stderr`, which holds only
  what the child wrote. `failureText` and `CommandFailed` read `error` when
  `stderr` is empty.
- **Checked call**: `runChecked` and `runCheckedAsync` throw `CommandFailed`
  when `exitCode` is not 0. Plain `run` calls never throw for a failed
  command; programmer errors throw (see Behaviour).

## Choosing a runner

| Need                                         | Use                                      | Returns                      |
| -------------------------------------------- | ---------------------------------------- | ---------------------------- |
| Run a command and read its output            | `spawnRunner(binary)`                    | `CommandResult`              |
| The same, without blocking the event loop    | `spawnRunnerAsync(binary)`               | `Promise<CommandResult>`     |
| Read stdout as raw bytes (images, archives)  | `spawnRunnerBytes(binary)` / `spawnRunnerBytesAsync(binary)` | `CommandResult<Buffer>` |
| Run a shell string (`a && b`, pipes)         | `runShell(verb, opts)` / `shellRunner()` | `CommandResult`              |
| Show output live (builds, interactive tools) | `streamRunner(binary)`                   | `StreamResult` (exit only)   |
| Start a long-running process and keep going  | `managedProcessRunner(binary)`           | `ManagedProcessHandle`       |
| Launch a program and forget it (an editor)   | `managedProcessRunner(binary)` with `stdio: 'ignore'`, `unref` | `ManagedProcessHandle` |

Use the sync runner for short commands run one after another. Blocking costs
them nothing and keeps your code synchronous. Use the async runner for
long-running commands, or to run several commands at once.

On timeout, the sync and streaming runners kill only the direct child, and
anything it started keeps running. A command that may start background work,
such as an install whose postinstall scripts spawn processes, belongs on
`spawnRunnerAsync` (or `managedProcessRunner`) with `processGroup: true`,
which kills the whole group.

### Capture, sync

```ts
import { spawnRunner } from '@osdlc/command-seam'

const git = spawnRunner('git')
const r = git.run(['rev-parse', 'HEAD'], { cwd: process.cwd() })
if (r.exitCode === 0) console.log(r.stdout.trim())
```

### Capture, async

The async runner adds three options: `signal` (an `AbortSignal`), `onSpawn`
(called with the child's pid once it starts) and `processGroup` (see
Timeouts and cancellation below).

```ts
import { spawnRunnerAsync } from '@osdlc/command-seam'

const git = spawnRunnerAsync('git')
const controller = new AbortController()
const [log, branch] = await Promise.all([
  git.run(['log', '-1', '--format=%s'], { cwd: process.cwd(), signal: controller.signal }),
  git.run(['branch', '--show-current'], { cwd: process.cwd(), timeoutMs: 5_000 }),
])
console.log(log.stdout.trim(), branch.stdout.trim())
```

### Capture, as bytes

The capture runners decode stdout as UTF-8, and decoding replaces bytes that
are not UTF-8 with U+FFFD. For output that is not text, or that must not
change before you hash it, `spawnRunnerBytes` and `spawnRunnerBytesAsync`
return stdout as the `Buffer` the child wrote. Their result type is
`CommandResult<Buffer>`, so the compiler knows `stdout` is a `Buffer`. Stderr
is still decoded as UTF-8: it is diagnostics, and `failureText`,
`runChecked` and `CommandFailed` read it as they do for text. They take the
same options as their text forms. `maxOutputBytes` cuts stdout at exactly the
cap, since there is no character to keep whole.

```ts
import { createHash } from 'node:crypto'
import { runChecked, spawnRunnerBytes } from '@osdlc/command-seam'

const git = spawnRunnerBytes('git')
const blob = runChecked(git, ['cat-file', 'blob', 'HEAD:logo.png'], { cwd: process.cwd() }).stdout
console.log(createHash('sha256').update(blob).digest('hex'))
```

`runChecked` and `runCheckedAsync` return `CommandResult<Buffer>` for a bytes
runner. A failure throws the same `CommandFailed` as any other run, with
stdout decoded into `e.result.stdout`. To keep the raw bytes of a failed run,
call `run` and check `ran(result)` yourself. Code takes a `BytesCommandRunner`
or an `AsyncBytesCommandRunner`, and tests pass `fakeRunner`'s `bytesRunner`
(see Ready-made fakes). `asAsync` wraps a sync bytes runner as an async one.

### Shell strings

Every other runner passes `argv` straight to the binary, so nothing is parsed
by a shell. `runShell` is the one function that runs a shell string, as
`sh -c -- <verb>`. The `--` keeps a verb that starts with `-` or `+` from
being read as an option to `sh`. Pass data as positional parameters (`$1`, `$2`, …) through
`args`, or quote it with `shellQuote`.

```ts
import { runShell, runShellAsync, shellQuote, shellRunner, spawnRunner } from '@osdlc/command-seam'

const cwd = process.cwd()
const file = 'notes with spaces.txt'

// Positional parameters are passed as separate arguments, never parsed.
const lines = runShell('wc -l < "$1"', { cwd, args: [file] })

// Or quote the value into the string.
const same = runShell(`wc -l < ${shellQuote(file)}`, { cwd })

const later = await runShellAsync('sleep 1 && echo done', { cwd, timeoutMs: 5_000 })

// Like every runner, it can run through a fake.
const sh = shellRunner(spawnRunner('sh'))
console.log(lines.stdout, same.stdout, later.stdout, sh.run('echo hi', { cwd }).stdout)
```

`runShell` takes the capture options (`timeoutMs`, `env`, `input`,
`maxOutputBytes`) and returns a `CommandResult`. A fake passed to `shellRunner`
receives `['-c', '--', verb]`, then `scriptName` and `args` when given.
`shellJoin(argv)` quotes a whole command line, for printing one a person can
paste.

### Streaming

`streamRunner` inherits stdin, stdout and stderr, so the child's output
appears as it runs. The result has no output, only how the child ended:
`exitCode`, `neverExited`, `reason` (`'spawn'`, `'timeout'` or `'signal'`),
`signal`, and `error`, the runner's message when the spawn failed or the
timeout fired. That message, or `<binary> was killed by <signal>`, is also
written to the parent's stderr. Pass `quiet: true` to turn that line off
when you report the failure yourself; the result's fields are set either way.

```ts
import { ran, streamRunner } from '@osdlc/command-seam'

const npm = streamRunner('npm')
const r = npm.run(['run', 'build'], { cwd: process.cwd(), timeoutMs: 600_000 })
// The runner has already printed why; exit 124 on a timeout, like `timeout(1)`.
process.exitCode = r.reason === 'timeout' ? 124 : ran(r) ? 0 : 1
```

`run` blocks until the child exits. There is no async version.

### Where stdio goes

`streamRunner` and `managedProcessRunner` take a `stdio` option
(`StdioOption`):

- `'inherit'`, the default: the child uses the parent's stdin, stdout and
  stderr.
- `'ignore'`: all three are `/dev/null`. The child cannot read from or
  write to the terminal.
- `{ stdout, stderr }`: file descriptors you opened, such as one from
  `fs.openSync`. Stdin is `/dev/null`. Pass the same fd for both to get one
  log in the order the child wrote it, which joining two pipes afterwards
  cannot give. `1` and `2` are the parent's own stdout and stderr.

The child gets its own copy of each fd when it starts, so you can close yours
once `run` returns. The runner never closes it. An fd that is not open is a
failed spawn (`reason: 'spawn'`, with `EBADF` in `error`). An fd that is not a
whole number, 0 or more, throws before anything starts. A pipe from one child
into another (`git archive | tar -x`) is out of scope; use `runShell` or
`child_process` for that.

```ts
import { closeSync, openSync } from 'node:fs'
import { streamRunner } from '@osdlc/command-seam'

const log = openSync('build.log', 'w')
const r = streamRunner('npm').run(['run', 'build'], {
  cwd: process.cwd(),
  stdio: { stdout: log, stderr: log },
  quiet: true,
})
closeSync(log)
if (r.reason === 'spawn') throw new Error(`npm failed to start: ${r.error}`)
```

### Managed process

`managedProcessRunner` starts a process and returns a handle at once. It does
not wait for the process to finish, capture output or apply a timeout. Its
options are `ManagedProcessRunOptions`: `cwd` (required), `env`,
`processGroup`, `unref` and `stdio`.

```ts
import { managedProcessRunner } from '@osdlc/command-seam'

const server = managedProcessRunner('node').run(['server.js'], {
  cwd: process.cwd(),
  processGroup: true, // kill() then signals the whole process group
})

console.log(server.pid) // -1 if the spawn failed
setTimeout(() => server.kill(), 5_000) // SIGTERM by default
const exit = await server.exited // never rejects
if (exit.reason === 'abort') console.log('stopped by kill()')
else if (exit.reason === 'spawn') console.error(`could not start: ${exit.error}`)
else console.log(exit.exitCode, exit.signal)
```

`processGroup: true` makes the child the leader of its own process group, so
`kill()` also stops any processes it started.

`unref: true` lets the parent exit while the child runs. With
`processGroup: true` and `stdio: 'ignore'` it starts a program and forgets
it, such as an editor or `open <url>`: the program outlives the parent, does
not keep it running, gets none of the terminal's signals, and does not write
to the terminal after the parent has gone.

```ts
import { managedProcessRunner } from '@osdlc/command-seam'

managedProcessRunner('code').run(['.'], {
  cwd: process.cwd(),
  processGroup: true,
  unref: true,
  stdio: 'ignore',
})
```

`exited` still settles while the parent is alive. An `unref`'d group is not
tracked by `installGroupSignalForwarding` (below).

A group leader no longer gets the terminal's Ctrl-C, and a host killed by a
signal would leave the group behind. Call `installGroupSignalForwarding()` once
at startup to prevent that:

```ts
import { installGroupSignalForwarding } from '@osdlc/command-seam'

installGroupSignalForwarding() // SIGINT, SIGTERM, SIGHUP; graceMs defaults to 1000
```

While a group is live, one of those signals sends `SIGTERM` to every live
group (async and managed runners with `processGroup: true`), then `SIGKILL` to
those still registered after `graceMs`, and the process exits with
`128 + signal number`. A second signal during the grace skips to `SIGKILL`. An
`exit` handler also `SIGKILL`s every group whose run is still in flight, so a
host that exits first leaves none behind. The listeners are attached just before the first
group starts and removed when the last one is gone, so a host with no live group
keeps each signal's default action. If the host has its own listener for the
signal (`process.once` counts too), the groups still get `SIGTERM` at once
and `SIGKILL` after `graceMs` (or on exit, if sooner and the run is in
flight), but that listener keeps the exit. By default the exit
sets `process.exitCode` and lets output drain, then calls `process.exit` after
500 ms, so piped stdout is not cut. A group stays registered until no member is
left, also after its async run settles or its managed leader exits. A
forwarded signal kills what such a group left behind, such as a daemon. The
host's normal exit leaves it running, unless the runner was stopping the group
(an abort, a timeout or `kill()`). `SIGKILL`
of the host cannot be caught. POSIX only; a no-op on Windows.
`liveProcessGroups()` lists the registered group pids.

When forwarding owns the exit (the host has no listener of its own for the
signal), the first forwarded signal puts the host in a stopping state. A new
run with `processGroup: true` is refused: it starts nothing and settles with
`reason: 'abort'`. `forwardedSignal()` returns the signal, so a host that runs
one command after another can stop its loop. `forwardedExitCode()` returns
`128 + signal number` for it. Only the uninstall function
resets this. A host with its own listener, one that may keep running, gets no
stopping state: its groups are killed, and later runs start as usual.

A host that sets `process.exitCode` itself after its work returns should keep
the `128 + signal number` code. The default exit still forces `process.exit`
after 500 ms:

```ts
installGroupSignalForwarding()
const code = await main()
process.exitCode = forwardedExitCode() ?? code
```

`exited` reports `reason: 'abort'` when a signal ends the process after your
own `kill()`, `'signal'` when a signal from elsewhere ends it, and `'spawn'`
with the error message in `error` when it never started.

`kill()` sends one signal. A process that handles `SIGTERM` and keeps
running leaves `await server.exited` waiting forever.
`stopProcess(handle, { graceMs })` sends `SIGTERM`, waits up to `graceMs`
(default 5 s), then sends `SIGKILL`, and resolves with the exit. It works
with any handle, fakes included. With `processGroup`, it waits for the
leader only: a group member that outlives the leader gets no `SIGKILL`.

```ts
import { managedProcessRunner, stopProcess } from '@osdlc/command-seam'

const server = managedProcessRunner('node').run(['server.js'], { cwd: process.cwd() })
const exit = await stopProcess(server, { graceMs: 2_000 })
// null if it exited on SIGTERM, 'SIGTERM' if SIGTERM killed it, 'SIGKILL' if it ignored SIGTERM
console.log(exit.signal)
```

The runner cannot tell you when the process is ready from its output: stdio
is never piped. Poll from outside instead: try the port or an HTTP
endpoint, or wait for a file the process writes, in a loop with a deadline.
Check `exited` after each try, so a process that died early is reported
rather than waited on.

## Default options

`withDefaults(runner, opts)` returns a runner that fills in `opts` on every
call. Code that runs many commands in one folder binds `cwd` (and often
`env` or `timeoutMs`) once. It works with every runner type.

```ts
import { spawnRunner, withDefaults } from '@osdlc/command-seam'

const git = withDefaults(spawnRunner('git'), { cwd: process.cwd(), timeoutMs: 30_000 })
git.run(['status'])
git.run(['fetch'], { timeoutMs: 120_000 }) // a per-call option wins
```

A per-call option replaces the default of the same name, except `env`: a
per-call `env` is merged over the bound one, key by key, so a client that
binds `LC_ALL=C` keeps it when one call adds a variable. A per-call `env`
value of `undefined` removes a bound variable. A per-call option set to
`undefined` keeps the default. The defaults are shallow-copied when bound,
so a bound `env` object is still shared.

`runChecked`, `runCheckedAsync`, `runJson` and `runJsonAsync` take the
runner's own options, so a bound runner needs only what it did not bind. The
result is also still a runner of the original type, so code that takes a
`CommandRunner` accepts it, and passes its own full options, which replace
the bound ones (a per-call `env` is merged, as above).

```ts
import { runChecked, runJson, spawnRunner, withDefaults } from '@osdlc/command-seam'

const gh = withDefaults(spawnRunner('gh'), { cwd: process.cwd(), env: { GH_PROMPT_DISABLED: '1' } })
const head = runChecked(gh, ['repo', 'view', '--json', 'name']).stdout
// This call's env is merged over the bound one: both variables reach gh.
const user = runJson<{ login: string }>(gh, ['api', 'user'], { env: { GH_HOST: 'github.com' } })
console.log(head, user.ok && user.value.login)
```

## Finding a binary

`which(binary, opts?)` returns the absolute path a spawn of `binary` would
run, or `undefined`, without running anything. Use it to pick a tool by what
is installed, where probing with `--version` is slow or has side effects.

```ts
import { which } from '@osdlc/command-seam'

const harnesses = ['codex', 'claude', 'cursor-agent'].filter((b) => which(b) !== undefined)
```

It looks a binary up the way the runners' spawn does: a name with a `/` is
resolved against `cwd`, a bare name is searched on `PATH`, and a match must
be an executable file. `opts` takes `cwd` (default `process.cwd()`) and
`env`, merged over the parent's as the runners take it, so
`which('tool', { env: { PATH: binDir } })` checks a test's own `PATH`.
An empty `PATH` entry means `cwd`, as it does for Node's spawn. Bun's spawn
skips empty entries, so under Bun `which` can find a binary there that a
spawn would not.

## Reading results

Small helpers that never throw for a failed command (a programmer error,
such as an invalid `timeoutMs`, still throws or rejects):

- `ran(result)`: the process started and exited 0. Takes any runner's
  result, including `StreamResult` and `ManagedProcessExit`.
- `failureText(result)`: trimmed stderr, else the trimmed `error`, else
  trimmed stdout, else `exit N`. `failureText(result, { both: true })` joins
  both trimmed streams instead, stderr (or `error`) first, and is empty when
  there is no text.
- `firstLine(text, fallback?)`: the first non-blank line, trimmed.
- `stderrOrError(result)`: trimmed stderr, else the trimmed `error`, else
  `''`. Use it where a message reads stderr, so a command that never ran
  still says why.
- `runJson(runner, argv, opts)` and `runJsonAsync`: run, check the exit code
  (`0` unless `okExitCodes` says otherwise), then `JSON.parse` stdout.
  `parseJsonResult(result)` is the parse step alone.

For "the answer, or a fallback when the command failed", read one command's
result with `ran`: `ran(r) ? r.stdout : null`. When several steps can throw
(a run of `runChecked` calls, or a helper that calls `runChecked` itself),
wrap them in `catchFailed` (see Reporting failures) instead of checking each
result.

`runJson` returns `{ ok: true, value, result }` or
`{ ok: false, reason, message, result }`. `reason` is `'failed'` (the command
did not run, or exited with a code not in `okExitCodes`), `'unparseable'`
(stdout is not JSON) or `'invalid'` (the `parse` option threw).
`tolerateLeadingLog: true` skips log lines printed before the JSON.

Some tools print JSON and exit non-zero on purpose: `npm outdated --json`
exits 1 when anything is outdated. `okExitCodes: [0, 1]` accepts those
codes. A run that never exited is still `'failed'`. An accepted non-zero exit
still needs output that parses, and the tool's own errors often use the same
code (npm prints `{ "error": … }` and exits 1), so pass a `parse` that
rejects the error output.

Without `parse`, the type parameter is not checked at runtime. Pass `parse`,
such as a schema's `parse` method, when you do not trust the producer. Its
return type becomes the value's type. When it throws, the outcome is
`invalid` and `cause` holds what it threw. `parse` must be sync: pass
`schema.parse`, not `schema.parseAsync`. A `parse` that returns a promise
gives `invalid` too.

```ts
import { runJson, spawnRunner } from '@osdlc/command-seam'

const gh = spawnRunner('gh')
const r = runJson<{ login: string }>(gh, ['api', 'user'], { cwd: process.cwd() })
if (r.ok) console.log(r.value.login)
else console.error(`${r.reason}: ${r.message}`)

// With a check: `parse` throws on a bad shape, and its return type is the value's.
const login = (v: unknown): string => {
  const name = (v as { login?: unknown } | null)?.login
  if (typeof name !== 'string') throw new Error('no login')
  return name
}
const checked = runJson(gh, ['api', 'user'], { cwd: process.cwd(), parse: login })
if (checked.ok) console.log(checked.value.toUpperCase())
else if (checked.reason === 'invalid') console.error(checked.message, checked.cause)
```

## Reporting failures

`CommandFailed` carries `binary`, `argv` and the full `result`. Its `message`
is `command failed (exit N): <binary> <argv>`, quoted by `shellJoin`, then the
stderr, or the runner's `error` when the child wrote no stderr. It never
includes stdout. Some commands explain a failure on stdout instead, such as a
git hook that rejects a commit. `e.detail` joins both
streams, trimmed, and drops empty ones: it is
`failureText(e.result, { both: true })`. Show `detail` to a person.

`runChecked` and `runCheckedAsync` take the binary from the runner's
`binary` property, which `spawnRunner`, `spawnRunnerAsync`, `asAsync` and
`withDefaults` runners have. A fake runner may leave it out; the message then
shows the argv alone and `e.binary` is `undefined`.

The message carries the full argv, so it reaches error logs and crash
reports. Do not pass a secret, such as a token in a URL, as an argument:
pass it through `env` or `input`.

`mapFailed(fn, mapper)` runs `fn` and, if it throws `CommandFailed`, throws
`mapper(e)` instead. `catchFailed(fn, onFailed)` returns `onFailed(e)`
instead. Other errors pass through unchanged. `mapFailedAsync` and
`catchFailedAsync` do the same for async functions, and their mapper or
handler may be async.

```ts
import { catchFailed, mapFailed, runChecked, spawnRunner } from '@osdlc/command-seam'

class DiffError extends Error {}

const git = spawnRunner('git')
const cwd = process.cwd()

const diff = mapFailed(
  () => runChecked(git, ['diff', '-U0'], { cwd }).stdout,
  (e) => new DiffError(`git diff failed: ${e.detail}`),
)

// Two steps that can fail: one catchFailed covers both.
const ahead = catchFailed(
  () => {
    const upstream = runChecked(git, ['rev-parse', '--abbrev-ref', '@{upstream}'], { cwd })
    const range = `${upstream.stdout.trim()}..HEAD`
    return Number(runChecked(git, ['rev-list', '--count', range], { cwd }).stdout)
  },
  () => undefined,
)
console.log(diff.length, ahead)
```

## Testing with fakes

Write code against the runner interface, and pass a fake in tests. A fake is
any object with a `run` method.

```ts
import { asAsync, spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'

// Code under test: takes a runner, defaults to the real one.
function currentBranch(cwd: string, git: CommandRunner = spawnRunner('git')): string {
  return git.run(['branch', '--show-current'], { cwd }).stdout.trim()
}

// A recording fake.
const calls: string[][] = []
const fake: CommandRunner = {
  run(argv): CommandResult {
    calls.push(argv)
    return { exitCode: 0, stdout: 'main\n', stderr: '' }
  },
}

console.log(currentBranch('/repo', fake)) // 'main'

// The same fake, for code that takes an AsyncCommandRunner.
const asyncFake = asAsync(fake)
console.log((await asyncFake.run(['status'], { cwd: '/repo' })).stdout)
```

A default parameter, or `opts.git ?? spawnRunner('git')` for a runner in an
options object, is all the injection needs.
`resolveRunner(binary, injected?)` and `resolveRunnerAsync` do the same as a
function call: the injected runner when there is one, else the real default.
`StreamRunner`, `ShellRunner` and `ManagedProcessRunner` are interfaces too,
so they can be faked the same way. `shellRunner(fake)` runs shell strings
through a fake `CommandRunner`.

### Ready-made fakes

`@osdlc/command-seam/testing` has the fakes, in their own entry point so
production code does not import them. It also exports their types:
`FakeRunner` (what `fakeRunner` returns), `FakeCall` (one recorded call),
`FakeProcess` and `FakeProcessOptions`.

- `fakeRunner(answers)` returns `{ runner, asyncRunner, calls }`. `runner`
  is a `CommandRunner` that answers from a table keyed by the argv, each
  argument quoted with `shellQuote` and joined with spaces: a plain argument
  stays as it is, and one with a space or a shell character is single-quoted,
  so `['-m', 'a b']` is `-m 'a b'`. Each answer lists only the fields that
  differ from `{ exitCode: 0, stdout: '', stderr: '' }`. `answers` can also be
  a function of `(argv, opts)`. A call with no answer reports a failed spawn,
  as a missing binary would: `neverExited: true`, `reason: 'spawn'`, and
  `fakeRunner: no answer for: <key>` in `error`, with the key you would add to
  the table. Code that reads a failed run as an answer can still go on, so
  assert on `calls`, which records each call's argv and options. `asyncRunner`
  is the same fake as an `AsyncCommandRunner`, for async code; the async
  options are recorded, and `onSpawn` is never called. `bytesRunner` and
  `asyncBytesRunner` are the same fake as bytes runners. An answer's `stdout`
  may be a string or a `Buffer`: the bytes forms encode a string as UTF-8, and
  the text forms decode a `Buffer`.
- `fakeNeverExited(reason, fields?)` builds an answer for a run that never
  exited: `exitCode: 1`, `neverExited: true`, `reason`,
  `error: 'fake: <reason>'` (none for `'signal'`), and `signal` where the
  sync runner sets one (`SIGKILL` for `'timeout'` and `'output'`, `SIGTERM`
  for `'signal'`). `fields` override any of them.
- `fakeProcess(opts?)` returns a `ManagedProcessHandle` that starts nothing.
  `exit(fields?)` settles `exited` with `{ exitCode: 0, signal: null }` and
  your fields. To fake a death by a signal from elsewhere, pass
  `{ exitCode: 1, signal, neverExited: true, reason: 'signal' }`, as
  `managedProcessRunner` reports it. `kill()` records the signal in `signals` and ends the process
  with `reason: 'abort'`. `exitOnKill: false` makes it survive every signal,
  and a list such as `exitOnKill: ['SIGKILL']` makes it die only of those,
  as a process that traps `SIGTERM` would. `runner` is a
  `ManagedProcessRunner` that returns the handle, and `calls` records what it
  was given, `stdio` and `unref` included, so a test asserts on them there.
  `pid` defaults to `4242`.

```ts
import { runChecked, stopProcess } from '@osdlc/command-seam'
import { fakeNeverExited, fakeProcess, fakeRunner } from '@osdlc/command-seam/testing'

const { runner, calls } = fakeRunner({
  'rev-parse --short HEAD': { stdout: 'abc\n' },
  "commit -m 'Fix login'": {},
  'fetch origin': fakeNeverExited('timeout'),
})
console.log(runChecked(runner, ['rev-parse', '--short', 'HEAD'], { cwd: '/repo' }).stdout)
console.log(calls[0]?.opts.cwd) // '/repo'

const stubborn = fakeProcess({ exitOnKill: ['SIGKILL'] })
console.log((await stopProcess(stubborn, { graceMs: 10 })).signal) // 'SIGKILL'

const proc = fakeProcess()
const server = proc.runner.run(['server.js'], { cwd: '/app' })
proc.exit({ exitCode: 0 })
console.log(await server.exited) // { exitCode: 0, signal: null }
```

## Timeouts and cancellation

- `timeoutMs` follows one rule on every runner that has it. `undefined` and
  `Infinity` mean no cap. A fraction rounds up, so `1.2` is `2`. A value
  above 2^31 - 1 (about 24.8 days), the largest timer delay, is clamped to
  it. `0`, a negative value and `NaN` are a caller error: `RangeError`,
  thrown by the sync runners and rejected by the async ones. A value that is
  not a number is a `TypeError`, the same way. Leave `timeoutMs` out, or
  pass `Infinity`, for no cap.
- `timeoutMs` kills the child with `SIGKILL`, not `SIGTERM`, so a child that
  ignores `SIGTERM` still stops. The child gets no chance to clean up. For a
  graceful stop on the async runners, pass `signal: AbortSignal.timeout(ms)`
  instead: an abort sends `SIGTERM` first.
- The async runner settles 250 ms after the child exits, even if a background
  process the child started still holds the output pipes. The pipes are then
  closed: that process loses any later output and may die of `SIGPIPE` on its
  next write. With `processGroup: true` the group is killed at that point.
  Redirect a daemon's output, or use `managedProcessRunner`, to keep it.
- The async runner resolves at the deadline. It does not wait for the output
  pipes to close, which a surviving grandchild could keep open.
- The result of a timeout has `neverExited: true`, `reason: 'timeout'` and
  the output captured so far. The sync runner also sets `signal: 'SIGKILL'`.
  Both runners set `error`: the async runner's is `timed out after <N>ms`,
  the sync runner's is spawnSync's `ETIMEDOUT` message.
- The sync capture runners wait for the output pipes to close, not only for
  the child to exit. If the child exits but a process it started still holds
  stdout or stderr, the run waits until `timeoutMs` (or, without one, until
  that process exits). The result then has the child's own `exitCode`,
  `outputIncomplete: true`, no `reason`, and spawnSync's `ETIMEDOUT` message
  in `error`. Output written after the deadline is lost, and the process
  keeps running. A run that may start background work belongs on an async
  runner with `processGroup: true`. Under `bun test` the sync runner captures
  through temp files instead of pipes (see Known issue: `bun test`), so it
  returns as soon as the child exits: later output is lost without
  `outputIncomplete` or `error`, and a test there never sees the flag.
- The sync runners (`spawnRunner`, `spawnRunnerBytes`, `runShell`,
  `shellRunner`) and `streamRunner` kill only the direct child on timeout.
  Processes it started keep running, and these runners have no option to
  change that. The async runners (`spawnRunnerAsync`, `spawnRunnerBytesAsync`,
  `runShellAsync`, `shellRunnerAsync`) take `processGroup: true` to kill the
  child's whole process group on timeout or abort. `managedProcessRunner`
  takes it too, so `kill()` signals the group.
- A `streamRunner` timeout prints its line to the parent's stderr, as a failed
  spawn or a signal does, unless `quiet` is set. With `stdio` set to an fd, the
  line still goes to the parent's stderr, not to the fd.
- A process group does not receive the terminal's Ctrl-C. To stop it on
  Ctrl-C, call `installGroupSignalForwarding()` once at startup, or listen
  for `SIGINT` and abort through `signal`.
- `signal` (async only) sends `SIGTERM`, then `SIGKILL` 1 s later if the child is still running. The
  `SIGTERM` lets a child such as git remove its lock files. The promise resolves at once, with
  `neverExited: true`, `reason: 'abort'` and `The operation was aborted` in `error`. An abort that
  lands after the child exited keeps the child's exit code. While a child ignores `SIGTERM`, the
  pending `SIGKILL` keeps the host alive for up to 1 s.

## Behaviour

- **`run` never throws for a failed command; programmer errors throw.** A
  missing binary, a timeout or an abort becomes a result with a non-zero
  `exitCode`, `neverExited: true` and a `reason`. An invalid `timeoutMs`
  (`RangeError`, or `TypeError` for a non-number) or a NUL byte in argv or
  env throws from a sync runner and rejects from an async one.
- **Capture runners always report something.** When the runner has its own
  message (spawn failure, timeout, abort, output cap), it is in `error`.
  `stderr` holds only what the child wrote.
- **The streaming and managed-process runners capture no output.** Their
  stdio is inherited by default, or `/dev/null` or file descriptors you
  pass through `stdio`. On a failed spawn they return `exitCode: 1`,
  `neverExited: true`, `reason: 'spawn'` and the message in `error`; an fd in
  `stdio` that is not open is a failed spawn too. The streaming runner also
  prints the error to the parent's stderr, and prints a line when a signal or
  the timeout ends the child, unless `quiet` is set.
- **`cwd` is required** on every call, on every runner. There is no
  default. Bind it once with `withDefaults`. A `cwd` that is missing or not a
  directory is a failed spawn (`reason: 'spawn'`) whose message names the
  `cwd`.
- **`argv` is never parsed by a shell.** Spaces, quotes and `$()` in an
  argument reach the binary unchanged. Only `runShell` runs a shell string.
- **`env` merges over `process.env`**, read at call time. A value of
  `undefined` removes that variable from the child's environment.
- **Early stdin close.** If the child closes stdin before `input` is fully
  written, the result keeps the child's exit code. The async runner and the
  sync runner on Node put the write error in `error`. The sync runner under
  Bun does not report it.
- **`error` can come with a real exit code.** `exitCode` is then the child's
  own and `reason` is absent. Three cases:
  - a failed stdin write: only `error` says what went wrong;
  - a sync run whose child exited while a process it started held the output
    pipes past `timeoutMs` (see Timeouts and cancellation): `outputIncomplete: true`;
  - a child that passes the output cap but exits before the runner's kill
    lands, on Node or Bun: `outputIncomplete: true`.

  `ran` and `runChecked` go by the exit code, so they treat the last two as
  success. Check `outputIncomplete` when the output must be whole.
- **Output is text, unless you ask for bytes.** Captured output is decoded as
  UTF-8. The bytes runners (`spawnRunnerBytes`, `spawnRunnerBytesAsync`)
  return stdout as the `Buffer` the child wrote and decode only stderr. A
  message built from a bytes result (`failureText`, `CommandFailed`) decodes
  stdout as UTF-8.
- **Output is capped per stream.** `maxOutputBytes` caps each of stdout and
  stderr on the capture runners. The sync pipe path defaults to 256 MB; the
  async runner has no default cap. The cap counts the bytes the child wrote,
  not the decoded text: bytes that are not valid UTF-8 decode to U+FFFD, which
  is 3 bytes, so a stream can be longer than the cap once decoded. A child
  that passes the cap is killed with `SIGKILL` (its group, with
  `processGroup`), with `reason: 'output'`, the runner's message in `error`,
  and that stream cut to the cap on a character boundary (a bytes runner's
  stdout at exactly the cap). A child that passes
  the cap but exits before the kill lands keeps its exit code and gets
  `outputIncomplete: true` and `error`. The `bun test` capture path writes to
  files and has no cap. `@osdlc/agent-call` has the same option on its call
  spec, with the reason `output-limit`; it stops the agent the way its timeout
  does (`SIGTERM`, then `SIGKILL` after 5 s), where this runner sends
  `SIGKILL` at once.

## Known issue: `bun test`

Under `bun test`, once a large module graph is loaded, Bun can hand child
processes stdio that the parent reads back as empty. The upstream report is
[oven-sh/bun#24690](https://github.com/oven-sh/bun/issues/24690). To work
around this, `spawnRunner` (and `spawnRunnerBytes`) checks for the Bun runtime with `NODE_ENV=test`.
When both are true, it runs the command through `/bin/sh` with stdin, stdout
and stderr redirected to temp files, then reads the files back. Arguments are
still not parsed by the shell.

This applies only under Bun. Jest and Vitest on Node use the normal pipe
path. The async runner does not have this workaround. If the test process is
killed during a run, its temp dir (`command-seam-*` in the OS temp dir) is
left behind.

## Stability

The package is at 0.x. Each export is stable or experimental.

- **Stable** exports are the runner contract: the runners, their options and
  results, `CommandFailed`, and the helpers around them. The runners and
  helpers are in use by other packages; a type that names their options or
  results is stable with them. A breaking change to one is marked
  **Breaking** in the CHANGELOG.
- **Experimental** exports are newer or have no user yet. Any release may
  change or remove one. Each has an `@experimental` tag in its TSDoc.

The experimental exports:

- `shellRunnerAsync`, `AsyncShellRunner`
- `spawnRunnerBytes`, `spawnRunnerBytesAsync`, `BytesCommandRunner`, `AsyncBytesCommandRunner`
- `catchFailedAsync`, `mapFailedAsync`
- `firstLine`, `stderrOrError`
- `runJson`, `runJsonAsync`, `parseJsonResult`, `JsonRun`, `RunJsonOptions`
- `withDefaults`, `DefaultedRunner`
- `which`, `WhichOptions`
- `stopProcess`
- `installGroupSignalForwarding`, `GroupSignalForwardingOptions`
- `liveProcessGroups`, `forwardedSignal`, `forwardedExitCode`
- `fakeRunner`, `fakeNeverExited`, `fakeProcess` (from `@osdlc/command-seam/testing`)
- `FakeRunner`, `FakeCall`, `FakeProcess`, `FakeProcessOptions` (from `/testing`)

Every other export is stable. 1.0 comes once the experimental exports have
gone 60 to 90 days without a breaking change, the open API-change questions
are settled, and Windows support has landed, if that is feasible.

## API

| Export                                                          | Kind      | Summary                                                        |
| --------------------------------------------------------------- | --------- | -------------------------------------------------------------- |
| `spawnRunner`                                                   | function  | Default sync capture runner (`spawnSync`)                      |
| `spawnRunnerAsync`                                              | function  | Default async capture runner (`spawn`)                         |
| `spawnRunnerBytes`, `spawnRunnerBytesAsync`                     | function  | Capture runners with stdout as raw bytes (`CommandResult<Buffer>`) |
| `resolveRunner`, `resolveRunnerAsync`                           | function  | An injected runner, else the default                           |
| `runChecked`, `runCheckedAsync`                                 | function  | Run and throw `CommandFailed` on a non-zero exit               |
| `mapFailed`, `mapFailedAsync`                                   | function  | Rethrow a `CommandFailed` as another error                     |
| `catchFailed`, `catchFailedAsync`                               | function  | Turn a `CommandFailed` into a value                            |
| `asAsync`                                                       | function  | Wrap a sync runner (text or bytes) as an async one             |
| `CommandFailed`                                                 | class     | Error with `binary`, `argv`, `result` and `detail`; `message` shows the command |
| `CommandRunner`, `AsyncCommandRunner`                           | interface | Capture runner contracts; `binary` names the program          |
| `BytesCommandRunner`, `AsyncBytesCommandRunner`                 | interface | The same, with stdout as a `Buffer`                            |
| `CommandResult`                                                 | interface | `exitCode`, `stdout`, `stderr`, `neverExited`, `reason`, `signal`, `outputIncomplete`, `error`; `CommandResult<Buffer>` for bytes |
| `NeverExitedReason`                                             | type      | `'spawn' \| 'timeout' \| 'abort' \| 'signal' \| 'output'`       |
| `CommandRunOptions`, `AsyncCommandRunOptions`                   | interface | `cwd`, `timeoutMs`, `input`, `env`, `maxOutputBytes`; async adds `signal`, `onSpawn`, `processGroup` |
| `EnvOverrides`                                                  | type      | `Record<string, string \| undefined>`                          |
| `ran`, `failureText`, `firstLine`, `stderrOrError`              | function  | Read a result                                                  |
| `FailureTextOptions`                                            | interface | `both`: join both streams in `failureText`                     |
| `runJson`, `runJsonAsync`, `parseJsonResult`                    | function  | Run and parse stdout as JSON                                   |
| `JsonRun`, `RunJsonOptions`                                     | type      | `runJson` result and options                                   |
| `runShell`, `runShellAsync`                                     | function  | Run a shell string with `sh -c --`                             |
| `shellRunner`, `shellRunnerAsync`                               | function  | Shell runner over a given `CommandRunner`                      |
| `ShellRunner`, `AsyncShellRunner`                               | interface | Shell runner contracts                                         |
| `ShellRunOptions`, `AsyncShellRunOptions`, `ShellPositionals`   | interface | Capture options plus `scriptName` (`$0`) and `args` (`$1`…)    |
| `shellQuote`, `shellJoin`                                       | function  | POSIX quoting for one word or a command line                   |
| `streamRunner`                                                  | function  | Default streaming runner (inherited stdio)                     |
| `StreamRunner`, `StreamRunOptions`, `StreamResult`              | type      | Streaming runner contract; options add `stdio` and `quiet`; the result adds `reason`, `signal`, `error` |
| `StdioOption`                                                   | type      | `'inherit' \| 'ignore' \| { stdout, stderr }` file descriptors   |
| `managedProcessRunner`                                          | function  | Default managed-process runner                                 |
| `stopProcess`                                                   | function  | `SIGTERM`, then `SIGKILL` after a grace period                 |
| `ManagedProcessRunner`, `ManagedProcessRunOptions`              | interface | Managed-process runner contract and options (`cwd` required; `env`, `processGroup`, `unref`, `stdio`) |
| `ManagedProcessHandle`, `ManagedProcessExit`                    | interface | `pid`, `kill()`, `exited`; how the process ended, with `reason` and `error` |
| `installGroupSignalForwarding`, `liveProcessGroups`, `forwardedSignal`, `forwardedExitCode` | function | Kill live process groups on `SIGINT`/`SIGTERM`/`SIGHUP`; list them; the signal forwarded and its exit code |
| `GroupSignalForwardingOptions`                                  | interface | `signals`, `graceMs`, `exit`                                   |
| `withDefaults`                                                  | function  | Bind default options to any runner                             |
| `DefaultedRunner`                                               | interface | The runner `withDefaults` returns                              |
| `which`                                                         | function  | The path a spawn of a binary would run, without running it     |
| `WhichOptions`                                                  | interface | `cwd`, `env`                                                   |
| `fakeRunner`                                                    | function  | `/testing`: a `CommandRunner` that answers from a table, with async and bytes forms |
| `fakeNeverExited`                                               | function  | `/testing`: a fake answer for a run that never exited          |
| `fakeProcess`                                                   | function  | `/testing`: a `ManagedProcessHandle` the test ends by hand     |
| `FakeRunner`, `FakeCall`, `FakeProcess`, `FakeProcessOptions`  | interface | `/testing`: the fakes' return, call and option types           |

`/testing` marks an export of `@osdlc/command-seam/testing`; every other
export is from `@osdlc/command-seam`. Every export has TSDoc in the source.
Runnable examples for each export are in the
[`examples` directory](https://github.com/osdlc/osdlc/tree/main/packages/ts/command-seam/examples).

## Alternatives

- [`execa`](https://www.npmjs.com/package/execa): full-featured process
  execution with strong Windows support and rich streaming. Choose it for
  most general use.
- [`tinyexec`](https://www.npmjs.com/package/tinyexec) and
  [`nano-spawn`](https://www.npmjs.com/package/nano-spawn): small,
  dependency-free wrappers over `spawn`. tinyexec also has a sync API.
- [`zx`](https://www.npmjs.com/package/zx): shell scripting in JavaScript.
- [`cross-spawn`](https://www.npmjs.com/package/cross-spawn): a drop-in
  `spawn` that handles Windows quirks.
- `node:child_process`: no dependency at all.

Choose this package when you want the runner as an injected dependency, a
timeout that kills with `SIGKILL`, and one result shape for every failure, on
Linux or macOS.

## Contributing

See
[CONTRIBUTING.md](https://github.com/osdlc/osdlc/blob/main/packages/ts/command-seam/CONTRIBUTING.md).
Report security issues as described in
[SECURITY.md](https://github.com/osdlc/osdlc/blob/main/packages/ts/command-seam/SECURITY.md).

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
