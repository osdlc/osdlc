# @osdlc/agent-seat

Open an interactive coding-agent session where a person already works.

A tool that starts coding agents for a person (a task runner, a review bot,
an orchestrator) has to put each session somewhere the person can see and
answer it: a new terminal tab, a tmux session, a WezTerm pane, a VS Code
terminal. Each of those places has its own CLI or protocol, its own way to
name a pane, and its own failure modes. This package gives them one contract.

- A **host** is one place a session can open. Nine are built in: `terminal`,
  `tmux`, `wezterm`, `cmux`, `herdr`, `orca`, `otty`, `vscode` and `jetbrains`.
- A **harness** is the agent CLI that runs in it: `claude`, `codex`, `cursor`,
  `pi` and `opencode` have an interactive launch.
- The two are independent. Every host runs any harness, so where a session
  opens and which agent runs in it are separate choices.

A host fulfils the contract in parts: open a session, run a command, send text
into an open session, find, focus, capture its screen, close it, open a
workspace. A host offers only the parts its app supports. A caller asks for the
part it needs with `requirePart` and gets a `HostPartMissing` error naming the
host and the part when it is missing, never a silent fallback to another host.

**Not for:** headless agent runs whose output a program reads (`claude -p`,
`codex exec`); use [`@osdlc/agent-call`](https://www.npmjs.com/package/@osdlc/agent-call)
for those. Not for embedding a terminal in your own UI either: a host drives
an app the person already has.

## Install

```sh
npm install @osdlc/agent-seat
```

ESM only, with type declarations. Node.js 22.22.2 or later on the 22 line, 24.15.0 or
later on the 24 line, or 26 and later.

## Quick start

```ts
import { hostRegistry, requirePart } from '@osdlc/agent-seat'

// Hosts that remember panes keep their files under <runtimeDir>/hosts/<name>.
const hosts = hostRegistry({ runtimeDir: '/tmp/my-tool/run' })

const tmux = hosts.tmux
if (tmux.available()) {
  const open = requirePart(tmux, 'session')
  const { exitCode } = open({
    cwd: process.cwd(),
    harness: 'claude',
    binary: 'claude',
    prompt: 'Summarise the open TODOs in this repository.',
    title: 'todo review',
    sessionId: 'todo-review', // your id; later calls reach this pane by it
  })
}
```

Later, type into the same session and read it back:

```ts
const query = { cwd: process.cwd(), sessionId: 'todo-review' }

const receipt = requirePart(tmux, 'send')({ ...query, text: 'Also check FIXME comments.' })
// { accepted: true, ack: false }: typed and submitted; tmux cannot confirm the agent read it

const screen = requirePart(tmux, 'capture')(query) // what the pane shows now
```

`examples/readme.test.ts` and `examples/guide.test.ts` run these examples
against a recording command runner.

## Guide

- [Getting started](./docs/guide/getting-started.md): hosts, harnesses and parts;
  opening a session; choosing a host.
- [Working with open sessions](./docs/guide/sessions.md): send, find, focus,
  capture and close, and what a send receipt means.
- [Hosts](./docs/guide/hosts.md): what each host needs and how it behaves.
- [Testing](./docs/guide/testing.md): fake command runners and fake hosts.

Why the package has the shape it has, and the research on each host app, are in
[docs/planning/](./docs/planning/README.md).

## Hosts

| Host | Platforms | Needs | Parts beyond `session` and `terminal` |
|---|---|---|---|
| `terminal` | all | nothing; runs in the caller's own terminal and blocks until the session exits | none |
| `tmux` | macOS, Linux | `tmux` on `PATH` | send, find, focus, capture, close; can wait for the session to exit |
| `wezterm` | all | `wezterm` on `PATH` and a running WezTerm | send, find, focus, capture, close |
| `cmux` | macOS | the cmux app and its CLI | send, find, focus, capture, close |
| `herdr` | macOS, Linux | `herdr` on `PATH` | send, find, focus, capture, close |
| `orca` | macOS | the Orca app (its bundled CLI is found) | send, find, focus, close |
| `otty` | macOS | the otty app and its CLI | send, find, focus, capture, close |
| `vscode` | all | a VS Code, Cursor or Windsurf window with the `sdlc-host` extension | send, find, focus, close |
| `jetbrains` | macOS | a JetBrains IDE with the companion plugin, and `curl` | send, find, focus, open workspace |

`host.platforms` and `supportsPlatform(host)` say where a host runs;
`available()` says whether it can open a session right now.

The `vscode` and `jetbrains` hosts talk to a companion extension or plugin
over a local socket or loopback HTTP. The companions are not published yet, so
outside the project that builds them these two hosts report themselves
unavailable.

## Sessions, panes and state

A launch can carry a session id (`SessionRequest.sessionId`). A host binds
the pane it opens to that id, so a later `send`, `find`, `focus`, `capture` or
`close` reaches that pane even when another session shares the working
directory. Hosts that cannot name a pane by itself remember the binding in a
file under `<runtimeDir>/hosts/<name>/sessions/`; the VS Code and JetBrains
companions register their windows under `<runtimeDir>/hosts/<name>/`. Pass the
same `runtimeDir` to every process that should see the same sessions.

Each stateful host factory (`makeOrcaHost`, `makeHerdrHost`, `makeWeztermHost`,
`makeVscodeHost`, `makeJetbrainsHost`) takes `runtimeDir`, or `registryDir`
for the host's own directory.

## Harnesses

`harnessArgv(harness, binary, prompt, claudeFlags?, choice?)` builds the argv
for an interactive launch: the bare CLI with the first message, plus the model
and effort flags of a resolved `choice`. `harnessAvailable(harness, binary)` asks
whether `binary` is on PATH. `claudeSessionArgv` and `claudeHookSettings` build
the Claude Code flags a session can carry (plugins, a system prompt, hook
settings). `findCodexSessionId` finds the id of a codex session from its
rollout file.

## Compared with other tools

| Tool | Difference |
|---|---|
| [`@osdlc/agent-call`](https://www.npmjs.com/package/@osdlc/agent-call) | Runs an agent headless and returns its output to your program. This package opens a session a person sees and can answer. |
| `pi-terminal-mux` | One API over terminal multiplexers (tmux, zellij, WezTerm, herdr, cmux, otty, Orca). No caller's own terminal, no editors, no find, focus or open-workspace, and no notion of which agent runs where. |
| tmux wrappers (`node-tmux`, `libtmux`) | One multiplexer only. |
| Agent managers (claude-squad, ccmanager, uzi) | Applications with their own UI, mostly tmux-only, not libraries. |
| `node-pty` | Embeds a terminal in your own process. This package drives an app the person already has open. |

## Shell-outs

Every host runs its app's CLI through an injectable
[`@osdlc/command-seam`](https://www.npmjs.com/package/@osdlc/command-seam)
`CommandRunner` (the `runner` option), never through a shell string, so a test
can replace the app with a recording fake.

## API

The package entry exports the host contract (`Host`, `HostParts`,
`requirePart`, `HostPartMissing`, `supportsPlatform`, `HOST_NAMES`), one
factory per host, `hostRegistry`, the harness argv builders and
`ensureWorkspace`. Each export carries TSDoc; the [guide](#guide) shows them in
use.

## Stability

The package is at 0.x: a minor release may change any item. The items below are
experimental as well: they may change or go away in any release, and their TSDoc
says why.

- Hosts that need a companion that is not published yet: `makeVscodeHost`,
  `makeJetbrainsHost`, `JetbrainsSettings`, `JETBRAINS_PROTOCOL`,
  `liveWindows`, `subprocessTransport`, `VscodeWindow`, `VscodeReply`,
  `VscodeTransport`.
- tmux attach helpers, to be replaced by an `attach` part: `tmuxSessionName`,
  `tmuxIdSessionName`, `tmuxAttachArgv`, `tmuxSwitchClientArgv`, `insideTmux`.
- `hostCanWait`, to become a declaration on the host.

## Known limits

- Windows: not yet run on Windows. Env overrides (`withEnv`) and hosts that hand
  a terminal one command line go through Windows PowerShell 5.1, which passes
  an argument containing `"` to the program without escaping it and drops an
  empty argument; `powershell -Command` also reports the program's exit code
  only as 0 or 1.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
