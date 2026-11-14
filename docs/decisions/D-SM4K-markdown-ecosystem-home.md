# D-SM4K: The markdown ecosystem stays in this repository, flat for now

Accepted 2026-11-12.

## Decision

- **The markdown ecosystem stays in osdlc/osdlc.** It does not move to
  osdlc/markdown. That repository's content is folded back in.
- **osdlc/markdown and osdlc/models are kept as holding pens.** They are not
  archived. Each has a README that says the work happens here for now, and
  that it is where the markdown ecosystem, or the models, will live once
  matured.
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
  sdlc library.
- **`frontmatter-lossless`, `gfm-table`, `gfm-pipe-table` and `yaml-splice`
  are general libraries.** They handle Markdown and YAML text, but the
  markdown plan does not own them: `config-layers` and `detect-harness`
  depend on them. With that, today's dependencies follow the directions
  above.
- **osdlc/models folds in too.** The profiles go in `packages/profiles/*`
  and the starter corpus in `packages/corpora/*`, as pnpm workspace members,
  for now.
- **Nothing moves out of sksizer/dev yet.** Its markdown packages,
  model-schema and the packs stay there for now.
- **`markdown-store` stays in sksizer/rust-ontogen for now.**
- **Two repositories stay as places to publish from.** osdlc/marketplace
  publishes the skill plugins. osdlc/skillwright publishes skillwright, the
  product. osdlc/parley is not decided.
- **The harness reference comes here from osdlc/skillwright**, to
  `packages/corpora/harness-reference/`. `@osdlc/harness-knowledge` is
  already here and ships the facts compiled from it, so the corpus, its
  compiler and the package are in one place.

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

Moving the rest would have needed a rule that some libraries that handle
Markdown stay here, because `config-layers` and `detect-harness` depend on `gfm-table`,
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
  needs work that adding packages does not: the Cargo workspace root moves to
  the repository root, and the path filters of the existing workflows are
  rewritten. That work would hold up the 0.3.0 release and
  the plan's return for a grouping that may change.

## When to look again

- **Folders by product area**, when the boundaries are clear: the sdlc
  product's own libraries are known and the models have a place. sksizer/dev's
  layout is the one to start from. One point to carry over from this
  discussion: a library should be placed by which plan owns it, not by how
  many things import it, or the markdown group empties as sdlc adopts it.
- **Out to the holding pens**, for a library or model that nears 1.0 and that
  this repository would use as a published release, like any outside
  dependency. Markdown libraries go to osdlc/markdown and models to
  osdlc/models.

## Consequences

[The repatriation plan](../planning/repatriation.md) lists the work as steps
to tick off. The build tooling changes only to add members: the explorer,
the profile and corpus packages, and three path-filtered workflows. In short:

1. Re-apply the `corpus-schema` 0.3.0 work
   ([osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)) onto this
   repository's copy and release it from here. The plan's records need it.
   (0.3.0 was not published; the work was released as 0.4.0.)
2. Bring osdlc/markdown's plan and docs here, keeping their history.
3. Update the plan's records that name another repository as a library's
   home.
4. Bring the profiles and the starter corpus, once their place is decided.
5. Empty osdlc/markdown and osdlc/models down to their READMEs. They stay
   open.
