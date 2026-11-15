---
number: 63
title: Starter corpus
detail: "@osdlc/corpus-sdlc-starter"
status: done
type: functional
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[49 SDLC profiles](49%20SDLC%20profiles.md)"
prs:
  - "[osdlc/osdlc#794](https://github.com/osdlc/osdlc/pull/794)"
  - "[osdlc/osdlc#804](https://github.com/osdlc/osdlc/pull/804)"
---

Starter instance corpus: `@osdlc/corpus-sdlc-starter`, built in
[osdlc/markdown#19](https://github.com/osdlc/markdown/pull/19) and brought to osdlc/osdlc by task 78,
at `packages/corpora/sdlc-starter/`
([D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md)). It is
an upstream corpus with records, not only types. Its root file extends the sdlc profile by package
name, and it holds principles to start: P-0001 "Normalize equivalent inputs at the boundary, and
reject invalid ones", carried over from [osdlc/osdlc#447](https://github.com/osdlc/osdlc/pull/447),
and P-0002 "Favor deterministic over probabilistic judgement". Standards follow in task 64. A work
repo names it under `references` (decision D15) with the prefix `osdlc` and cites its records by
id. CI in osdlc/osdlc
(`.github/workflows/profiles.yml`) validates it with `--strict`. Decision D14 says why it is a starter and not dev's own records. After 49.

Done: `@osdlc/corpus-sdlc-starter` 0.1.0 is on npm (2026-11-13), from `packages/corpora/sdlc-starter/`. More content is task 64.
