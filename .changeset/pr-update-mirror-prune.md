---
"@osdlc/pr-update": minor
---

New commands: `pr-update mirror list` and `pr-update mirror prune`.

`mirror list` (text or `--json`) shows each managed clone with its repository,
size, last use and kept worktrees, and every run worktree left in pr-update's
cache, with whether its run is still going. It takes no lock and changes
nothing.

`mirror prune` removes the worktrees of runs that are gone, at any age, through
the checkout or clone that owns them, without a bare `git worktree prune`, so
your own worktrees are not touched. In a clone it does this only while holding
the clone's lock. It removes clones not used for `mirror_max_age_days`
(default 30; at `0` none, unless `--older-than <days>` or `--all-clones` is
given), and leftover temporary folders older than an hour. It never removes a
clone another run holds, one with a kept worktree (unless `--discard-kept`), one
in use by a running run, or a folder pr-update did not make, and it never
follows a symbolic link or removes anything from a folder others can write to.
It never waits for a lock. `--dry-run` only reports. `list` and `prune` take
`--mirror-dir`. `prune` exits 1 when something could not be removed.

A run is gone when no process has its pid, or the process with that pid
started after the run began, so a reused pid keeps no dead run's worktree. The
cache and state directories belong to one machine and must not be shared.

`update --apply` now prunes the same way when it ends, if it used a clone or
made a run worktree in the cache, unless a signal stopped it. It notes what it
removed, what it left for a folder someone else could write to, and the space
freed. `mirror_max_age_days` now takes effect.

The folder check of the clone directory, `worktrees/` and `kept/` accepts a
folder writable by its group when the group is your primary group (umask
`002` with a group of your own, the default on Ubuntu, Debian and Fedora), and
one writable by anyone when its sticky bit is set. pr-update makes the folders
it owns with mode `755` at most, whatever the umask, including the folders
above each run worktree and each kept place. `survey` holds a clone's lock
while it reads the clone, and a run that finds its clone removed while it
waited for the lock makes it again (`update --apply` with consent) or skips
the target with a note.
