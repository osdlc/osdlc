# Repatriation: bringing the markdown and models work back to osdlc/osdlc

The steps to fold osdlc/markdown and osdlc/models back into this repository.
[D-SM4K](../decisions/D-SM4K-markdown-ecosystem-home.md) is the decision.
Started 2026-11-12.

Tick an item when its pull request merges, and put the pull request's number
beside it. An item marked **owner** needs sksizer: a decision, or a setting
only the owner can change.

## Where each repository stands

| Repository           | After this plan                                                   |
| -------------------- | ----------------------------------------------------------------- |
| osdlc/osdlc          | Source for the sdlc CLI, the libraries, the markdown plan, models |
| osdlc/markdown       | Content folded in here. Kept as a holding pen                     |
| osdlc/models         | Content folded in here. Kept as a holding pen                     |
| osdlc/marketplace    | Stays: where the skill plugins are published                      |
| osdlc/skillwright    | Stays: where skillwright, the product, is published               |
| osdlc/parley         | Not decided. Low priority                                         |
| osdlc/homebrew-tap   | Stays                                                             |
| sksizer/dev          | Stays as it is. Not part of this plan                             |
| sksizer/rust-ontogen | `markdown-store` stays there for now                              |

## Where it stands

- Nothing has moved yet.
- `@osdlc/corpus-schema` is on npm at 0.2.1, released from this repository.
  osdlc/markdown has a copy at 0.2.0 with the same `src/`.
- osdlc/markdown `main` holds: the ecosystem plan and architecture docs, six
  diagrams and their scripts, the `corpus-schema` copy with its spec and
  suite, and the claims profile example.
- Open in osdlc/markdown, all by sksizer, in two stacks:

  | Stack | Pull requests            | Holds                                                                              |
  | ----- | ------------------------ | ---------------------------------------------------------------------------------- |
  | Plan  | #11 → #13 → #14          | The plan as records (about 220 files under `docs/planning/`), the explorer, D1–D18 |
  | Code  | #12, then #15 → #16, #19 | `corpus-schema` 0.3.0 (`extends`), the claims and sdlc profiles, the example pair  |

- The plan stack is not docs only. #14 has #12 merged into it, and adds
  `profiles/planning/`. The plan's records declare
  `extends: plan: ../../profiles/planning`, so they are valid only with
  `corpus-schema` 0.3.0 and that profile.

- Open in osdlc/models: #1, a draft that moves the two profiles and the
  starter corpus there. osdlc/models `main` has only a README.
- Neither profile package is on npm yet.

## Work, in order

Phase 1 comes first: the plan's records and the profiles both need
`corpus-schema` 0.3.0. Phase 2 needs phase 1. Phase 3 needs phase 2. Phase 4
needs phase 1 and a decision. Phase 5 is last.

### Phase 0: the decision

