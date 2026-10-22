# Hosts — where sdlc puts work in front of a person

A **host** is somewhere on this machine that can show a person their work:
the terminal they are in, a tab in a terminal app, a workspace in a
multiplexer. The contract lives in
`solutions/ontological/lib/services/host/contract.ts`; the implementations
sit one file each under `lib/services/host/hosts/`.

## Host and harness are independent axes

**Host** (`HostName`: `terminal` | `orca` | `cmux` | `tmux` | `herdr` | `otty` |
`wezterm` | `vscode` | `jetbrains`) answers WHERE a session runs. **Harness** (`Harness`, `lib/services/host/harness.ts`:
`claude` | `codex` | `cursor` | `pi`) answers WHICH coding-agent CLI runs
there. Every host is a WRAPPER: it opens a terminal/workspace and runs
`harnessArgv(req.harness, req.prompt)` (`harness.ts`) in it, so any host can
open any harness — the two vary independently, never a fixed pairing.

This was briefly not true: Phase 6 collapsed the two axes by making
`claude`/`codex`/`cursor` `HostName` values too, each hardcoding its own CLI
and ignoring the requested harness entirely. That collapse is undone: a
config field or CLI flag that names WHERE (`host:`) validates against
`HostNameSchema`, and one that names WHICH agent (`profile:`/`tool:`, `--tool`)
resolves to a `Harness` through tool-router's references — the two are never
interchangeable, and neither input accepts the other's values as an alias.

## The contract is fulfilled in parts

| Part | Request | What it does |
|---|---|---|
| `session` | `{cwd, harness, prompt, title, sdlcSessionId?}` | Open an interactive coding-agent session running `harness`, with `prompt` as its first message; returns `{exitCode, harnessSessionId}` |
| `terminal` | `{cwd, argv, title, sessionId?}` | Run `argv` in a terminal the person can see; returns the exit code |
| `send` | `{cwd, sessionId?, text}` | Deliver `text` into a session that is ALREADY OPEN (the pane bound to `sessionId`, else the one at `cwd`); returns `SendReceipt {accepted, ack, uncertain?}` |
| `find` | `{cwd, sessionId?}` | List live-or-dead sessions (those of `sessionId`, else at `cwd`), for reconciliation; returns `FoundSession[]` |
| `focus` | `{cwd, sessionId?}` | Bring the live session forward; returns `false` when there is none or the host call failed |
| `capture` | `{cwd, sessionId?}` | Recent screen text of the session; `null` when there is none or the host call failed. Feeds the receipt's `capture` probe |
| `close` | `{cwd, sessionId?}` | Close the session's pane and kill what runs in it; `true` only when the host reported the close, `false` for no pane, an unverified pane or a failed call. Where a launch left no pane identity to match, `close` leaves the pane open rather than closing a neighbour's |
| `openWorkspace` | `{cwd, notice?}` | For a host whose terminals live in a workspace (an IDE project): ensure one containing `cwd` is open, opening the cwd's git root when none is; idempotent. Returns `{root, opened}`; throws on failure |

Every part is optional on a host — a consumer asks for the one it needs with
`requirePart(host, 'session')` and gets `HostPartMissing` when the host lacks
it. There is no fallback to another host: the person chose this one, and a
session quietly opening somewhere else is worse than an error. `terminal`
returns the exit code to report — the process's own when the host waits on
it, `0` when it hands off to its own managed window. `session` returns that
same exit code alongside `harnessSessionId`: the host's own identifier for the
session it just started, best-effort and harness-dependent (`wrapperSession`
in `harness.ts`), `null` when none was determined — `sdlc session
list`/`session attach` ([[T-QMGC]]) look a launch back up by it. `available()`
says whether the host supports this OS and its binary or app is on this machine.
`send`, `find`, `focus`, `capture` and `close` never throw: a failed attempt is
`accepted: false`, `[]`, `false`, `null`, `false`. `SendReceipt.ack` is true only when
the HOST confirmed the harness consumed the input; a host that normally does
sets `acksSend: true`, which arms the receipt's `host-ack` probe. `uncertain`
is set when the text was accepted but the host cannot tell whether it landed
(`herdr` `timeout`/`agent_prompt_stalled`, `orca` input accepted without a
`turn_started` stage, `cmux` and `wezterm` when the Enter failed after the text
was typed). An uncertain send arms no `host-ack` and is never re-sent.

