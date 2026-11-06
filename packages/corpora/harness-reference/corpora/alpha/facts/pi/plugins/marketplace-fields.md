---
type: Harness Fact
title: "pi: Marketplace fields"
description: "Marketplace fields in pi, as observed over time."
tags: [plugins]
harness: pi
subject: plugins/marketplace-fields
observations:
  - value: { applicable: false, note: "no catalog file; packages are installed by npm, git, URL or local source, and the pi.dev gallery lists npm packages that carry the pi-package keyword" }
    since: null
    until: null
    observed: "2026-11-05"
    source: pi-packages-doc
    locator: "packages/coding-agent/docs/packages.md:33-44, 78 at 2a32a605a9f18a5f0191f65358a2e764b2f69fc7"
    evidence: docs
sources:
  - id: pi-packages-doc
    resource: "https://github.com/earendil-works/pi/blob/2a32a605a9f18a5f0191f65358a2e764b2f69fc7/packages/coding-agent/docs/packages.md"
    title: "pi docs: Pi Packages at 2a32a60"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[pi](/harnesses/pi.md).

## Observations

- 2026-11-05: applicable: `false`. pi has no marketplace catalog file. A package is named by its
  source, and the gallery discovers npm packages by keyword.[^pi-packages-doc]

  > | npm | `npm:@example/pi-tools@1.0.0` | Installed under the Pi npm directory |
  > | git | `git:github.com/example/pi-tools@v1` | Cloned and reconciled to the selected ref |
  > | URL | `https://github.com/example/pi-tools` | Treated as a git source |
  > | Local | `./pi-tools` | Loaded from the resolved path without copying |

  > The `pi-package` keyword makes an npm package eligible for discovery in the [Pi package gallery](https://pi.dev/packages).

[^pi-packages-doc]: pi docs: Pi Packages at 2a32a60
