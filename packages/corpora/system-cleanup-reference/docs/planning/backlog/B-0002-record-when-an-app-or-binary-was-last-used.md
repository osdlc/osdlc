---
type: backlog
schema_version: '3'
id: B-0002
tags:
  - system-cleanup
  - workstation-cleaner
  - liveness
  - macos
related:
  - https://github.com/osdlc/osdlc/issues/991
last_reviewed: '2026-11-21'
---
# Record when an app or binary was last used

The reference says where a store keeps its data and what is using it now (`liveness/in-use`), but
not when the store was last used. A cleaner that knows an app has not been opened in months can
offer its data, such as a model directory under `~/Library/Application Support`, with more
confidence than one that only knows the app is not running.

What each platform offers:

- **macOS apps.** LaunchServices records `kMDItemLastUsedDate` and `kMDItemUseCount` in Spotlight
  metadata when an app opens through Finder, the Dock, Spotlight or `open`. `mdls` reads one app
  and `mdfind` queries many. Finder's "Date Last Opened" column shows the same value. It is
  missing when the app was never opened that way, or when Spotlight does not index the volume.
- **Screen Time history.** Per-app foreground use for about four weeks, in
  `~/Library/Application Support/Knowledge/knowledgeC.db` on older macOS and in the undocumented
  Biome store on newer releases. It needs Full Disk Access and is not a stable interface.
- **Binaries.** Access time is not reliable: APFS does not update it on every read, and backups,
  Spotlight and scanners change it. The unified log keeps days to weeks and only holds tools that
  log. Process accounting (`accton`, `lastcomm`) and `eslogger exec` record runs only from when
  they are turned on.
- **Linux and Windows.** Not yet looked at: desktop-entry and recently-used files, process
  accounting, and Windows' Prefetch and UserAssist records are candidates.

What this would add:

1. A subject, such as `liveness/last-used`, asked of each store: which signal says when it was
   last used, on which platform, and how far it can be trusted. Cited like the other subjects.
2. In workstation-cleaner, a `lastUsed` source for descriptors (#991), beside `vars` and `liveness`, so
   `idleDays` can be measured from the app's last use, not only from file times.
3. A missing value counts as unknown, never as "not used". Unknown falls back to the rules used
   today.

Before this can be done:

- Undecided (owner, 2026-11-21): whether workstation-cleaner may read Full Disk Access data such as
  Screen Time history, or only metadata any process can read.
