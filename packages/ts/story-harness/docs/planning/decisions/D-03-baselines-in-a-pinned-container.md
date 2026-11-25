---
id: D-03
type: decision
state: accepted
created: 2026-11-07
---

# D-03: Baselines in a pinned container

## Decision

- Baselines are made and checked only inside one pinned Playwright image, run
  as `linux/amd64`, failing on any pixel past a 0.02 colour distance.
- The runner folder is copied into the container as one flat folder, and
  imports only Node and Playwright. The `--a11y` mode also installs one pinned
  axe-core version.
- A change that can change a shot is a minor release: the pinned image, or
  how a story is opened, settled or shot. A patch release never moves a pixel.

## Why

- Font rasterisation differs between platforms and between images. One image
  on one platform makes the comparison exact, so the same command gives the
  same answer on a laptop and in CI.
- The owner confirmed this decision on 2026-11-24.
- The host's `node_modules` may hold another platform's binaries, so the
  container installs only Playwright, and axe-core for `--a11y`.

## Consequences

- The check needs Docker. On Apple silicon the image runs emulated, which is
  slower but matches CI.
- Consumers take patches without re-baselining, and re-baseline once when
  they take a minor version.
- A new axe-core pin can change what `--a11y` reports but moves no pixel, so
  it can ship in a patch release.
