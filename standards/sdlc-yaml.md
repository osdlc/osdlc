# `sdlc.yaml` as a structured README

Status: draft.

## Summary

- A README answers the same questions in almost every project: what is this,
  how do I set it up, how do I run it, test it, build it and ship it, and who
  owns it. It answers them in prose, for a person.
- `sdlc.yaml` answers the same questions as data, for a tool or an agent. A
  README section that tells you which command to run is a fact that belongs in
  `sdlc.yaml`.
- The README stays. It explains and gives context. `sdlc.yaml` holds the
  facts a tool acts on. A tool can check that the two agree, or render the
  README's command sections from the file.
- `sdlc.yaml` records only what differs from the defaults and what a manifest
  does not already say. A name and a version live in `package.json` or
  `Cargo.toml`, not here.

## README sections and where they go

| README section | Question | `sdlc.yaml` | Today |
|---|---|---|---|
| Title and intro | What is this, and what kind of thing is it? | `project:` name, one-line description, kind | not in the schema |
| Install / Getting started | How do I get it ready to work on? | `workflows.setup` | in the schema |
| Development | How do I run it locally? | `workflows.dev` | allowed as a workflow name |
| Testing | How do I test it, and what does each tier need? | `workflows.test`, `test-unit`, `test-integration`, `test-e2e` | allowed as workflow names |
| Building | How do I build and package it? | `workflows.build`, `package`, `generate` | allowed as workflow names |
| Deployment | Where does it run, and how does a version get there? | `environments:` and `workflows.deploy` | not in the schema |
| Releasing | How is a version cut and published? | `workflows.release` | allowed as a workflow name |
| Contributing | What must pass before a change merges? | `workflows.check` | in the schema |
| Project layout | Where are the source, tests and docs? | `layout:` | not in the schema |
| Maintainers | Who owns it, and where do issues go? | `owners:`, links | not in the schema |

The verbs are defined in [verbs.md](./verbs.md).

## A sketch

The keys marked "not in the schema" above do not exist yet. This shows how
they could look. It is a proposal, not the current shape.

```yaml
project:
  description: Typed GitHub client over the gh CLI
  kind: library            # library | application | service | tool | docs

workflows:
  setup:
    - pnpm install
  test-integration:
    - pnpm run test:integration
  check:
    - run: fmt-check
    - run: lint
    - run: typecheck
    - run: test

environments:
  staging:
    url: https://staging.example.com
  production:
    url: https://example.com
    protected: true        # deploy needs approval

owners:
  - '@sksizer'
```

`kind` decides which verbs apply (a library has no `dev` or `deploy`; see
rule 4 in [verbs.md](./verbs.md)), so a tool can tell a missing verb from one
that does not apply.

## Decisions in this draft

Each of these was a choice. Overturn any of them in review.

1. **`layout:` for the project layout.** The current schema already uses
   `paths:` for named directories on the machine (`dev: ~/Developer`), so the
   project's own source, test and docs directories need a different key.
2. **The shared file describes the project.** `sdlc.yaml` today also holds
   orchestrator limits, profiles and host choices. Those describe how a person
   works, not what the project is. The direction is to move them to
   `sdlc.local.yaml` or the machine config, so the committed file reads as a
   description of the project. Nothing moves in this draft. Each move is its
   own change, with a migration.
3. **Tools check the README; they do not write it.** A check reports when a
   command the README shows differs from the matching verb in `sdlc.yaml`. The
   README keeps its own voice. Generating its command sections can come later
   if the check proves the sections drift.
4. **The file keeps its name until the CLI is renamed.** When `sdlc` becomes
   `osdlc`, the file becomes `osdlc.yaml`, and the CLI reads `sdlc.yaml` as a
   fallback for one major version.

## Where the standards are written

Here, in `osdlc/osdlc`, because this is the public home of the standard.
S-0013 in the development repository stays as that repository's own,
monorepo-specific application of [verbs.md](./verbs.md), and should link to
it.
