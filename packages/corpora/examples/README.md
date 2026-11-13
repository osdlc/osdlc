# Example corpora

Two corpora that show one corpus building on a profile and linking to another corpus.

- [org-principles/](org-principles/org-principles.corpus-schema.md) is an organisation's principles: a corpus
  with one type, `principles`, and three records.
- [fernlog/](fernlog/fernlog.corpus-schema.md) is a project corpus for a made-up tool. It names two
  corpora:
  - It extends `claims`, the [claims profile](../../profiles/claims/README.md), by its package name,
    `@osdlc/corpus-profile-claims`, for its types. Its `package.json` installs the profile from
    `packages/profiles/claims/` with a `file:` dependency, as a consumer would install it from npm. `uses`
    takes two of its types as they are, with no schema files.
  - It references `org`, the org principles, by the path `../org-principles`, for its records.

fernlog's records cite the org's. A decision's `follows` field has `x-ref: org/principles`, and
its links go through `_references/org/`. A decision's `checkedBy`
has `x-ref: claims/statements` and links to fernlog's own statements, whose type extends the
profile's. A statement adds a `follows` field that links to an org principle.

`fernlog/_references/org/` holds a copy of the org principles, written by `corpus-schema sync`. It
is committed, so the links resolve on GitHub and in Obsidian. The profile gives types only, so
fernlog keeps no copy of it.

## Check them

From the root of this repository, build the validator, install the claims profile for fernlog, and
validate:

```sh
sh tools/build-corpus-schema.sh
(cd packages/corpora/examples/fernlog && pnpm install --ignore-workspace --frozen-lockfile)
sh tools/validate-strict.sh packages/corpora/examples
sh packages/corpora/examples/test.sh
```

`test.sh` checks that the validator catches a stale copy of the org principles, a link into the
profile, which gives types only, and a `follows` or `checkedBy` link to the wrong type.

## After a named corpus changes

When you change `org-principles/`, refresh fernlog's copy and commit it. When you change
`packages/profiles/claims/corpus/`, reinstall it:

```sh
(cd packages/corpora/examples/fernlog && pnpm install --ignore-workspace --force)
node packages/ts/corpus-schema/bin/corpus-schema.js sync packages/corpora/examples
```

The install step matters for the profile. pnpm links a `file:` dependency's files into
`node_modules/` when it installs. A file added to `packages/profiles/claims/` after that, or one an editor
replaces, does not show up there until you install again with `--force`. CI installs fresh,
validates both corpora, and fails when `_references/` does not match the org principles. The workflow is
`.github/workflows/profiles.yml`.
