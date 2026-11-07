---
id: D-02
type: decision
state: accepted
created: 2026-11-05
---

# D-02: A devlink spec's own state directory is a path under the home

## Decision

- `ToolSpec.stateDir` sets where devlink keeps a tool's `home` and
  `history.jsonl` when no override variable moves them. It replaces the `xdg`
  default, `${XDG_CONFIG_HOME:-~/.config}/<name>`.
- The value is a string, `~/` and then one or more segments of letters,
  digits, `.`, `_` and `-` (not `.` or `..`). It names the state directory
  itself; `<name>` is not appended. `validateSpec`, `renderLauncher` and
  `stateDir()` refuse any other value.
- The vendor's `<P>_CONFIG_DIR` and `<P>_ROOT` still win and still place the
  state at `<dir>/<name>` and `<root>/config/<name>`, on both sides. A relative
  override still throws in TypeScript and reads no link in bash, and
  `<P>_REQUIRE_OVERRIDE` still refuses a fall back to the home.
- `XDG_CONFIG_HOME` is not read when `stateDir` is set.
- In a test runner process the tiered-dirs test root wins over `stateDir`, as
  it wins over the `xdg` default. Injected `StateOptions.dirs` win over it.

## Why

- The issue (#480) offered "a string such as `~/.toolname`, or a function of
  the home directory". A function cannot be rendered into the bash launcher,
  so the launcher would read the wrong place, as it does when only
  `StateOptions.dirs` moves the state. Only a value bash can rebuild is
  accepted.
- Only a path under the home, not an absolute path: the link is per user.
  A fixed machine-wide path is what `<P>_CONFIG_DIR` already gives, and it
  would put one account's link in front of another's.
- The segment rule keeps the value safe inside the launcher's double-quoted
  string: no `$`, backquote, quote, backslash or space can reach bash.
  `renderLauncher` checks it itself, because a tool may render without
  calling `validateSpec`.
- The overrides keep their meaning so a test or a sandbox moves the state the
  same way for every tool, whatever its default.
- `XDG_CONFIG_HOME` belongs to the default being replaced. A tool that keeps
  state in `~/.tooly` has chosen not to follow XDG for it.
- The test root keeps a test from reading or writing the user's real link.
  Without it, a test of a tool that sets `stateDir` would touch `~/.tooly`.

## Consequences

- `@osdlc/cli-tool` depends on `@osdlc/tiered-dirs` directly, for `homeDir`,
  so the home is found by the same rule the `xdg` default uses: an absolute
  `HOME` (`USERPROFILE` on Windows), else the account's home. The bash
  launcher already used the same rule.
- A launcher rendered from a spec without `stateDir` is byte for byte what it
  was, so committed launchers do not drift.
- A tool that adds `stateDir` later moves its users' links. It renders its
  launcher again, and users run `dev link` once more (or move the old `home`
  file).
