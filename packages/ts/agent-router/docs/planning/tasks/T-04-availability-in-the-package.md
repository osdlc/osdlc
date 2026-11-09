---
id: T-04
type: task
state: open
created: 2026-11-07
---

# T-04: The availability check in the package

## Goal

A host does not have to write its own answer to "is this tool or model usable now?". The package
offers one, as a subpath or a companion package, while the main entry stays pure and keeps taking
availability as an argument.

## Today

The main entry takes availability as a callback (`isAvailable`) that returns one of
`AVAILABILITY_REASONS`. Each host writes that callback itself: rate-limit cooldowns per tool and
model, a rolling-window spending cap, and the exact and per-context checks that combine them with
what is installed and signed in. Every consumer needs the same pieces.

## Approach

1. Bring the cooldown store (per tool and model, with a scope such as account, family, model or
   long context), the rolling-window budget and the availability composition into the package.
   Keep storage behind a port, so the pure entry stays browser-safe and a host supplies the file
   or store.
2. Ship it as a subpath (`./availability`) or a companion package; decide which by what it needs
   to import.
3. Mark it experimental for its first release.
4. Later: a remaining-quota signal per tool or provider, so the walk can skip a tool that is
   running low before it fails, with "unknown" falling back to cooldowns.

## Acceptance criteria

- [ ] A host can build `isAvailable` from the package's pieces and its own installed and
      signed-in checks.
- [ ] The main entry still imports nothing environmental.
