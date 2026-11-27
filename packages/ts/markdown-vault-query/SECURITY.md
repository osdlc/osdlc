# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce.

## Scope

`@osdlc/markdown-vault-query` evaluates `.base` files and filter expressions.
Treat both as code-like input. A regular expression in one runs with
JavaScript's backtracking matcher and can take unbounded time, and the package
has no guard against that. Evaluate bases or expressions from a party you do
not trust only in a worker you can stop.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that
is the latest minor release.

## What to expect

This is a small project. We aim to reply within a week, tell you whether we
accept the report, and credit you in the release notes if you want that.
