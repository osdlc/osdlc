# D-SM4K: The markdown ecosystem is a solution in this repository

Accepted 2026-11-12.

## Decision

- **The markdown ecosystem stays in osdlc/osdlc.** It does not move to
  osdlc/markdown. That repository is folded back in.
- **Its home is `solutions/markdown/`.** A solution is a group of apps,
  packages and docs that belong to one product area, with its own planning.
  This is the first one here. The layout follows the one sksizer/dev uses
  (its decision D-0001, "Placement and promotion").
- **Placement follows who uses a thing, not what kind of thing it is.**

  | Place                  | What goes there                                    |
  | ---------------------- | -------------------------------------------------- |
  | `solutions/<s>/`       | What only that solution uses, and its planning     |
  | `packages/<language>/` | A library that two or more solutions use           |
  | Its own repository     | A library that is near 1.0 and releases on its own |

- **The libraries already in `packages/` stay there.** That covers
  `markdown-link`, `markdown-tags`, `markdown-contract`, `markdown-render`,
  `markdown-render-vue`, `markdown-vault-astro`, `markdown-corpus`,
  `markdown-relink`, `markdown-vault-fs`, `corpus-schema` and the parts they
  share with other libraries, such as `frontmatter-lossless` and
  `yaml-splice`. The sdlc product will use them, so they are shared.
- **`solutions/markdown/` holds the rest:** the ecosystem's plan and
  architecture (`docs/` and `docs/planning/`), packages that only the markdown
  solution uses, example corpora, and the tools that read the plan. A package
  there moves to `packages/` when something outside the solution imports it.
- **A folder is not a boundary for the build.** Solution packages are members
  of the same workspace, so `workspace:` ranges resolve across the repository.
  A published name does not change when its folder moves.
- **`corpus-schema` releases from here.** The copy in `packages/ts/` is the
  source. The copy in osdlc/markdown is retired once its open work is brought
  over.
- **osdlc/models folds in too.** Where its profiles, packs and starter corpora
  go inside this repository is not decided yet.
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
  at 0.2.0.
- Its next release waited on moving the npm publisher.
- osdlc/markdown's CI pinned this repository's workflows by commit.

Moving the rest would have needed a rule that some markdown libraries stay
here, because `cli-tool`, `config-layers` and `detect-harness` depend on
`gfm-table`, `yaml-splice` and `frontmatter-lossless`, while
`markdown-contract` and `markdown-vault-astro` depend on `cli-tool`.

## Options rejected

- **Move the markdown libraries to osdlc/markdown.** Two repositories that
  depend on each other release in a loop, or need a rule about which
  libraries may not move.
- **Keep the code here and the plan in osdlc/markdown.** The plan would sit
  apart from the code it plans, and could not be run by the sdlc in this
  repository.
- **Put every markdown library under `solutions/markdown/`.** They would move
  back to `packages/` as soon as sdlc imports them.

## When to look again

A library leaves for its own repository when it nears 1.0 and this repository
would use it as a published release, like any outside dependency. Until then
this repository is its source.

## Consequences

- osdlc/markdown's content comes here: the plan and its records, the
  architecture doc, the corpus-schema guide, the claims example, the explorer
  and the diagram scripts. Its open pull requests are brought over or closed.
  The `corpus-schema` 0.3.0 work lands on `packages/ts/corpus-schema` here.
- The packages still in sksizer/dev come here directly: `markdown-vault` and
  `vault-graph-core` (as `markdown-corpus`), `markdown-vault-query`,
  `markdown-editor` and `markdown-ui`. Each goes to `solutions/markdown/` or
  `packages/` by the rule above.
- The workspace, the package checks and CI learn the `solutions/` paths when
  the first package lands there.
- osdlc/markdown and osdlc/models are archived once they are empty, with a
  README that points here.
