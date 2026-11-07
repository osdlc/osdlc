---
id: R-04
type: research
state: current
created: 2026-10-08
---

# cmux: driving a session for a dispatcher

Source: cmux 0.64.17 (97) `--help` output and read-only commands on 2026-10-08, plus published docs
(`cmux docs`, the cmux.json schema, `docs/cli-contract.md` on GitHub). Nothing was created, sent or
focused. Darwin only.

## Observed

- `cmux new-workspace --help`: `--name --description --cwd --command --env --layout --window
  --focus <true|false> --group ...`; `--focus` default false; `--command` "sends text+Enter".
- `cmux send [flags] [--] <text>`: `--workspace`, `--surface`, `--window`; `\n`, `\r` send Enter,
  `\t` sends Tab (so the host refuses text containing a CR, LF or a literal escape,
  `accepted: false`).
- `cmux send-key [flags] [--] <key>` (e.g. `enter`), same targeting flags.
- `cmux workspace select <workspace>` ("Make a workspace active"); `workspace list --json`.
- `cmux read-screen [--workspace --surface --scrollback --lines <n>]`.
- `cmux sessions list [--agent --session --workspace --surface --cwd --state-dir --limit --all --json]`:
  "does not require a running cmux socket"; reads `~/.cmuxterm/*-hook-sessions.json`. Run with
  `--cwd <dir> --json`: exit 0, envelope
  `{default_codex_home, limit, sessions: [], state_dir, stores: [{agent, exists, path, session_count}]}`.
  `--cwd` is a text filter. The store was empty, so the shape of a session row was NOT observed.
- Socket: `cmux ping` and `cmux --json workspace list` from outside cmux: `Error: ERROR: Access
  denied — only processes started inside cmux can connect`.

## Docs-only

- Enabling external socket access: `automation.socketControlMode` in `~/.config/cmux/cmux.json`
  (schema enum `off, cmuxOnly (default), automation, password, allowAll, ...`);
  `automation.socketPassword` with password mode; `cmux --help` "Socket Auth": `--password`, then
  `CMUX_SOCKET_PASSWORD`, then the Settings password. `socket-status` is in the contract doc but
  absent from 0.64.17 (unknown command).
- The contract doc lists `send --paste` and a draft guard (`--force`); not in 0.64.17 `--help`, not
  used.
- Field names read by the host (`agent`, `cwd`, `workspace_id`, `surface_id` per sessions row;
  `ref`/`id` and `cwd` per workspace row) are guesses, not observed.

## Captures needed (inside a cmux terminal)

`cmux sessions list --cwd <dir> --json` with a live claude session, and
`cmux --json workspace list`.
