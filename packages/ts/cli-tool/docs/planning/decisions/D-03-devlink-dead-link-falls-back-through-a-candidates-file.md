---
id: D-03
type: decision
state: accepted
created: 2026-11-05
---

# D-03: A dead devlink link can fall back through a plain-text candidates file

## Decision

- `ToolSpec.onDeadLink` is `'local'` (the default) or `'newest-surviving'`.
  With `'local'` a link naming a directory that is no longer a checkout is
  skipped, as before. With `'newest-surviving'` the link layer then runs the
  first surviving checkout in a list of earlier ones, newest first.
- Only a dead link falls back. No link (after `dev off`, or never linked)
  runs the install, and a suppressor turns the fall-back off with the rest of
  the link layer. The env and cwd layers still come first.
- The list is a third state file, `candidates`, beside `home` and
  `history.jsonl`: one absolute path per line, newest first. `resolve()` and
  the bash launcher both read this file and nothing else for the fall-back.
  Each skips a line that is not an absolute path, and neither trims a line.
  A missing or unreadable file is an empty list.
- `dev link` and `dev use` rewrite the file whole (atomically) each time, from
  the history: one line per checkout, most recently selected first, at most
  32. A checkout that is gone stays listed. A path with a line break is left
  out. `dev off` leaves the file alone.
- The file is written only for a spec that sets `'newest-surviving'`.
- A fall-back is reported as the `link` layer (`Selected.source`,
  `<NAME>_LAUNCH_LAYER`), with its own reason:
  `newest surviving checkout (the link names <path>, which is gone)`.
- Nothing rewrites the `home` file on a fall-back.

## Why

- The issue (#388) asks for the bash launcher to fall back too, and the
  launcher cannot parse JSON lines cheaply. A bare path per line is what
  `read -r` handles, as `cat` handles the bare `home` file.
- `resolve()` reads the same file rather than `history.jsonl`, so the two
  sides cannot disagree about the order or about which entries count. The
  test that keeps them in step drives each case through both.
- Rebuilding from the history, rather than prepending one line, means a tool
  that turns the option on later already has every checkout its users linked
  before, after their next `dev link`. It also keeps the file free of
  duplicates.
- Dead checkouts are kept because a worktree is often added again at the
  same path (`git worktree add ../feature-x`). Testing one is a single `stat`.
- The cap of 32 bounds the work the launcher does on every start with a dead
  link. Older checkouts stay in the history, where `dev use #n` reaches them.
- Writing the file only when the option is on keeps the state directory of
  every other tool as it was. Since the list is rebuilt from the history, a
  file written later loses nothing.
- `dev off` means "run the install". Falling back after it would undo it, so
  the fall-back needs a link to be dead, and `off` has no reason to touch the
  list.
- A new layer name would change `Source`, `--where` and every consumer that
  switches on the launch layer. The fall-back is still the link layer
  choosing, so it keeps that name and says what happened in its reason.
- The launcher and `resolve()` run on every start and never write state.
  Rewriting `home` would also hide from `dev status` that the link is dead.

## Consequences

- A launcher rendered from a spec without the option, or with `'local'`, is
  byte for byte what it was, so committed launchers do not drift.
- A tool that turns the option on renders its launcher again.
- `--where` in the process that runs says `link (<link file>)` on a
  fall-back too; `dev status` shows the dead link and what runs instead.
- Until the user's next `dev link` or `dev use`, there is no `candidates`
  file, so a dead link still runs the install.
