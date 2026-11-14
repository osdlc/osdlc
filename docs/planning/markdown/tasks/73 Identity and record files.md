---
number: 73
title: Identity and record files
detail: "purl, id cut, x-record-file, _ folders"
status: done
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
  - "[70 References](70%20References.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
  - "[osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790)"
---

The rules that let sdlc's own planning folders validate as they are, and that tell corpora apart.

- Identity: every corpus, type and record in a package has a Package URL, derived from the nearest
  `package.json` (decision D16). A corpus's graph holds one version of each corpus. Records reached
  through two chains collapse by identity. A schema may state its type's identity in `x-identity`.
- The id cut: with `x-id-pattern`, a record's id is the longest part of its file name that the
  pattern matches, followed by `-` or the end of the name. So `P-0002-favor-deterministic.md` has
  the id `P-0002`, and a record's `id` field must equal it.
- `x-record-file`: a type names the file that holds a record kept in a folder of its own, such as
  `README.md` for `decisions/D-0001-a-slug/README.md`.
- Narrative folders: a folder in a type folder whose name starts with `_` holds narrative, not
  records.

After 9 and 70. Built in [#12](https://github.com/osdlc/markdown/pull/12).

Done: identity, the id cut, `x-record-file` and narrative folders is in `@osdlc/corpus-schema` 0.4.0, on npm since 2026-11-13 (task 36).
