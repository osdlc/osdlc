---
type: backlog
schema_version: '3'
id: B-0002
tags:
  - workstation-cleaner
  - descriptors
  - root
last_reviewed: '2026-11-23'
---
# Clean stores that only root can clean

host-cleaner refuses to clean as root, and cleaning as root is out of scope for
every release in the
[plan](../../../../../../docs/planning/host-cleaner-plan.md). Some of the
largest stores on a Linux machine can only be cleaned as root, so the first
version and the descriptor tiers leave them alone. This item records them, as
the design review promised, so the question is not lost.

## The stores

The [system cleanup reference](../../../../../corpora/system-cleanup-reference/README.md)
marks each with `system: true`:

| Store | What fills up | Where |
| --- | --- | --- |
| APT | downloaded `.deb` files, package lists, dependencies left behind | `/var/cache/apt/archives`, `/var/lib/apt/lists` |
| pacman | every downloaded package, old versions included | `/var/cache/pacman/pkg` |
| Snap | older revisions of each snap and their data, snapshots of removed snaps | `/var/lib/snapd`, `/var/snap` |

The reference marks DNF, Flatpak's system installation and a multi-user Nix
store the same way. It also marks Homebrew, which runs as the user; that record
may need a second look before a descriptor relies on the field.

## What the design does today

- host-cleaner refuses to run `status`, `plan`, `clean` and `plugins` as root
  (exit 1); `config` still answers
  ([README, "Command line"](../../../README.md#command-line)).
- A descriptor may set `system: true`. Once descriptors are built (phase 4 of
  the plan), such a descriptor is accepted, so the reference can describe the
  store, and skipped with a note
  ([system description](../../../../../../docs/architecture/host-cleaner-system.md),
  "The fields").

## Bring it back when

Someone wants workstation-cleaner to clean these stores. That needs a decision first:
running workstation-cleaner itself as root, or having it hand a person the root
command each store's own tool runs (`apt-get clean`, `paccache -r`, removing
old snap revisions), with the same plan and receipt. Neither is chosen.