`openWorkspace` is called by one shared policy, `ensureWorkspace`
(`lib/services/host/open-workspace.ts`), which `session start` and the
dashboard's session open run before `session`/`terminal`: when
`host.open_workspace` is `true` (the default) and the host has the part, the
host opens the workspace first; `session start` prints one line saying so
(the dashboard open stays silent). A host without the part is launched as
before; `send`, `find`, `focus` and `attach` never call
it. This is deliberate even though a person who chose a host did not ask for a
new project: it fires only on a miss, the IDE's own trust prompt still gates the
open, and the printed line names what is happening. Each worktree opens as its
own workspace; a monorepo subfolder opens the whole repository (the git root),
and a git root that is the home directory or the filesystem root is refused in
favour of the cwd.
Today only `jetbrains` implements it; `vscode` (`code -r <folder>`) and `orca`
(repository registration) could.

Three more fields sit on `Host` beside the parts: `platforms` (the OSes it runs
on, or `'all'`), `platformHint` (optional, per unsupported OS: how to get the
host anyway) and `acksSend`.

## Addressing a session

Two sessions can share one worktree, so `cwd` alone cannot say which pane a message,
focus or close is for. A launch carries the sdlc session id (`SessionRequest.sdlcSessionId`,
the `SDLC_SESSION` of the harness; not `sessionId`, which on that request is Claude's own
`--session-id`), the host binds the pane it opens to it, and every later request passes
`sessionId` (the record id: the Router's live send and receipt capture, `session focus`,
`session attach`, liveness and reconcile). A host resolves the id first and `cwd` second:

