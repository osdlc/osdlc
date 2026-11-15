---
kind: docs
reportedIn:
  - "[pi docs Pi Packages at 2a32a60](../../documents/github.com/pi%20docs%20Pi%20Packages%20at%202a32a60.md)"
harness: "[Pi](../../harnesses/Pi.md)"
observed: 2026-11-05
locator: packages/coding-agent/docs/packages.md:61-114 at 2a32a605a9f18a5f0191f65358a2e764b2f69fc7
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@pi#observation-2
---

Imported from `facts/pi/plugins/manifest-fields.md`, observation 2.

- docs_fields: [{"name":"name","type":"string","required":false,"use":"package name; identifies an npm package"},{"name":"version","type":"string","required":false,"use":"matched against changelog headings; npm update checks"},{"name":"keywords","type":"string[]","required":false,"use":"the pi-package keyword lists an npm package in the pi.dev gallery"},{"name":"pi.image","required":false,"use":"gallery preview"},{"name":"pi.video","required":false,"use":"gallery preview"},{"name":"dependencies","type":"object","required":false,"use":"installed with an npm or git source; host-provided packages here draw a warning"},{"name":"peerDependencies","type":"object","required":false,"use":"host-provided pi packages, declared with a * range"}]
