# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce. A minimal
folder or note that triggers the problem helps.

## Scope

`scanVault` reads files and starts no process, opens no connection and writes nothing. It follows
symbolic links wherever they point: a link inside a vault that points outside it makes the scan
read and index the files it reaches, frontmatter included. Scan only vaults you trust. This is the
documented behaviour, so it is not a vulnerability by itself. A way to make the scan read a file
that no symbolic link in the scanned folder reaches, or to make a note's text run code, is in
scope.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that
is the latest minor release.

## What to expect

This is a small project. We aim to reply within a week. We will tell you
whether we accept the report and keep you updated until a fix is released.
We will credit you in the release notes if you want that.
