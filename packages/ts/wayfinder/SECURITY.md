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
- **Tasks run without a shell.** A task is spawned from an argument vector.
  Typed arguments are bound by the task's tool and never replace its binary.
- **The web view listens on 127.0.0.1.** Any local process and any page the
  browser visits can reach the port. A one-shot boot token and a session token
  protect every route. `/api/run` takes a task id from the server's own catalog,
  never a command. `/api/trust` refuses when a grant would not apply, so
  `--no-exec` cannot be lifted from the page.
- **Trust is keyed on the resolved path.** A trusted repository that later
  pulls hostile changes stays trusted until `way trust --untrust`.
