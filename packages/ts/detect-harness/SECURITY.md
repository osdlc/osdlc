# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce. A minimal
code sample helps.

## What counts

This package reads other tools' configuration files. A way to make it write a
file, run a program without `allowExec: true`, read outside the project root
in `mode: 'project'`, or return a secret value that the README says is
redacted is a vulnerability. Report it as above.

## Supported versions

Only the latest release of the newest major version gets security fixes.
Upgrade to it.

## What to expect

This is a small project. We aim to reply within a week. We will tell you
whether we accept the report and keep you updated until a fix is released.
We will credit you in the release notes if you want that.
