---
title: Upstream corpora travel as npm packages
status: decided
decided: "2026-11-09"
---

Upstream corpora travel as npm packages. A parent corpus or profile is an npm package or a local
folder. `package.json` holds the range and the lockfile pins it. Git dependencies cover private org
corpora with no registry. The spec stays independent of npm: it says each parent resolves to a
folder that holds a corpus. corpus-schema has two resolvers, a package name and a relative path.

[D15](D15%20Extending%20types%20and%20referencing%20corpora%20are%20separate.md) splits parents into
extended corpora, for types, and referenced corpora, for records. Both travel as npm packages, as
here.
