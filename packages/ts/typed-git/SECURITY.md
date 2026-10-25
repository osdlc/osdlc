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

## Scope

- The client runs the `git` found on an absolute `PATH` entry, by its
  absolute path, so a file named `git` in the checkout cannot run in its
  place. It builds argument arrays and starts no shell. A runner you inject
  replaces this lookup.
- Starting the process is the job of `@osdlc/command-seam`. Report problems
  in how a process is started there.
- `@osdlc/typed-git/testing` makes and deletes temporary directories. It is
  meant for tests, not for production code.
