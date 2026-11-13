# D-SM4K: The markdown ecosystem stays in this repository, flat for now

Accepted 2026-11-12.

## Decision

- **The markdown ecosystem stays in osdlc/osdlc.** It does not move to
  osdlc/markdown. That repository is folded back in.
- **The libraries stay where they are**, flat under `packages/ts/` and
  `packages/rust/`. No folder groups them by product area yet. The boundaries
  between the markdown libraries, the sdlc product's libraries, the models and
  the general libraries are not clear enough to draw.
- **The plan says what belongs to the ecosystem.** Its component records name
  the libraries it owns. That is the grouping until folders exist.
- **osdlc/markdown's content goes into the folders this repository already
  has:**

  | Content                               | Place                                 |
  | ------------------------------------- | ------------------------------------- |
  | The `corpus-schema` spec and suite    | `packages/conformance/corpus-schema/` |
  | The plan and its records              | `docs/planning/markdown/`             |
  | The architecture doc and its diagrams | `docs/architecture/`                  |
  | The explorer and the diagram scripts  | `tools/`                              |

- **`corpus-schema` releases from here.** This repository's copy is the
  source, and its npm publisher does not change. The copy in osdlc/markdown is
  retired once its open work is brought over.
- **The dependency directions hold without folders.** A general library, such
  as `config-layers` or `cli-tool`, does not depend on a library the markdown
  plan owns. sdlc will depend on the markdown libraries. The markdown work
  uses sdlc as a tool, to run its plan, and no markdown library depends on an
  sdlc library. Today's dependencies already follow this.
- **osdlc/models folds in too.** Where the profiles, the packs, the starter
  corpus and model-schema go is not decided yet.
- **`markdown-store` stays in sksizer/rust-ontogen for now.**

## Why

The sdlc product and the markdown libraries are being designed against each
other. sdlc will define its models with `corpus-schema` and its extensions,
and will edit, store and show content with the markdown libraries. The
markdown work is planned and run with sdlc. While both sides change this
fast, a change that crosses them should be one pull request, not a release in
one repository and a bump in another.

The split had already cost something with one package moved:

- `corpus-schema` was published at 0.2.1 from here while osdlc/markdown stayed
  at 0.2.0 and built 0.3.0. There were two live copies.
- Its next release waited on moving the npm publisher.
- osdlc/markdown's CI pinned this repository's workflows by commit, and the
  release workflow needed new inputs for packages with no code
  ([#785](https://github.com/osdlc/osdlc/pull/785)).

Moving the rest would have needed a rule that some markdown libraries stay
here, because `config-layers` and `detect-harness` depend on `gfm-table`,
`yaml-splice` and `frontmatter-lossless`, while `markdown-contract` and
`markdown-vault-astro` depend on `cli-tool`. In one repository that rule is
not needed, and a change to `cli-tool` or `frontmatter-lossless` is tested
against the markdown packages in the same pull request.

## Options rejected

- **Move the markdown libraries to osdlc/markdown.** Two repositories that
  depend on each other release in a loop, or need a rule about which
  libraries may not move.
- **Keep the code here and the plan in osdlc/markdown.** The plan would sit
  apart from the code it plans, and could not be run by the sdlc in this
  repository.
- **Group the libraries under `solutions/markdown/` now**, as sksizer/dev
  groups its own (its decision D-0001). A folder changes nothing about how a
  library resolves or publishes, so it only records what belongs together,
  and that is not settled: which Markdown-handling libraries are general,
  where the models go, and whether sdlc becomes a group too. The move also
  needs work first: the Cargo workspace root moves to the repository root,
  the package checks and the release read a list of folders, and each
  workflow path filter changes. That work would hold up the 0.3.0 release and
  the plan's return for a grouping that may change.

## When to look again

- **Folders by product area**, when the boundaries are clear: the sdlc
  product's own libraries are known and the models have a place. sksizer/dev's
  layout is the one to start from. One point to carry over from this
  discussion: a library should be placed by which plan owns it, not by how
  many things import it, or the markdown group empties as sdlc adopts it.
- **Its own repository**, for a library that nears 1.0 and that this
  repository would use as a published release, like any outside dependency.

## Consequences

The work, in order. None of it needs a change to the build tooling.

1. **Bring osdlc/markdown's content here**, keeping its history, into the
   places in the table above.
2. **Re-apply the `corpus-schema` 0.3.0 work**
   ([osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)) onto this
   repository's copy and release it from here. The two copies have the same
   `src/` at 0.2.1.
3. **Update the plan's records** that name osdlc/markdown or osdlc/models as
   a library's home.
4. **The models:** the profiles and the starter corpus, then model-schema and
   the packs from sksizer/dev, once their place is decided.
5. **The packages still in sksizer/dev** come here directly: `markdown-vault`
   and `vault-graph-core` (as `markdown-corpus`), `markdown-vault-query`,
   `markdown-editor` and `markdown-ui`.
6. **The owner archives osdlc/markdown and osdlc/models** once they are
   empty, with a README that points here.
