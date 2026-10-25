# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that
is the latest minor release.

## What to expect

This is a small project. We aim to reply within a week, tell you whether we
accept the report, and credit you in the release notes if you want that.

## Threat model

`way` reads a repository and can run its tasks. Reports about a repository
making `way` run code the user did not choose to run are in scope.

- **Reading a repository can run its code.** Some runners can only be read by
  running them (moon, mise tasks, sbt). They are withheld until the user trusts
  the repository with `way trust` or passes `--exec` for one run. A repository
  cannot trust itself: `allowExec` and `trust` in its own `wayfinder.config.json`
  cannot raise the gate.
- **Tool modules are code.** A module named by `--config` or the user file is
  the user's own choice. One named by the project file loads only when the
  repository is trusted and execution is allowed.
- **Detection turns off the git config keys that run commands.** Discovery and
  the owner lookup run git with `core.fsmonitor` off. The other keys that run
  commands (hooks, `diff.external`, `filter.*`, `core.sshCommand`,
  `core.pager`) do not apply to the git commands detection runs. git still
  reads the rest of `.git/config`, such as the `origin` URL and `insteadOf`
  rewrites.
- **Detection runs the git on your PATH, not one in the repository.** Every
  command detection and the owner lookup start is looked up on the absolute
  `PATH` entries only. A relative or empty entry (`bin`, `.`,
  `node_modules/.bin`) is skipped, and on Windows the current folder is not
  searched. An absolute entry is still searched, even one inside the
  repository: direnv's `PATH_add`, mise's `_.path` and `npx` add such
  entries, and each is a choice you made. `way providers` uses the same
  lookup, and a tool found only through a relative entry reads as not
  installed.
- **Owner trust believes the repository's own git config.** `trust.owners`
  matches the remote URL the repository's `.git/config` reports. That file
  comes with the directory: a folder from an archive or a shared drive can
  name any owner. Owner trust fits clones you made yourself. `trust.paths` is
  the stronger form, since a repository cannot choose where it is on your disk.
- **Repository text cannot drive the terminal.** Task names, docs, paths and
  config values have their control characters (C0, DEL, C1) and bidi controls
  (U+202A-202E, U+2066-2069) replaced with U+FFFD before the terminal UI,
  `list`, `query`, `trust`, `config`, `providers`, `dev`, the `serve`
  summary or stderr prints them. Copied commands get the same text. `--json`,
  `way dev … --json` included, keeps every value exact: C0 is escaped by JSON
  itself, and DEL, C1 and the bidi controls are written as `\u` escapes, so
  the output is safe to print. An error no command catches is printed the
  same way, on one line.
- **The installed `way` runs its own code.** It hands off to a checkout only
  when `WAY_HOME` (an absolute path) or `way dev link` names one, and only when
  that checkout's `package.json` is named `@osdlc/wayfinder`. `bun` is looked
  up on the absolute `PATH` entries only, like git. The checkout runs
  under Bun with `--no-env-file` and an empty config, so the `.env` and
  `bunfig.toml` of the directory you stand in are not read. A relative `HOME`,
  `XDG_*` or `WAYFINDER_CONFIG` is ignored, so no config, trust store or link
  file is looked up under that directory. The directory you run it in does not
  choose the code that runs.
- **Tasks run without a shell.** A task is spawned from an argument vector.
  Typed arguments are bound by the task's tool and never replace its binary.
- **The web view listens on 127.0.0.1.** Any local process and any page the
  browser visits can reach the port. Requests must name a loopback `Host` and
  carry no foreign `Origin`. A one-shot boot token signs the page in, and a
  bearer token protects every command and `/run`. `/run` takes a task id from
  the server's own catalog, never a command. Commands keep the flags `way
  serve` started with, so `--no-exec` cannot be lifted from the page, and a
  write of `allowExec`, a trust setting or `tools` is refused.
- **Trust is keyed on the resolved path.** A trusted repository that later
  pulls hostile changes stays trusted until `way trust --untrust`.
