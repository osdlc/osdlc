---
id: R-09
type: research
state: current
created: 2026-10-08
---

# WezTerm: driving a pane for a dispatcher

Source: the published WezTerm CLI reference only. WezTerm was NOT installed on the machine, so
nothing below was run; every item is **docs-only** and unverified against a live binary.

Pages: `https://wezterm.org/cli/cli/spawn.html`, `send-text.html`, `list.html`,
`activate-pane.html`, `get-text.html`.

## Spawning

- **Docs-only.** `wezterm cli spawn [--cwd <dir>] [--new-window] [-- PROG...]` prints the new
  pane id on success (`1`, `2`). The docs recommend `--` before the program. Failure output and
  exit code are not documented.

## Sending input

- **Docs-only.** `wezterm cli send-text [--pane-id N] [--no-paste] [TEXT]`; omitted TEXT is read
  from stdin. `--no-paste` sends the text directly rather than as a bracketed paste.
- **Targeting.** `send` types only into panes this host spawned (pane ids remembered in
  `<runtime>/hosts/wezterm/spawned/<pane id>.json`), never a plain shell; `find`, `focus` and
  `capture` use any pane at `cwd`.
- **Not documented.** How to send Enter. The host sends `\r` as a second `--no-paste` call,
  assuming it reaches the pane as a carriage return. Unconfirmed.

## Discovery

- **Docs-only.** `wezterm cli list --format json` is an array of `{window_id, tab_id, pane_id,
  workspace, size{rows,cols}, title, cwd}`; `cwd` is a `file://` URL (`file://foo/home/wez/`).
  There is no output-recency or harness field. Windows cwd URL shape (`file:///C:/...`) is
  inferred, not documented.

## Focus and reading

- **Docs-only.** `wezterm cli activate-pane [--pane-id N]` (needs 20230326 or later). The page
  says nothing about raising the OS window.
- **Docs-only.** `wezterm cli get-text [--pane-id N] [--start-line] [--end-line] [--escapes]`
  writes the screen (not scrollback by default) to stdout; needs 20230320 or later.

## Without a running instance

- **Not documented.** The cli needs a running GUI or mux server; the host treats any non-zero
  exit as "no session".
