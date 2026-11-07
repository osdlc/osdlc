---
id: D-03
type: decision
state: proposed
created: 2026-11-07
---

# D-03: Baselines in a pinned container

## Decision

- Baselines are made and checked only inside one pinned Playwright image, run
  as `linux/amd64`, at zero pixel tolerance past a 0.02 colour distance.
- The runner folder is copied into the container as one flat folder, and
  imports only Node and Playwright.
- A change to the pinned image is a minor release.

## Why

- Font rasterisation differs between platforms and between images. One image
  on one platform makes the comparison exact, so the same command gives the
  same answer on a laptop and in CI.
- The host's `node_modules` may hold another platform's binaries, so the
  container installs only Playwright.

## Consequences

- The check needs Docker. On Apple silicon the image runs emulated, which is
  slower but matches CI.
- A new image can move pixels, so consumers re-baseline when they take it.
