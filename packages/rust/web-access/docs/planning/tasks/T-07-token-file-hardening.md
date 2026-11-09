---
id: T-07
type: task
state: open
created: 2026-11-07
---

# T-07: Harden the token files

## Goal

Three gaps in how token files are kept
([D-06](../decisions/D-06-platforms-runtimes-and-licence.md)).

## Cases

- **Windows has no owner-only mode.** Set an ACL that leaves only the current
  user on the token file and its directory.
- **A loose file is kept.** A token file found readable by others is tightened
  to 0600 and reused, but its token may already have leaked. Mint a new one
  instead, or report it.
- **Two first mints can differ.** Two processes that mint at the same time can
  each write a token, and the one that loses the rename has handed out a token
  that is no longer on disk. Create the file with an exclusive create, and
  read back the winner's token.

## Done when

- Each case has a test on the platforms it applies to.
