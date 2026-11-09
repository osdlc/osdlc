# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository that hosts this
package: open its Security tab and choose "Report a vulnerability".

Include the version, a short description, and steps to reproduce. A minimal
code sample helps.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that
is the latest minor release. Upgrade to it.

## What this package runs

- Each host runs its app's CLI (`tmux`, `wezterm`, `cmux`, `herdr`, `orca`,
  `otty`, `curl`) as an argument vector through the command runner it is
  given. No shell parses the arguments, except where a host must hand one
  command line to a terminal app; that line is quoted for the target shell
  (POSIX `sh`, or PowerShell on Windows).
- The text a caller sends into a session (`send`) is typed into that session as
  is. The agent there reads it as a person's input.
- The `vscode` and `jetbrains` hosts read registry files under the caller's
  `runtimeDir` and talk to the window or IDE named there, on a local socket or
  on `127.0.0.1`, with the per-window token from that file. They send that
  window each session's command line (environment values included) and the
  text sent into it. `runtimeDir` must be private to the user (mode `0700`).
  On POSIX a registry directory or file that another user owns, or that its
  group or others can write, is ignored; the JetBrains host names it among the
  IDEs it skipped. Windows has no such check.
- Pane bindings are written under `<runtimeDir>/hosts/<name>/sessions/`.

## What to expect

This is a small project. We aim to reply within a week. We will tell you
whether we accept the report and keep you updated until a fix is released.
We will credit you in the release notes if you want that.
