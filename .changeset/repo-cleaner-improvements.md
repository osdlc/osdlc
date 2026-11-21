---
'@osdlc/repo-cleaner': minor
---

- A worktree lock's owner is checked with `@osdlc/file-lock`'s `sameProcess`. A lock may now record file-lock's `processIdentity` (on Linux, boot id and start ticks, which no clock change or time zone moves). A recorded start later than the process's real start, such as when the owner took the lock, still names the owner; before, a live owner's lock could read as stale.
- A sweep that fetches several remotes fetches them in one parallel `git fetch --multiple`, and reads their default branches in one call.
- Breaking, for library users: `RepoInfo.remotes` lists every remote the sweep touches (the default remote, the judged ones with `judged: true`, and the `against` remote), `RepoInfo.against` is the remote's name, and `RepoInfo.fetched` is gone (use `fetchedRemotes`). `judgedRemotes`, `landedFor`, `refOf` and the `RemoteInfo` and `LandedAgainst` types are exported.
- The two tests that make a receipt unsavable skip when run as root, which can always write it.
