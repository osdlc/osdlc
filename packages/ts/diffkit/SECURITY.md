# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce.

## Scope

The package runs `git`, and `gh` for a pull request, with an argument list and no shell. `prep`
writes no files and creates no temporary files. It reads the repository it runs in: the changed
files from git, and other source files in the working tree to find importers. A file that is a
symlink is not followed, and a file behind a linked directory is read only when its real path is
inside the repository, so a tracked link cannot make it read a file outside the repository. Only
counts, paths and names from the repository reach the output.

The `diffkit dev` commands are the exception. They write their link state and history under the
user's configuration directory, and `dev install` writes an executable shim into a directory on
`PATH`. After `dev link <checkout>`, every `diffkit` run executes that checkout's source under Bun.

A way to make it run a command you did not name, read a file outside the repository, or write
anywhere else is in scope. Where the change comes from is `@osdlc/code-stats`'s to resolve, and
reports about that go to its policy.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that is the latest minor
release.

## What to expect

This is a small project. We aim to reply within a week, tell you whether we accept the report, and
credit you in the release notes if you want that.
