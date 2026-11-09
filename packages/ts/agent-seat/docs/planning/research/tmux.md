---
id: R-01
type: research
state: current
created: 2026-09-25
---

# tmux: driving a session for a dispatcher

Source: live checks against the installed tmux 3.6a binary, examined 2026-09-25. No tmux server
was running before the checks; a probe session was created and torn down afterward, confirmed
gone with `tmux ls`.

## Session creation

- **Verified.** `tmux new-session -d -s <name> -c <dir> -P -F '#{session_id} #{pane_id}' -- cat`
  creates a detached session running `cat` and prints its session id and pane id, for example
  `$0 %0`.

## Tagging and discovery

- **Verified.** `tmux set-option -t <session> @sd_task T-TEST` and `@sd_worktree <dir>` attach
  arbitrary key-value tags to a session.
- **Verified.** `tmux list-panes -a -F '...'` with a format string built from `#{session_name}`,
  `#{pane_id}`, `#{pane_current_path}`, `#{pane_pid}`, `#{pane_current_command}`,
  `dead=#{pane_dead}`, `task=#{@sd_task}` and `wt=#{@sd_worktree}` lists every pane on the
  server with the tags inlined.
- **Verified.** `tmux list-panes -a -f '#{==:#{@sd_task},T-TEST}' -F '#{pane_id}'` filters
  server-side by tag value and returns only the matching pane id.

## Sending input

- **Verified.** Two delivery paths both worked against a plain `cat` pane:
  - `load-buffer -b sdp -` (buffer content from stdin), then
    `paste-buffer -p -d -b sdp -t <session>`, then a separate `send-keys Enter`.
  - `send-keys -l 'text'`, then a separate `send-keys Enter`.
- **Verified.** Embedded newlines inside a pasted buffer are delivered as newlines, not as a
  submit. This differs from Orca, which always wraps a send in bracketed paste before its own
  separate Enter (see [`orca.md`](orca.md)) — a tmux pane running a TUI that
  does not itself request bracketed paste would instead see each embedded newline as its own
  Enter.
- **Not tested.** Neither path was run against Claude Code's own TUI, so paste/Enter timing and
  how it reacts to bracketed vs. unbracketed paste there are unconfirmed.

## Reading output

- **Verified.** `tmux capture-pane -p -t <session> -S -200` returns the last 200 lines of
  scrollback as plain text.
- **Not tested / no app-aware primitive exists.** tmux has no idle signal comparable to Orca's
  app-aware `terminal wait --for tui-idle`, which distinguishes "waiting for input" from "still
  computing quietly". tmux does have a coarser building block: the `monitor-silence <interval>`
  window option plus the `alert-silence` hook (verified in the tmux man page) fires on output
  quiescence alone, with no idea whether the pane is actually idle or just quiet. An "is this
  session idle" check would still have to be a heuristic — either built on repeated `capture-pane`
  snapshots, or on top of `monitor-silence`/`alert-silence` — see Open questions.

## Presence checks

- **Verified.** `tmux has-session -t <name>` exits 0 when the session exists, 1 when it does not.

## Naming rules

- **Verified.** tmux silently rewrites `.` and `:` in a session name to `_`. `bad.name` became
  `bad_name`. A later attempt to create `bad:name` then failed with `duplicate session: bad_name`,
  because it collided with the already-rewritten name.
- **Inferred.** Session names should stick to `[A-Za-z0-9_-]` to avoid silent rewrites and the
  name collisions they cause.

## Open questions

- How to detect idle vs. busy without polling `capture-pane` on a timer.
- Whether any of this needs to survive a reboot. tmux has no cold-restore step of its own — a killed
  tmux server loses scrollback outright, so any resumable state has to come from the engine's own
  session file (see the per-harness research, kept outside this package), not from tmux.

## Relevance to us

tmux gives find/tag/send/read primitives comparable to Orca's terminal CLI, with no app
dependency, but no idle detection and no cross-reboot persistence. It is a candidate second host
adapter alongside Orca; see the "Recommended shape" section of
[`orca.md`](orca.md) for how a host module should expose these.
