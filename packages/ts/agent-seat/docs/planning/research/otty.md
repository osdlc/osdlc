---
id: R-07
type: research
state: current
created: 2026-10-08
---

# otty: driving a session for a dispatcher

Source: `otty --version` (otty 1.5.4) and `otty help <noun> <verb>` on 2026-10-08. The Otty app was
not running, so no control command could be driven. Only read-only commands were run. Darwin only.

## Not running

- **Observed.** `otty pane list --json` with no app: exit nonzero, stderr `error: Cannot connect to
  Otty at ~/Library/Application Support/io.appmakes.otty/otty.sock: No such file or directory (os
  error 2). Is Otty running?`. The host treats any nonzero exit as "no session".
- **Observed.** `otty tab`, `otty pane`, `otty window` are documented "requires running app".

## Flags (all from `otty help ...`, observed)

- `otty tab new`: `--window`, `--cwd`, `--command`, `--title`, `--after`, `--no-focus`. Global:
  `--json`, `--format`, `--socket`, `--timeout`, `-q`, `-y`.
- `otty pane send-keys [PARTS]...`: `--pane`, `--bracketed-paste`; parts are "text and key parts
  (e.g. "hello" key:Enter)".
- `otty pane list`: `--window`, `--tab`.
- `otty pane focus [PANE]`: `--pane`, `--direction`, `--line`.
- `otty pane capture [PANE]`: `--pane`, `--scope`, `--lines`, `--ansi`, `--trim`.
- `otty pane wait` exists ("idle when the agent reports idle"); not used yet.

## Docs-only / unverified

- **Gap.** The output of `pane list --json` was never seen. Whether it carries a cwd, a tab title or
  a pane `id` field is unknown. The host matches a pane by a cwd-like field (`cwd`,
  `working_directory`, `current_directory`) OR a tag `[sd-<hash of cwd>]` that `tab new` appends to
  the title, and reads `id`/`pane_id`. All of it is a guess until captured.
- **Unverified.** That a `--` before the text keeps clap from reading a `-`-prefixed text as a flag
  while `key:Enter` is still parsed as a key part.
- **Unverified.** That `tab new --json` output and `--command` (run by a shell) behave as in the
  host.

## Captures needed (Otty running)

`otty pane list --json` (with a tab created by `otty tab new --cwd <dir> --title x --no-focus`),
and `otty pane capture --pane <id>`.
