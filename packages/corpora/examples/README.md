# Example corpora

Two corpora that show one corpus extending others.

- [org-principles/](org-principles/corpus-schema.md) is an organisation's principles: a corpus
  with one type, `principles`, and three records.
- [fernlog/](fernlog/corpus-schema.md) is a project corpus for a made-up tool. It extends two
  parents:
  - `claims`, the [claims profile](../profiles/claims/README.md), by its package name,
    `@osdlc/corpus-profile-claims`. Its `package.json` installs the profile from
    `profiles/claims/` with a `file:` dependency, as a consumer would install it from npm.
  - `org`, the org principles, by the path `../org-principles`.

fernlog's records cite inherited ones. A decision's `follows` field has
`x-ref: org/principles`, and its links go through `_inherited/org/`. A decision's `checkedBy`
has `x-ref: claims/statements` and links to fernlog's own statements, whose type extends the
profile's. A statement adds a `follows` field that links to an org principle.

`fernlog/_inherited/` holds a copy of both parents, written by `corpus-schema sync`. It is
committed, so the links resolve on GitHub and in Obsidian.

## Check them

From the root of this repository, build the validator, install fernlog's parent, and validate:

```sh
pnpm --filter @osdlc/corpus-schema run build
(cd examples/fernlog && pnpm install --ignore-workspace --frozen-lockfile)
node packages/ts/corpus-schema/bin/corpus-schema.js validate examples
sh examples/test.sh
```

`test.sh` checks that the validator catches a stale `_inherited/` copy and a `follows` link to the
wrong type.

## After a parent changes

When you change `org-principles/` or `profiles/claims/corpus/`, refresh fernlog's copy and commit
it:

```sh
(cd examples/fernlog && pnpm install --ignore-workspace --force)
node packages/ts/corpus-schema/bin/corpus-schema.js sync examples
```

The install step matters for the profile. pnpm links a `file:` dependency's files into
`node_modules/` when it installs. A file added to `profiles/claims/` after that, or one an editor
replaces, does not show up there until you install again with `--force`. CI installs fresh,
validates both corpora, and fails when `_inherited/` does not match the parents. The workflow is
`.github/workflows/example-pair.yml`.
