---
id: R-08
type: research
state: current
created: 2026-10-08
---

# VS Code, Cursor, Windsurf: a companion extension host

Sources: the published extension API (code.visualstudio.com/api and the `@types/vscode`
declarations), and the build and unit tests of this change. No other extension's
shipped code was read. Nothing here was run inside a live editor; see "Not verified".

## Why an extension

VS Code's integrated terminals belong to the extension host. Nothing outside the editor can create a
terminal, type into one or list them: there is no CLI verb for it (`code` opens files and windows
only). The API that does these things (`window.createTerminal`, `Terminal.sendText`,
`Terminal.show`, `window.terminals`, `Terminal.shellIntegration.cwd`) is only callable from inside
an extension. So the host needs a companion that exposes those calls over a local channel. Cursor
and Windsurf are VS Code forks that run the same extension API, so one extension serves all three.

## Prior art

Marketplace and registry listings found by search (listing level only):

- [sendToTerminal](https://github.com/wan230114/vscode-sendToTerminal) and
  [copy-from-terminal](https://github.com/babakks/vscode-copy-from-terminal): in-editor commands
  that move text to or from the terminal, driven by the user's keystrokes, with no external control
  channel.
- The API reference for [Terminal](https://vscode-api.js.org/interfaces/vscode.Terminal.html).

No listing offering an external process control of terminals turned up. The channel here is our own
design: a local socket per window, which is the usual shape for an editor that must be driven from
outside.

## Wire protocol

JSON lines over a stream socket. One request object per line, one response per line, matched by
`id`. Every request carries the window's `token`.

| op | request | result |
|---|---|---|
| `ping` | | `{pid, app, folders}` |
| `open` | `{cwd, title, argv}` | `{terminalId}`: `createTerminal({name, cwd, shellPath: argv[0], shellArgs: argv.slice(1)})`, then `show()` |
| `send` | `{text, cwd \| terminalId}` | `{accepted, ack: false, terminalId}`: one bracketed paste (an embedded end marker is removed), then `sendText('', true)` |
| `list` | | `{terminals: [{id, name, cwd}]}` for terminals this extension created via `open` only; cwd is `shellIntegration.cwd`, else the creation cwd, else null |
| `focus` | `{cwd \| terminalId}` | `{focused}`: `show()` |
| `capture` | `{cwd \| terminalId}` | `{supported: false, text: null}` |

`ack` is always false: `sendText` returns void and gives no consumption signal, so sdlc reports such
a send as `unconfirmed`. `capture` is unsupported because the published API has no read-back for an
arbitrary terminal (only `onDidWriteTerminalData`-style proposals, which are not stable); the host
therefore omits the `capture` part. `send`, `focus` and `list` see only terminals created by `open`:
any other terminal may be a plain shell, which would run sent text as a command. A `cwd` target
picks, among those, the terminal at that cwd, exact before descendant, the active one before others,
the newest last. Terminal ids (`t1`, `t2`) are stable for the life of the window only.

Errors reply `{id, ok: false, error}`. A bad or missing token gets `bad token` and runs nothing.

## Discovery registry

Each window writes `<runtime dir>/hosts/vscode/<pid>.json`
(`{version, pid, app, endpoint, token, folders, startedAt}`), where the runtime dir is the caller's
`runtimeDir` (for sdlc, its runtime directory, `.../sdlc`). It rewrites the file on
`onDidChangeWorkspaceFolders` and deletes it on deactivate. A crashed window leaves a file behind;
the host ignores entries whose pid is dead.

The endpoint is `<runtime>/ipc/vscode-<pid>.sock` on POSIX and `\\.\pipe\sdlc-vscode-<pid>` on
Windows. The extension re-derives the runtime dir (it cannot depend on fleet); a test
in sdlc asserts parity with the real resolver under each `FLEET_*` override, and a
`sdlcHost.runtimeDir` setting overrides it for installs where the mirror is wrong. The macOS path is
the only OS default checked against the real resolver here; the Linux and Windows branches follow
the `tiered-dirs` table and are unverified live.

`hosts/vscode.ts` resolves `cwd` to the window with the deepest workspace folder containing it
(newest window on a tie). With no match, `terminal` and `session` throw "no VS Code window has
`<cwd>` open — open it, with the sdlc-host extension installed"; the host never runs `code -r` to
open a window unasked.

## Security

- POSIX: the socket is chmod 0600 inside a 0700 directory; the registry directory is 0700 and each
  file
  0600. Windows: the named pipe keeps its default ACL.
- A per-window 256-bit random token, written only to the registry file, is required on every request
  and compared in constant time. Another user cannot read the file or reach the socket; another
  process of the same user can read both, which is the same boundary as that user's own terminals.
- Lines over 1 MiB drop the connection.

## Sync client

The host contract is synchronous and a Node socket is not. The client runs each request in a
one-shot `<runtime> -e` child that connects, sends one line and prints the reply; the child goes
through the command seam (`spawnRunner`). This is a subprocess per request (tens of milliseconds),
accepted for `send`, `find` and `focus`. A real fix is an async host contract, which is a contract
change.

## Where it lives

The extension, `sdlc-host`, is kept with sdlc (`packages/ts/vscode-host` in sdlc's source tree):
only this package's `vscode` host consumes it. Its `protocol.ts` has no sdlc imports; this
package's `src/hosts/vscode-client.ts` restates the wire shapes, and a test in sdlc pins both to the
same paths.

Build: `cd packages/ts/vscode-host && bun run build` in sdlc's tree (a `bun build` bundle to
`dist/extension.cjs`, `vscode` external). Package: `bun run package` runs
`bunx @vscode/vsce package` fetched on demand, not a dependency, giving `dist/sdlc-host.vsix`.
Install it by hand with `code --install-extension`; publishing to the Marketplace and Open VSX is a
later decision.

## Not verified

Everything that touches a real editor: activation, the real `createTerminal` with
`shellPath`/`shellArgs`, `sendText` into a TUI, `shellIntegration.cwd` availability (it needs shell
integration enabled), Cursor and Windsurf behaviour, remote/WSL windows (the extension runs on the
remote side there, the host and the registry on the local one), and the Windows pipe.
