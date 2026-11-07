# agent-seat planning

Why `@osdlc/agent-seat` has the shape it has, and what is known about the apps
it drives. The [README](../../README.md) says how to use the package. This
folder says why.

## Layout

| Folder                     | Holds                                           | Ids    |
| -------------------------- | ----------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic   | `D-nn` |
| [`research/`](research/)   | What each host app does, verified or docs-only  | `R-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Each decision has a `state`: `accepted` or
`superseded`; a superseded decision names the one that replaces it. A research
note is `current` until the app changes under it.

## Decisions

- [D-01](decisions/D-01-hosts-declare-what-they-can-do.md): Hosts declare what
  they can do; callers never branch on a host's name.
- [D-02](decisions/D-02-state-under-the-callers-runtime-dir.md): State lives
  under the caller's runtime directory.
- [D-03](decisions/D-03-one-session-id.md): `sessionId` is the caller's id on
  every request; the harness's own id is `harnessSessionId`.
- [D-04](decisions/D-04-harness-ids-from-detect-harness.md): Harness ids come
  from `@osdlc/detect-harness`; the package keeps no table of its own.
- [D-05](decisions/D-05-stability-tiers.md): Stability tiers for the first
  release; `HostName` stays closed in 0.x.
- [D-06](decisions/D-06-name.md): The package is `@osdlc/agent-seat`.
- [D-07](decisions/D-07-first-version.md): The first public version is 0.7.1.
- [D-08](decisions/D-08-companion-wire-names.md): The companions' wire names
  (`sdlc-host`, `/api/sdlc/`) stay as they are until the companions ship.

## Research

Each note says which facts were run against the real app (**Verified**) and
which come from its documentation only (**Docs-only**).

- [R-01](research/tmux.md): tmux, driving a session for a dispatcher
- [R-02](research/orca.md): Orca, terminal session persistence across restarts
- [R-03](research/agent-status.md): agent status (working, idle, needs input)
  across hosts
- [R-04](research/cmux.md): cmux
- [R-05](research/herdr.md): herdr
- [R-06](research/jetbrains.md): JetBrains IDEs and the companion plugin
- [R-07](research/otty.md): otty
- [R-08](research/vscode.md): VS Code, Cursor and Windsurf, and the companion
  extension
- [R-09](research/wezterm.md): WezTerm