- A pane bound to the id that has gone away resolves to NOTHING, never to a neighbour at the
  same `cwd`. (tmux is the exception below: a record that predates the binding has no
  id-named session, so the cwd-hash name is tried after the id's.)
- An id nothing was bound to (a record written before this, or a host that cannot bind)
  resolves by `cwd` as before. `close` is stricter: it needs the binding, or is
  `false`.

| Host | Bound by | Fallback | Verified |
|---|---|---|---|
| `tmux` | session name `sd-<first 12 characters of the id>` (a UUID's first 12 are 11 hex digits and a hyphen: 44 bits) | name `sd-<hash of cwd>` (older sessions) | live |
| `orca` | terminal `handle` from `terminal create --json`, remembered in `<runtime>/hosts/orca/sessions/<id>.json` with its cwd | first live agent terminal at the worktree | create reply shape from [[N-ZJDG-hosts-orca]], not run live here |
| `herdr` | root pane id from `workspace create`, remembered in `<runtime>/hosts/herdr/sessions/<id>.json` with its cwd | panes at the cwd, agents first | argv from `--help`; server not running here |
| `wezterm` | pane id from `cli spawn`, remembered in `<runtime>/hosts/wezterm/sessions/<id>.json` with its cwd | pane this host spawned at the cwd | docs only |
| `otty` | `[sd-i-<first 12 of the id>]` in the tab title | `[sd-<hash of cwd>]` title tag (older tabs) | docs only (`pane list --json` shape never seen) |
| `vscode` | the id stored on the terminal by the companion's `open`; `send`/`focus`/`close`/`list` carry it | terminals bound to no session, by cwd | handler and client unit tests |
| `cmux` | cannot bind: no tag the list commands read back | `cwd` | n/a |
| `jetbrains` | cannot bind: the plugin tracks tabs by project and cwd and is unbuilt | `cwd` | n/a |

## Closing a pane

`host.close_pane` (`sdlc.yaml`; `on-close-out` default, `on-done`, `never`) says when sdlc calls
`close`. `on-close-out`: closing out a merged task closes the panes of every session recorded on
`task/<basename>`, best effort, from `sdlc task close-commit` (the close-out skill's step before it
removes the worktree; `session/close.ts`), so the manual skill and the orchestrator's `close-out`
workflow both do it. `on-done`: `sdlc session done` closes the session's own pane once the
declaration is written; that kills the harness, and the `session run` wrapper records the end from
the `done` already on the record. `never`: nothing is closed.

| Host | `close` | Command | Verified |
|---|---|---|---|
| `tmux` | yes, by the id's own name only (no cwd-hash fallback) | `tmux kill-session -t <name>` | live |
| `orca` | yes | `orca terminal close --terminal <handle> --json` | `--help` and [[N-ZJDG-hosts-orca]] (`ptyKilled`) |
| `herdr` | yes, only while the remembered pane still sits at the remembered cwd | `herdr pane close <pane>` | `--help` only |
| `wezterm` | yes, only a spawned pane still listed at the remembered cwd | `wezterm cli kill-pane --pane-id <id>` | docs only (not installed) |
| `otty` | yes | `otty pane close --pane <id> --yes` | `--help` only (app not running) |
| `cmux` | yes, one workspace at the cwd only | `cmux workspace close <workspace>` | `--help` only; the CLI can hang on its socket |
| `vscode` | yes, only a terminal bound to the id | companion `close` op disposes the terminal | unit tests |
| `jetbrains` | no close | the plugin is unbuilt; no close op | n/a |
| `terminal` | no close | the current terminal; nothing to close | n/a |

## Hosts today

| Name | Mechanism | Platforms | Parts | Ack |
|---|---|---|---|---|
| `terminal` | Spawns in place with inherited stdio — the one sanctioned raw spawn, marked `@sdlc:ignore-spawn`. Always waits (`hostWaits`, `session/ops/launch.ts`): it IS the current terminal. | all | `session`, `terminal` | no |
| `orca` | `orca terminal create --worktree path:<cwd> --command …`; registers the repo and retries once on a miss. Hands off. `send` is `orca terminal send`; `focus` is `orca terminal switch`; `close` is `orca terminal close`. Input accepted without a `turn_started` stage is `uncertain`. [[N-ZJDG-hosts-orca]] | macOS | `session`, `terminal`, `send`, `find`, `focus`, `close` | yes (`turn_started` stage) |
| `cmux` | `cmux workspace create --cwd <cwd> --command …`; `send` types then `send-key enter` (text containing a newline, CR or a literal `\n`/`\r`/`\t` is refused, `accepted: false`; Enter failing after the text is `uncertain`); `find` reads the hook store, then the workspace list. Socket calls need `automation.socketControlMode` other than `cmuxOnly` when run outside cmux. Resolves by `cwd` only; `close` acts only when exactly one workspace is at the cwd. [[N-CMX4-hosts-cmux]] | macOS | `session`, `terminal`, `send`, `find`, `focus`, `capture`, `close` | no |
| `tmux` | `tmux new-session -d -s <name> -c <cwd> -- <argv>`, detached; the name comes from the session id (`tmuxIdSessionName`), else a hash of `cwd` (`tmuxSessionName`). `send` is `load-buffer`, `paste-buffer`, then `send-keys Enter`. `find` is alive/dead only (no harness identity, no output recency) and its handle is the tmux session name; `focus` is `switch-client`, only inside tmux; `close` is `kill-session`. [[N-C7QF-hosts-tmux]] | macOS, Linux | `session`, `terminal`, `send`, `find`, `focus`, `capture`, `close` | no |
| `herdr` | `herdr workspace create` then `pane run`; panes found by listing and matching cwd. `send` is `herdr agent prompt` and only targets a pane herdr recognises as an agent, so a plain shell is refused. `close` is `pane close`. Needs a running herdr server; never starts one. [[N-H3RD-hosts-herdr]] | macOS, Linux | `session`, `terminal`, `send`, `find`, `focus`, `capture`, `close` | yes (exit 0 = agent reacted; `timeout`/`agent_prompt_stalled` = accepted, `uncertain`, no ack) |
| `otty` | `otty tab new` with a `[sd-i-<id>]` (else `[sd-<hash of cwd>]`) tag in the title; `send` is bracketed-paste `pane send-keys` plus `key:Enter`. `close` is `pane close`. Needs the app running. Docs-only: the app was not running when written. [[N-OTY7-hosts-otty]] | macOS | `session`, `terminal`, `send`, `find`, `focus`, `capture`, `close` | no |
| `wezterm` | `wezterm cli spawn`; panes found by `cli list --format json`; `send` is `send-text` then a separate `\r` (Enter failing after the text is `uncertain`) and types only into panes this host spawned (remembered in `<runtime>/hosts/wezterm/panes.json`; the pane of each session id in `sessions.json`); `find`, `focus` and `capture` use the session's pane, else any pane at `cwd`; `close` is `cli kill-pane` and only for a spawned pane. Needs a running GUI or mux. Docs-only. [[N-WZTM-hosts-wezterm]] | all | `session`, `terminal`, `send`, `find`, `focus`, `capture`, `close` | no |
| `vscode` | A terminal in the VS Code, Cursor or Windsurf window whose workspace contains `cwd`, via the `sdlc-host` companion extension (`packages/ts/vscode-host`, one private socket per window). Never opens a window unasked. `send`, `focus` and `list` see only terminals the extension created via `open`. `sendText` reports nothing. `open` carries the session id and the extension binds the terminal to it; `close` disposes the terminal. `close` needs a companion that knows the `close` op; an older companion answers an unknown op and the close reports false. [[N-VSCH-hosts-vscode]] | all | `session`, `terminal`, `send`, `find`, `focus`, `close` | no |
| `jetbrains` | A terminal tab in the IDE with the project open, via the companion plugin (`packages/kotlin/jetbrains-host`) over loopback HTTP with a per-IDE bearer token. `openWorkspace` asks an IDE to open the cwd's git root (the cwd outside a repository, or when git fails or the root is the home directory or filesystem root) through `POST /api/sdlc/project/open`, when `host.open_workspace` is on and no open project contains the cwd; the IDE's own trust prompt is not bypassed, and `terminal`/`session`/`send`/`find`/`focus` never open a project themselves. With several IDEs running, `host.jetbrains.ide` (a product name, matched in full, ignoring case) picks one. The tab's process is the harness, started by a POSIX login shell (`$SHELL`, else `/bin/sh`) or directly on Windows (argv over the wire, never a quoted string), and the plugin tracks only the tabs it opened; `send`, `find` and `focus` target only live ones. The plugin waits at most 3 s (then 2 s more for work already begun) for the IDE's UI thread, so a busy IDE or an open modal dialog answers `503` (nothing was done) or `504` (outcome unknown; a `504` on `terminal/open` may still produce a tab, so callers must not retry blindly) instead of hanging a request; `ping` carries the IDE's `pid`, and the host skips an entry whose ping answers as another pid (a stale file whose port another process holds). The terminal API reports no consumption, so `ack` is always false. [[N-J3TB-hosts-jetbrains]] | macOS | `session`, `terminal`, `send`, `find`, `focus`, `openWorkspace` | no |

### Discovery registries

`vscode` and `jetbrains` find their IDE through files the extension or plugin
writes; `wezterm` remembers the panes it spawned, and `wezterm`, `orca` and `herdr`
remember which pane belongs to which session id. All sit under
`<runtime>/hosts/<name>/` (`registry.ts`; `<runtime>` is sdlc's runtime
directory, [[S-0011-application-state-locations]]). A dead pid or malformed
file is skipped.

| Host | Path | Contents | Permissions |
|---|---|---|---|
| `vscode` | `<runtime>/hosts/vscode/<pid>.json` | `{version, pid, app, endpoint, token, folders, startedAt}` | dir 0700, file 0600; the socket is 0600 (a default-ACL named pipe on win32) |
| `jetbrains` | `<runtime>/hosts/jetbrains/<pid>.json` | `{protocol, pid, port, token, startedAt}`; `protocol` is `2`, an IDE whose entry or ping reply carries another value, or whose ping `pid` differs from the file's, is skipped with the reason named | dir 0700 (an existing one is tightened), file 0600 (created so, POSIX only); stale pid files swept when the plugin publishes its entry; with the same project open in two IDEs the newest `startedAt` wins |
| `wezterm` | `<runtime>/hosts/wezterm/panes.json` | the last 50 pane ids spawned | default (no chmod) |
| `wezterm`, `orca`, `herdr` | `<runtime>/hosts/<name>/sessions/<session id>.json` | `{pane, cwd}`, one file per session so concurrent launches cannot lose each other (`hosts/session-panes.ts`) | default (no chmod) |

`session` on every host is `wrapperSession` over its `terminal`. `vscode`
and `jetbrains` have no `capture`: neither API reads a terminal back.
`orca` has none either.

### Platform support

Per [[S-0021-windows-and-posix-platform-support]]: macOS and Linux are tier 1, Windows tier 2. Each
host lists its `platforms`; off-platform `available()` is false and `detect-hosts` prints "not
supported on <os>". A host with no verified behaviour on a platform leaves it out. `tmux` has no
native Windows build and is the one recorded WSL exception; its `platformHint` makes the report read
"not supported on win32 — run sdlc inside WSL" (no WSL probe); `terminal` and `wezterm` cover native
Windows. Binary lookup goes through `which` and command strings through `commandString`
(`lib/util/platform.ts`), never `sh -c`.

Adding a host is one file under `hosts/`, a name in `HOST_NAMES`
(`HostNameSchema` derives from it — the one schema every `host:`-shaped
config field and CLI flag validates against), and an entry in
`hostRegistry()`; a host that cannot run arbitrary commands simply leaves
`terminal` undefined.

## The harness axis

`Harness` (`claude` | `codex` | `cursor` | `pi`) is pure argv-building and
naming, independent of any host: `harnessArgv(harness, prompt)` returns the
bare CLI with `prompt` as its first message, guarded behind a `--`
end-of-options marker for every binary. `harnessAvailable(harness)` probes
its binary on PATH — checked before every interactive launch
(`startSession`, `session/start.ts`), so a hands-off host never
opens a pane whose command dies immediately. A harness has no default host of
its own; `host.default` (or a feature's own `host` key) picks the host,
always.

Per-harness native message injection (`harnessNativeSend`, distinct from a
host's own `send` part) reaches the harness's process/daemon directly when
one exists — today only `codex`, via `codex queue --thread <id> --message
<text>`.

## Session records, list and attach

Every `sdlc session launch` — headless or interactive, whichever host it
opened on — writes one `SessionRecord` to `.sdlc/log/sessions/<id>/record.json`
under the project root (`lib/services/log/session-record.ts`). There is one
record location for every host, not one per host. A record carries `host`
(`null` for headless), `engine` (the harness), `harnessSessionId`, `cwd`,
`launched`, `startedAt`, `endedAt`, `exitCode`, and `logPath` (`null` for
interactive — its output is never captured).

- **`sdlc session list [--host <name>]`** — reads every record under
  `.sdlc/log/sessions/`, skips one that fails to parse, and prints a table
  (most-recently-started first) or `(no sessions)` when empty.
- **`sdlc session attach <id>`** — looks the record up by id and dispatches
  on `host` first, then — for any real host — on `engine` (harness): resume
  is ENGINE-native and host-independent, so the same harness-keyed branches
  apply regardless of which host actually opened the session (`claude
  attach <id>`, `codex resume <id>` — or best-effort `codex resume --last`
  without one — `cursor-agent --resume=<id>`, the `=`-bound form; `pi` has no
  session-id resolver yet, so it always prints a how-to). `host === null`
  (headless) prints where the captured log landed instead. That resume spawn
  is a raw, blocking, `stdio: "inherit"` child — the same exception as
  `terminal`'s spawn above.
- **`sdlc session focus <target>`** — resolves a task id, PR number or URL,
  or branch to a branch, finds that branch's session record, and calls the
  host's `focus`. When the host has no `focus` part or it returns `false`,
  it exits non-zero and prints `sdlc session attach <id>` (plus `tmux
  attach-session -t <name>` for tmux).
- **`sdlc task start <task> [--host <name>] [--tool <ref>] [--no-focus]`** —
  starts a task yourself. It takes the task lease with owner kind `human`
  (phase `claimed`; a person runs no heartbeat, so the lease never expires and
  the orchestrator never dispatches the task), launches an interactive
  `task-work` session through the normal session start (origin `person`, any
  host, `terminal` included) and focuses it. `task-work` itself creates the
  `.sdlc/worktrees/<basename>` worktree on `task/<basename>` and moves the lease
  to `working`. A lease anyone else holds is refused. Re-running reuses a human
  lease this machine holds: it focuses the live session, or, when none is
  live, starts a new session under the same lease. The orchestrator still
  reviews and closes out the PR.
- **`sdlc session adopt [--task <task>] [--harness-session <id>]`** — run inside a
  session sdlc did not start. It writes a record bound to the current directory,
  branch and task, with the host read from the environment (`TMUX`, `ORCA_*`,
  `WEZTERM_PANE`, `TERM_PROGRAM=vscode`, ...), Claude's `CLAUDE_CODE_SESSION_ID`
  as the harness session and `CLAUDE_PID` as the process when that process is
  alive (else no pid). It prints the session id and the `export SDLC_SESSION=<id>`
  line. Hooks cannot be added to a Claude session that is already running, so
  the record is `launch-only`: `running` until `sdlc session done`, dead once its
  process exits. It refuses a session a live record already tracks.

## Session state

A session's state lives on its `SessionRecord` (`lib/services/log/session-record.ts`),
the projection of its event log (`lib/services/log/session-events.ts`): `starting` |
`running` | `waiting_for_input` | `idle` | `done` | `ended`. `done` is the
agent's own `sdlc session done` declaration (record `done`): only a new prompt
(`UserPromptSubmit`) or the end leaves it, so the `Stop` that follows the call
does not. There is no second,
per-lease record. `lib/services/log/adapters/claude-status.ts` maps a harness's own
hook payload (`claudeHookStatus` for Claude) onto that vocabulary, and the hook
reporter (`ops/hook.ts`) appends the resulting events. Hooks reach every
harness in `HOOK_HARNESSES` (claude, codex, cursor, pi, opencode: injected per launch for
claude, a per-launch forwarder for pi and opencode, installed hook files for codex and cursor;
codex only once the user approves them); other harnesses read `running` from launch on
([[N-70QE-sessions]]). `session list`'s `state`
column is the record's state.

## Registering a live session for the Router

The orchestrator's Router (`lib/services/dispatch/router.ts`) has a `live`
delivery route: send fresh PR feedback straight into a session that is
already open, instead of a cold `pr-respond` dispatch. It finds that session
by branch — `dispatch/session-lookup.ts`'s `findSessionForBranch` resolves
the PR's head branch to the `SessionRecord` whose `branch` field matches
(preferring one still running, `endedAt === null`), and `attemptLive`
(`router.ts`) only actually sends into it when that record also carries a
non-null `host` with a `send` part. `SessionRecord` is the ONLY thing this lookup reads.

A human registers a live session for a PR by running `sdlc session launch`
from the PROJECT ROOT the orchestrator itself uses (the main checkout — NOT
`cd`ed into the task worktree), naming the worktree with `--cwd`:

```sh
sdlc session launch --host tmux --tool claude --prompt <first-message> --cwd <task-worktree>
```

This matters because `resolveProjectRoot` (`@lib/config`) picks the nearest
ancestor directory that has its own `sdlc.yaml` — and a worktree, being a
checkout of the same repo, has one too. Run the launch command from INSIDE
the worktree instead (`cd <task-worktree> && sdlc session launch ...`, or
`--cwd .`), and the `SessionRecord` lands under
`<task-worktree>/.sdlc/log/sessions/`, not `<main-checkout>/.sdlc/log/sessions/` —
exactly where an orchestrator running from the main checkout never looks.
`findSessionForBranch` then simply finds nothing, so `live` always falls
through to `resume`/`fresh`: it fails SAFE, but silently — no error, no log
line, just a route that never gets tried.

Run that way, the single command is sufficient — no extra registration step
exists or is needed. `tmux` is a
hands-off host (`hostWaits('tmux') === false`, `session/ops/launch.ts`), so
the launch writes `SessionRecord.host: 'tmux'` and `endedAt: null`
immediately, and `branch` from the worktree's checked-out branch — exactly
the shape `findSessionForBranch`/`attemptLive` need, with zero duplication
between "what launch writes" and "what the Router reads." Every host except
`terminal` works the same way (hands-off, fulfils `send`); `terminal` never can
(`hostWaits('terminal') === true` — the session has already ended, by
definition, once the launch command returns), so a `live` delivery to it
always falls through to `resume`/`fresh`.

Two config flags gate this end to end: `orchestrator.router.enabled` (route
`prs`/`merges` feedback through the Router at all — default true) and
`orchestrator.router.live_enabled` (allow the `prs`/`merges` loop to
*attempt* `live` on its own — default **false**, since it is unverified
end-to-end against a real hosted session). An explicit
`sdlc pr route <n> --route live` attempts the route regardless of
`live_enabled` — that is a single manual op confirming the route works from
the pane, which is how `live_enabled` gets earned in the first place; the
loop's own automatic dispatch still respects the flag. Set `host.default:
tmux` to make `sdlc session launch` open tmux sessions by default, without a
`--host` flag on every invocation.

### Delivery receipt

After `send`, the Router waits up to `orchestrator.router.receipt_timeout_ms`
(default 15000; `0` checks once) for evidence the harness took the text in
(`dispatch/receipt.ts`, `confirmDelivery`). Every applicable probe runs on each
poll; the strongest wins.

| Probe | Strength | Source |
|---|---|---|
| `host-ack` | confirmed | the host's own `SendReceipt.ack` |
| `hook` | confirmed | a `turn.prompt` in `activity.jsonl` at or after the send whose `sha256` matches (else, with no digest, whose `bytes` match) |
| `state` | probable | `events.jsonl` moved `idle` to `running` after the send |
| `claude-state` | probable | Claude's own `<claude home>/sessions/*.json` for the session reads `busy`, updated after the send |
| `capture` | probable | the host's `capture` shows the tail of the text on screen (weakest: typed-but-unsubmitted text is also on screen) |

`armed` lists the CONFIRMING probes that could have fired: `host-ack` when the host acks sends and
the send was not `uncertain` (or the receipt already has `ack`), `hook` when the record says
`capture: hooks` for a hook harness (`HOOK_HARNESSES`; codex only once approved),
`log.capture.activity` is on, and the session state is not `running` (a mid-turn prompt is queued
and its hook fires late). A silent armed probe is evidence of failure; with nothing armed, silence
proves nothing. Router outcomes for `live`:

| Receipt | Outcome |
|---|---|
| `confirmed` | `delivered` |
| `probable` | `unconfirmed`, still counted as won |
| `none`, nothing armed | `unconfirmed`, won |
| `none`, something armed | route failed; chain moves to `resume`/`fresh` |

The router never types the same pointer into a session twice: it keys each
send by (session, sha256 of the text) and skips `live` (`alreadySent`,
`dispatch/delivery-record.ts`) when that pair was already typed, since the first
copy is queued or sitting in the input box and a late receipt is not a lost
send.

Before sending, `live` is skipped when the session state is
`waiting_for_input`: Enter would answer the permission prompt instead of
delivering the message. `resume`/`fresh` do not run while the branch's
session is alive; when `live` did not deliver, the feedback file is written
and the delivery holds with a `session-alive` reason (`--route … --force`
overrides). The result carries `evidence` and `armed`.

### Known limitations of the `live` route

- **Stale records are reconciled, not instant.** A hands-off launch runs its
  harness under `sdlc session run`, which records the process pid and writes the
  real end, so a record has a pid and one liveness answer
  (`session/liveness.ts`: `endedAt`, pid, the host's `find`, the process scan).
  A wrapper killed outright, or a pane closed by hand, leaves `endedAt` null
  until `sdlc session reconcile` (run at the start of every orchestrate pass)
  closes the record as `lost`, after its quiet period; on win32
  the launch is left unwrapped (the argv is PowerShell there), so it has no pid
  and the `SessionEnd` hook ends it; a record with no pid and no other signal reads
  `unknown`, which the session-alive hold treats as possibly running.
- **The target is the record's pane, not the branch's.** `send` passes the record's
  session id (see "Addressing a session"), so a reused worktree's other session is not
  reached. A host that cannot bind an id (`cmux`, `jetbrains`), and a record written
  before ids were bound, still fall back to `cwd`, where delivery for the ORIGINAL
  branch's PR can land in another session in that directory.
- **Paste-plus-Enter is otherwise unconditional.** Beyond the
  `waiting_for_input` gate, nothing checks the pane is idle: a human mid-prompt
  gets the text appended to theirs. The gate depends on `state` being current,
  which needs hooks (see Session state).
- **The hook probe covers the hook harnesses.** It is armed for claude, codex, cursor, pi and
  opencode (`HOOK_HARNESSES`), and those sessions also see `waiting_for_input`. A codex session
  whose hooks are not yet approved gets no hook events, so it relies on `host-ack` and the
  weaker probes until then.
- **Hosts without an ack are probable at best.** `tmux`, `cmux`, `otty`,
  `wezterm`, `vscode`, `jetbrains` have no `host-ack`; for a non-claude
  harness the receipt tops out at `probable`, and a `none` there counts as
  `unconfirmed` (won) with nothing to fall back on.
- **`cmux` refuses text with newlines or escapes.** `cmux send` reads `\n`,
  `\r` and `\t` as keypresses, so `send` refuses any text containing a CR, LF
  or those literal escapes (`accepted: false`) rather than submit early.
- **`otty` finds panes by a title tag** (`[sd-i-<id>]`, or `[sd-<hash>]` on an older tab) because
  `pane list` was never observed to carry a cwd; a renamed tab is not found. The host is docs-only,
  as is `wezterm`: neither was verified against a live app.
- **`vscode` and `jetbrains` start one subprocess per request**, because the
  host parts are synchronous and a Node socket is not.
- **The JetBrains plugin has run live only in a `runIde` sandbox on macOS, so the host lists
  `darwin`.** In
  `solutions/ontological/packages/kotlin/jetbrains-host`,
  `./gradlew buildPlugin verifyPluginStructure test` (JDK and Gradle pins in that directory's
  `mise.toml`) compiles it against IntelliJ IDEA 2025.3 (Reworked Terminal API) and writes
  `build/distributions/sdlc-host-0.1.0.zip`. The wire format is pinned by the golden files in
  `protocol-fixtures/`, read by both the plugin's JUnit tests and `jetbrains.test.ts`; Plugin
  Verifier results and open live checks are in [[N-J3TB-hosts-jetbrains]].

## Choosing a host

`pickHost(config, requested, featureSetting)` applies the one precedence rule
every consumer shares: an explicit request (e.g. `--host`), else the
feature's own key (`pr_review.host`, `workflows.<name>.host`), else
`host.default` in `sdlc.yaml`. The tool follows a parallel shape,
independently (`lib/services/route/route.ts`): `--tool`, else the feature's
own binding (`pr_review.profile|tool`, `workflows.<name>.profile|tool`),
else `profiles.default`, else a hardcoded default (`'claude'`).

## Consumers

- `sdlc pr review` — `session` in the PR's worktree.
- `sdlc session launch` — `session` (or headless spawn), on the host
  `pickHost` resolves (`--host`, else `workflows.<name>.host` for a
  `--workflow` launch, else `host.default`), running the tool `--tool`/
  `workflows.<name>.profile|tool`/`pr_review.profile|tool` resolves; writes the
  `SessionRecord` `session list`/`session attach` read.
