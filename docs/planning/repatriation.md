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
| osdlc/markdown       | Folded in here, then archived                                     |
| osdlc/models         | Folded in here, then archived                                     |
| osdlc/marketplace    | Stays: where the skill plugins are published                      |
| osdlc/skillwright    | Stays: where skillwright, the product, is published               |
| osdlc/parley         | Not decided. Low priority                                         |
| osdlc/homebrew-tap   | Stays                                                             |
| sksizer/dev          | Nothing moves from it yet                                         |
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
      more work goes into the old layout. #20 already has the note.
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

Needs phase 1. The plan stack lands in osdlc/markdown first, so the import
happens once, from its `main`. Merging #14 puts #12's code on that `main`
too. That copy is being retired and `packages/` is left out of the import, so
it does no harm.

- [ ] Merge osdlc/markdown #11, #13 and #14 into its `main`, in that order.
- [ ] Import osdlc/markdown's history into a branch here, with the paths
      rewritten as in the table below (`git filter-repo --path-rename` on a
      fresh clone, then `git merge --allow-unrelated-histories`). A path the
      table does not list is dropped.
- [ ] Point the plan's `extends` at the planning profile's new place, and
      check the records with `corpus-schema` 0.3.0.
- [ ] Fix what else the new paths break: links between the docs, the diagram
      scripts' output paths, the explorer's path to the plan records, and the
      three `tools/*.sh` scripts.
- [ ] Merge the two copies of `docs/terms/corpus-schema.md` by hand.
- [ ] `docs/architecture/markdown-ecosystem.md` here covers the crates.
      Link it and `markdown-target.md` to each other.
- [ ] Add the explorer to the pnpm workspace. It has its own lockfile, which
      goes.
- [ ] Bring the three workflows over as path-filtered jobs: `planning.yml`
      (checks the plan records), `diagrams.yml` and `examples.yml`. They pin
      this repository's shared workflows by commit; here they call them by
      path.
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

- [ ] **owner** Decide the plan's name and the folder's, if "ecosystem plan"
      and `docs/planning/markdown/` are not right.
- [ ] Add a decision record to the plan that supersedes D17 (profiles, packs
      and the starter live in osdlc/models) and points to D-SM4K.
- [ ] Update the records that name a repository: tasks 21, 59, 75 and 78–80,
      each component's `repo_target`, rule 4, the records under `repos/`,
      and "Where things live" in the architecture doc.
- [ ] Correct the component records for `markdown-render` and
      `markdown-astro`: they are on npm at 0.8.0 from this repository, and
      the second is now `@osdlc/markdown-vault-astro`.
- [ ] Add component records for `markdown-render-vue` and `slug-collate`.
- [ ] Link the plan to this file.
- [ ] Rebuild the diagrams and the explorer's data.

### Phase 4: the models

Needs phase 1, because the profiles use `extends`.

- [ ] **owner** Decide where the profiles and the starter corpus go in this
      repository. Proposed: `packages/profiles/*` and `packages/corpora/*`,
      as members of the pnpm workspace.
- [ ] Bring the claims profile example from osdlc/markdown `main`
      (`profiles/claims/`), with history.
- [ ] Re-open as pull requests here: the claims profile package
      (osdlc/markdown#15), the example pair (#16), the sdlc profile and
      starter corpus (#19). osdlc/models#1 holds the same three packages
      moved; use whichever is newer.
- [ ] Add the new packages to the pnpm workspace, the package checks and the
      changeset config.
- [ ] **owner** Publish each new package's placeholder version and set its
      trusted publisher to osdlc/osdlc, as `packages/README.md` describes
      for a new library.
- [ ] Close osdlc/markdown #15, #16, #19 and osdlc/models#1 with links.

### Phase 5: close the old repositories

- [ ] Check nothing is left: no open pull requests or issues, no branch with
      unmerged work, in osdlc/markdown and osdlc/models.
- [ ] Replace each README with one that points here.
- [ ] **owner** Archive osdlc/markdown and osdlc/models.
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
- The sdlc plugin packs install `@osdlc/markdown-link` from a vendored 0.1.0
  tarball. That is a separate update.
- osdlc/marketplace and osdlc/skillwright. They stay as they are.

## PR tracker

| Phase | Pull request                                    | State |
| ----- | ----------------------------------------------- | ----- |
| 0     | [#789](https://github.com/osdlc/osdlc/pull/789) | Draft |
