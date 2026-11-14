---
number: 17
title: Render/sites
detail: PRs 719 720
status: doing
type: functional
milestone: "[m-render](../milestones/m-render.md)"
prs:
  - "[osdlc/osdlc#719](https://github.com/osdlc/osdlc/pull/719)"
  - "[osdlc/osdlc#720](https://github.com/osdlc/osdlc/pull/720)"
  - "[osdlc/osdlc#807](https://github.com/osdlc/osdlc/pull/807)"
---

Finish moving the render, edit and site packages. The render and site packages are in osdlc/osdlc:
[osdlc/osdlc#719](https://github.com/osdlc/osdlc/pull/719) and
[#720](https://github.com/osdlc/osdlc/pull/720) have merged. markdown-editor and markdown-ui stay
in sksizer/dev for now ([D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md)), so moving them is out of scope.

`@osdlc/corpus-site` ([#807](https://github.com/osdlc/osdlc/pull/807)) has merged, and 0.1.0 is on npm. Left: rename the vault words to corpus (markdown-vault-astro keeps its name).