- [ ] Merge the decision record and this plan
      ([#789](https://github.com/osdlc/osdlc/pull/789)).
- [ ] Comment on osdlc/markdown #15, #16 and #19 with a link to #789, so no
      more work goes into the old layout. #20 has the note but is closed.
- [ ] Merge the holding-pen READMEs:
      [osdlc/markdown#22](https://github.com/osdlc/markdown/pull/22) and
      [osdlc/models#2](https://github.com/osdlc/models/pull/2). Each says the
      work happens here for now, and that the repository is where it lives
      once matured.
- [ ] Delete the branch `corpus-schema-moved` here (its pull request, #788,
      was closed).

### Phase 1: `corpus-schema` 0.3.0

Both copies have the same paths and the same `src/`.

- [ ] Bring [osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)
      here as one commit that links it: its changes under
      `packages/ts/corpus-schema/` and `packages/conformance/corpus-schema/`,
      and the changeset. Its 37 commits also touch `tools/`, docs and
      workflows, so they are not applied one by one. The step-by-step history
      stays in #12.
- [ ] Regenerate the conformance suite. `suite.json` records the reference
      version.
- [ ] Remove the two notes that say the spec moves to osdlc/markdown
      (`packages/conformance/corpus-schema/README.md` and `SPEC.md`).
- [ ] Merge, then merge the Version Packages pull request. 0.3.0 is
      published from here.
- [ ] Close osdlc/markdown#12 with a link to the new pull request.

### Phase 2: the plan and docs

Needs phase 1. The import is taken from the head of #14's branch
(`plan-profile`), which holds #11 and #13 too. The stack is not merged into
osdlc/markdown first: phase 5 empties that repository, so the merge would
only open a Version Packages pull request there to close.

- [ ] Import the history of `plan-profile` into a branch here, with the
      paths rewritten as in the table below (`git filter-repo --path-rename`
      on a fresh clone, then `git merge --allow-unrelated-histories`). A path
      the table does not list is dropped.
- [ ] Close osdlc/markdown #11, #13 and #14 with a link to the pull request.
- [ ] Title `ecosystem-plan.md` "Markdown Ecosystem Plan", and use that
      name where the docs say "the ecosystem plan".
- [ ] Point the plan's `extends` at the planning profile's new place, and
      check the records with `corpus-schema` 0.3.0.
- [ ] Fix what else the new paths break: links between the docs, the
      output path of `tools/diagrams/build.py` and `architecture.py` (now
      `docs/architecture/img/markdown/`), the default records path in the
      explorer's `scripts/build-data.mjs` (now `docs/planning/markdown`), and
      the three `tools/*.sh` scripts.
- [ ] Merge the two copies of `docs/terms/corpus-schema.md` by hand.
- [ ] `docs/architecture/markdown-ecosystem.md` here covers the crates.
      Link it and `markdown-target.md` to each other.
- [ ] Add the explorer to the pnpm workspace (`tools/explorer` in
      `pnpm-workspace.yaml`). Its own lockfile goes, its `link:` to
      `corpus-schema` becomes `workspace:*`, and the tools the catalog
      already pins (`typescript`, `vitest`, `yaml`, `@types/node`) become
      `catalog:`.
- [ ] Bring two workflows over as path-filtered jobs: `planning.yml`
      (checks the plan records) and `diagrams.yml`. `examples.yml` checks the
      claims example, so it comes in phase 4 with the example. They pin
      this repository's shared workflows by commit; here they call them by
      path. Third-party actions are pinned by SHA, as in this repository's
      other workflows. Check that the explorer's committed `data/*.json`
      match the records.
- [ ] Transfer the open issue
      [osdlc/markdown#8](https://github.com/osdlc/markdown/issues/8) here.

The paths for the import:

| From (osdlc/markdown)                | To (here)                                  |
| ------------------------------------ | ------------------------------------------ |
| `docs/planning/`                     | `docs/planning/markdown/`                  |
| `profiles/planning/`                 | `docs/planning/markdown/profile/`          |
| `docs/ecosystem-plan.md`             | `docs/planning/markdown/ecosystem-plan.md` |
| `docs/detail-requests.md`            | `docs/planning/markdown/`                  |
| `docs/pointing-here.md`              | `docs/planning/markdown/`                  |
| `docs/corpus-schema.md`              | `packages/ts/corpus-schema/docs/guide.md`  |
| `docs/terms/`                        | `docs/terms/`                              |
| `docs/architecture.md`               | `docs/architecture/markdown-target.md`     |
| `docs/diagrams/`                     | `docs/architecture/img/markdown/`          |
| `tools/diagrams/`, `tools/explorer/` | the same paths                             |
| `tools/*.sh`                         | the same paths                             |

The planning profile comes with the plan because it is the plan's own
profile, not a shared model.

Left out of the import: `packages/` (phase 1), `profiles/claims/` (phase 4),
`.github/`, `.changeset/`, and the root `package.json`, lockfile and configs.

### Phase 3: the plan catches up

Needs phase 2. The plan's records still describe the split.

- [x] **owner** The plan is the Markdown Ecosystem Plan, in
      `docs/planning/markdown/`, laid out like a solution's planning folder
      in sksizer/dev. Decided on #789.
- [ ] Add a decision record to the plan that supersedes D17 (profiles, packs
      and the starter live in osdlc/models) and points to D-SM4K.
- [ ] Update the records that name a repository: tasks 21, 59, 75 and 78–80,
      each component's `repo_target`, rule 4, the records under `repos/`,
      and "Where things live" in the architecture doc.
- [ ] Update the records that say a package leaves sksizer/dev: tasks 12,
      15 and 17, and the `repo_target` of `markdown-vault`,
      `vault-graph-core`, `markdown-vault-query`, `markdown-editor`,
      `markdown-ui`, model-schema and the two packs. They stay in
      sksizer/dev, or the task is marked out of scope.
- [ ] Correct the component records for `markdown-render` and
      `markdown-astro`: they are on npm at 0.8.0 from this repository, and
      the second is now `@osdlc/markdown-vault-astro`.
- [ ] Add component records for `markdown-render-vue` and `slug-collate`.
- [ ] Link the plan to this file.
- [ ] Update the diagram data in `tools/diagrams/build.py` (`PRESENT`,
      `TARGET` and their keys) and `architecture.py`: they are written by
      hand, not read from the records, and show the split D-SM4K reverses.
- [ ] Rebuild the diagrams and the explorer's data.

### Phase 4: the models

Needs phase 1, because the profiles use `extends`.

- [ ] **owner** Decide where the profiles and the starter corpus go in this
      repository. Proposed: `packages/profiles/*` and `packages/corpora/*`,
      as members of the pnpm workspace.
- [ ] Bring the claims profile example from osdlc/markdown `main`
      (`profiles/claims/`), with history.
- [ ] Bring osdlc/markdown's `examples.yml` over as a path-filtered job, as
      phase 2 did for `planning.yml`.
- [ ] Re-open as pull requests here: the claims profile package
      (osdlc/markdown#15), the example pair (#16), the sdlc profile and
      starter corpus (#19). osdlc/models#1 holds the same three packages
      moved; use whichever is newer.
- [ ] Add the new packages to the pnpm workspace, the package checks and the
      changeset config.
- [ ] Decide [#785](https://github.com/osdlc/osdlc/pull/785) (release
      inputs for packages with no code). It was written for osdlc/markdown's
      profile packages. Merge it if the profile packages need it here, or
      close it.
- [ ] **owner** Publish each new package's placeholder version and set its
      trusted publisher to osdlc/osdlc, as `packages/README.md` describes
      for a new library.
- [ ] Close osdlc/markdown #15, #16, #19 and osdlc/models#1 with links.

### Phase 5: empty the holding pens

osdlc/markdown and osdlc/models stay open, as the places the work moves to
once matured. They are not archived.

- [ ] Check nothing is left: no open pull requests or issues, no branch with
      unmerged work, in osdlc/markdown and osdlc/models.
- [ ] Remove from osdlc/markdown what was brought here, so there is one copy:
      the docs, `packages/`, `profiles/`, `tools/`, and the workflows that
      build and release them. Its README loses "What is still here".
- [ ] **owner** Decide osdlc/parley's home.

## Not part of this

- Moving packages out of sksizer/dev: `markdown-vault`, `vault-graph-core`,
  `markdown-vault-query`, `markdown-editor`, `markdown-ui`, model-schema and
  the packs. No move is planned yet.
- Grouping the libraries into folders by product area. D-SM4K says when to
  look at that again.
- One system for records. The plan keeps its own decisions (D1 and up) and
  tasks under `docs/planning/markdown/`, beside this repository's
  `docs/decisions/`. Moving the plan's records to sdlc entities is a later
  step.
- Improving the explorer and the diagrams. They come over as they are, and
  are aligned with sksizer/dev's views of the same kind later.
- The sdlc plugin packs install `@osdlc/markdown-link` from a vendored 0.1.0
  tarball. That is a separate update.
- osdlc/marketplace and osdlc/skillwright. They stay as they are.

## PR tracker

| Phase | Pull request                                    | State |
| ----- | ----------------------------------------------- | ----- |
| 0     | [#789](https://github.com/osdlc/osdlc/pull/789) | Open  |
| 1     | [#790](https://github.com/osdlc/osdlc/pull/790) | Open  |
