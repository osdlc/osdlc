# D-SM4K: The markdown ecosystem is a solution in this repository

Accepted 2026-11-12.

## Decision

- **The markdown ecosystem stays in osdlc/osdlc.** It does not move to
  osdlc/markdown. That repository is folded back in.
- **Its home is `solutions/markdown/`.** A solution is a group of apps,
  packages and docs that belong to one product area, with its own planning.
  This is the first one here. The layout follows the one sksizer/dev uses
  (its decision D-0001), with one change to the rule, below.
- **Placement follows who owns a thing, not who imports it.**

  | Place                  | What goes there                                           |
  | ---------------------- | --------------------------------------------------------- |
  | `solutions/<s>/`       | What that solution's plan owns: its libraries, apps, docs |
  | `packages/<language>/` | General libraries that no solution owns                   |
  | Its own repository     | A library that is near 1.0 and releases on its own        |

  A library stays in its solution however many things import it. sksizer/dev
  moves a package up to `packages/` when a second solution imports it. Here
  every library is published under `@osdlc`, so a folder does not say who may
  import it. It says what the library belongs to.

- **The markdown solution owns** `markdown-link`, `markdown-tags`,
  `markdown-contract`, `markdown-render`, `markdown-render-vue`,
  `markdown-vault-astro` and `corpus-schema`, and the crates
  `markdown-corpus`, `markdown-relink`, `markdown-vault-fs`, `vfs-walk`,
  `vfs-seam` and `slug-collate`. They move to
  `solutions/markdown/packages/<language>/`.
- **`packages/` never depends on anything under `solutions/`.** A check in CI
  holds this. It is why `frontmatter-lossless`, `gfm-table`,
  `gfm-pipe-table` and `yaml-splice` stay in `packages/`, though they deal
  with Markdown: `config-layers` and `detect-harness` depend on them.
  `etag-write`, `path-guard`, `cli-tool`, `command-seam` and the rest of the
  tool libraries stay too.
- **A solution may depend on another solution's libraries, in one direction.**
  sdlc will depend on the markdown solution's libraries. The markdown solution
  uses sdlc as a tool, to run its plan, and does not import sdlc's libraries.
- **`solutions/markdown/` also holds** the conformance suites and specs of its
  libraries, the ecosystem's plan and architecture, example corpora, and the
  tools that read the plan.
- **A folder is not a boundary for the build.** Solution packages are members
  of the same workspace, so `workspace:` ranges resolve across the repository.
  A published name does not change when its folder moves.
- **`corpus-schema` releases from here.** This repository's copy is the
  source, and its npm publisher does not change. The copy in osdlc/markdown is
  retired once its open work is brought over.
- **osdlc/models folds in too.** The proposal is a second solution,
  `solutions/models/`, for model-schema, the packs, the profiles and the
  starter corpus. That is not decided yet.
- **`markdown-store` stays in sksizer/rust-ontogen for now.**
- **The sdlc CLI, the plugin libraries and the skillwright and tradecraft
  crates stay where they are for now.**

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
- **Leave every markdown library flat in `packages/`.** Seventy libraries in
  two folders no longer show what belongs together, and the plan, spec and
  examples would sit apart from the code.
- **Move a library up to `packages/` when a second solution imports it**, as
  sksizer/dev does. The markdown solution would empty out as sdlc starts to
  use it.

## When to look again

A library leaves for its own repository when it nears 1.0 and this repository
would use it as a published release, like any outside dependency. Until then
this repository is its source.

## Consequences

The work, in order:

1. **Tooling, with no moves.** CI must give the same results before and
   after.
   - pnpm stays the package manager. Its workspace globs gain the solution
     folders.
   - The Cargo workspace root moves from `packages/rust/` to the repository
     root, because members must sit under the root. release-plz moves with
     it.
   - `package-checks` takes a list of package folders, not one, and the
     release's "not on npm yet" check reads the same list.
   - moon, as sksizer/dev has: `.moon/workspace.yml` enrols each solution's
     folders, and task presets for TypeScript libraries and crates call each
     package's own scripts. CI runs the affected projects.
   - A check that nothing in `packages/` depends on a package under
     `solutions/`.
2. **Move the markdown libraries** into `solutions/markdown/` with `git mv`.
   History is kept. npm and crates.io names do not change, and the trusted
   publishers stay on osdlc/osdlc.
3. **Bring osdlc/markdown's content here**, keeping its history: the spec and
   conformance suite, the examples, the plan and its records, the
   architecture doc and the explorer.
4. **Re-apply the `corpus-schema` 0.3.0 work**
   ([osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)) onto this
   repository's copy and release it from here. The two copies have the same
   `src/` at 0.2.1.
5. **The models:** the profiles and the starter corpus, then model-schema and
   the packs from sksizer/dev, once their place is decided.
6. **The packages still in sksizer/dev** come here directly: `markdown-vault`
   and `vault-graph-core` (as `markdown-corpus`), `markdown-vault-query`,
   `markdown-editor` and `markdown-ui`.
7. **The owner archives osdlc/markdown and osdlc/models** once they are
   empty, with a README that points here.
