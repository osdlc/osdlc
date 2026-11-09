---
id: R-05
type: research
state: current
created: 2026-10-08
---

# herdr: driving a session for a dispatcher

Source: live checks against herdr 0.9.3 (stable channel, protocol 22), examined 2026-10-08, plus
the CLI's own `--help` and `herdr --skill` text. All commands ran against a throwaway named
session, `sdlc-probe`, started with `herdr --session sdlc-probe server`; the default session was
never touched. The probe server was stopped and the session removed with
`herdr session delete sdlc-probe`, confirmed gone with `herdr session list --json`. No binary,
`strings` output or bundle was read.

## Server and sessions

- **Verified.** herdr is a server on a unix socket per session. Every command below failed with
  `{"error":{"code":"server_not_running","message":"no herdr server is running at <socket>; ..."}}`
  and exit 1 once the probe server was stopped. `herdr status server` exits 0 either way and prints
  `status: running` or `status: not running`.
- **Verified.** `herdr --session <name> <command>` and the `HERDR_SESSION` environment variable
  both select the session. A group name with no subcommand (`herdr pane`) prints its subcommands;
  `herdr <group> <sub> --help` prints that command's usage.
- **Verified.** CLI errors are JSON with an `error.code`, exit 1.
- **Docs only.** The skill text says the CLI also runs on Windows (a Codex-on-Windows note), but
  nothing was run there. The host stays darwin and linux.

## Workspace and pane creation

- **Verified.** `herdr workspace create --cwd <dir> --label <text> --no-focus` returns
  `result.workspace`, `result.tab` and `result.root_pane`; the pane to use next is
  `result.root_pane.pane_id` (`w1:p1`, tab `w1:t1`). `--no-focus` is accepted but the first
  workspace of an empty session still reports `focused: true`.
- **Verified.** The reported `cwd` is the resolved path: `--cwd /tmp/x` came back as
  `/private/tmp/x`. A matcher must compare real paths.
- **Verified.** `herdr pane run <pane> <command>...` types the command and Enter in one call and
  prints nothing on success. A command starting with `-` is taken as text.

## Listing

- **Verified.** `herdr pane list` returns `result.panes[]` with `pane_id`, `tab_id`,
  `workspace_id`, `cwd`, `foreground_cwd`, `agent_status` (`unknown` for a plain shell) and, only
  when herdr recognises an agent, `agent` (`claude`). `herdr agent list` returns `result.agents[]`
  with the same fields plus `name`, `agent_session` and `interactive_ready`.
- **Verified.** Neither list carries a last-output time.

## Sending input

- **Verified.** `herdr agent prompt <pane-id> <text> --wait --until working --until blocked
  --timeout <ms>` against a live claude pane returned exit 0 in about 0.6 seconds with
  `"type":"agent_prompted"` and `agent_status: "working"`. A pane id is accepted as the target.
  Without `--until`, `--wait` waits for the whole turn to settle (`idle`, exit 0, with
  `completion_seq`).
- **Verified.** Error codes from `agent prompt`: `agent_not_found` (plain shell pane, or unknown
  target), `agent_blocked` (claude at its folder-trust dialog; no input was sent),
  `timeout` (`--timeout 500` expired).
- **Docs only.** `agent_prompt_stalled`: with `--wait`, no `working` or `blocked` state within five
  seconds. The help text says a timeout or stall does not prove the prompt was not delivered.
- **Verified.** For a plain shell pane, `herdr pane send-text <pane> <text>` then
  `herdr pane send-keys <pane> enter` ran the text as a shell command. Neither confirms anything.
- **Verified.** `--` is not an option terminator: `pane send-text w1:p1 -- -q` typed `-- -q`. Text
  starting with `-` is accepted as-is, so argv needs no guard.
- **Not tested.** Multi-line text through `send-text`; the skill text says `agent prompt` honours
  the pane's bracketed-paste mode, `send-text` does not claim to.

## Reading output

- **Verified.** `herdr pane read <pane> --lines N` prints plain text (default source `recent`).
  Sources are `visible`, `recent`, `recent-unwrapped` and `detection`.

## Focus

- **Verified.** `herdr workspace focus <w>` and `herdr tab focus <w:t>` each print the focused
  object and exit 0; an unknown id gives `workspace_not_found` / `tab_not_found`, exit 1.

## Starting an agent

- **Verified.** `herdr agent start <name> --kind claude --pane <pane>` returned
  `agent_started` with `agent_status: idle` in a folder claude already trusted. In an untrusted
  folder it returned `agent_not_ready` (blocked on the trust dialog) but kept the name.
  The host does not use this; `session` runs the harness argv through `pane run`.

## Relevance to us

herdr covers every host part. `agent prompt --wait --until working --until blocked` is a host-side
receipt for recognised agents, which is the `ack` the router wants. A pane that herdr has not
(yet) recognised as an agent is never sent to: the verified `send-text` behaviour above would run
the message as a shell command, so the host refuses and the router moves to its next route.
