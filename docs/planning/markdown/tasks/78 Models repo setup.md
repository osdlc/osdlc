---
number: 78
title: Bring in profiles
detail: profiles and starter in osdlc/osdlc
status: done
type: supporting
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[36 Release 0.3.0](36%20Release%200.3.0.md)"
---

Bring the profiles and the starter corpus into osdlc/osdlc, so they publish from it ([D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md)). They do
not go to osdlc/models, as D17 planned. The owner decided their place: `packages/profiles/*` and
`packages/corpora/*`, as members of the pnpm workspace.

Done in osdlc/osdlc, as phase 4 of `docs/planning/repatriation.md`:

- `packages/profiles/claims/` comes from osdlc/markdown's `example-pair` branch
  ([osdlc/markdown#16](https://github.com/osdlc/markdown/pull/16), on top of
  [#15](https://github.com/osdlc/markdown/pull/15)), with its history, and the example pair with
  it, at `packages/corpora/examples/fernlog/` and `packages/corpora/examples/org-principles/`.
- `packages/profiles/claims/`, `packages/profiles/sdlc/` and `packages/corpora/sdlc-starter/` then
  take the newest content, from [osdlc/models#1](https://github.com/osdlc/models/pull/1), which
  holds the packages of [#15](https://github.com/osdlc/markdown/pull/15) and
  [#19](https://github.com/osdlc/markdown/pull/19) moved. Its changesets for each package's first
  release, 0.1.0, come too.
- `.github/workflows/profiles.yml` validates every profile and corpus with `--strict`, runs each
  package's tests, the example pair's check and the leak check (task 65). It builds corpus-schema
  from `packages/ts/corpus-schema`, so it does not wait on the 0.3.0 release. The changeset config
  covers the packages as it is. `check:packages` reads only `packages/ts/`, so it does not check
  these packages.

None of the three is published. Releasing them needs the `package-globs` input of
[osdlc/osdlc#785](https://github.com/osdlc/osdlc/pull/785) in `packages-publish.yml`, and the
owner's trusted publishers (task 80).
