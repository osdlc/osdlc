# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce. A minimal
code sample helps.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that
is the latest minor release. Upgrade to it.

## Large and hostile patterns

The engine has no size limit in this version. Cost grows faster than
linearly with pattern size. Measured on Bun 1.4.2:

- `*a` repeated 2,048 times against `*b` repeated 2,048 times took 15.8 s and
  3.1 GB.

Patterns of a few segments finish in a few milliseconds.

If you pass patterns from untrusted input, cap them first. For example, allow
at most 256 characters and 32 segments per pattern.

## What to expect

This is a small project. We aim to reply within a week. We will tell you
whether we accept the report and keep you updated until a fix is released.
We will credit you in the release notes if you want that.
