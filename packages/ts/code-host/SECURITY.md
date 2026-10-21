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

This package runs `gh`, `git` and `curl` and reads what they print. It can
comment on, update and merge pull requests, so a wrong argument can change a
repository. Reports about arguments reaching those tools in a form the caller
did not intend are in scope.

- **No shell is involved.** Each value is passed as one argument.
- **GitHub credentials belong to `gh`.** The package reads no GitHub token.
- **The Forgejo token is read from the environment** (`FORGEJO_TOKEN` by default, or the variable
  the `forgejoTokenEnv` option names) and sent to `curl`. The child process inherits the caller's
  environment.
- **The remote picks the host.** `origin` decides which adapter and which
  repository mutations go to. A checkout whose `.git/config` points `origin`
  elsewhere sends them there.
- **Pass ids the host gave you,** not text from an untrusted user, wherever a
  value becomes part of a REST path.
