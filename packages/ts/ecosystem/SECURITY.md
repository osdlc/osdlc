# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce. A minimal
code sample helps.

## Supported versions

Only the latest `0.x` release gets security fixes. The library is pre-1.0, so
older `0.x` releases are not patched. Upgrade to the latest release.

## What to expect

This is a small project. We aim to reply within a week. We will tell you
whether we accept the report and keep you updated until a fix is released.
We will credit you in the release notes if you want that.

## What this library does that matters for security

- It reads and writes one file, `repositories.yaml` in the osdlc config home,
  or the absolute path `OSDLC_REPOSITORIES` names. A write keeps a `.bak` of
  the old file beside it.
- The roots are machine-only. No repository's config can set them, so a
  cloned repository cannot point a tool at directories on a person's disk.
- It runs `git` in each checkout it finds under the roots, with argument
  arrays and never through a shell, to read its main checkout and its
  `origin` URL. git reads that checkout's config as it always does.
- For an `origin` that uses an SSH host alias, `@osdlc/typed-git` runs
  `ssh -G -- <alias>` from the home directory, with a 5 s limit. It reads
  the person's SSH config; it opens no connection.
