---
name: studio
description: The plugins studio publishes for coding agents.
sw-owner:
  name: studio
sw-author: studio
---

The house marketplace. Every plugin under `plugins/` ships in it, and the
build renders one root per harness at `published/marketplaces/studio/`. Its
identity lives here rather than in a build flag, which is what having a
marketplace note is for.
