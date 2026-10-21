# Documentation locations

Status: draft.

## Summary

- Every kind of project document has one standard place. A reader, a tool
  or an agent looks there first and finds it.
- The repository root holds the files that hosting services and package
  registries already look for: `README.md`, `LICENSE`, `CHANGELOG.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, `sdlc.yaml`.
- `docs/` holds everything longer, split by what the reader is doing:
  learning (`guide/`), looking something up (`reference/`), understanding
  the design (`architecture/`), operating the system (`runbooks/`), or
  following why it is the way it is (`planning/`).
- In a repository with several packages, each package has the same shape
  in its own directory. The root `docs/` holds only what spans packages.
- A project that puts something elsewhere says so in `sdlc.yaml` under
  `layout:`.

## Root files

| File | Holds | Required |
|---|---|---|
| `README.md` | What the project is, how to install and use it in one screen, and links into `docs/`. | yes |
| `LICENSE` | The license text. Dual licenses use `LICENSE-MIT`, `LICENSE-APACHE`. | yes, for anything published |
| `CHANGELOG.md` | What each version changed, newest first. Written for users. | for anything versioned |
| `CONTRIBUTING.md` | How to set up, which verbs to run, how changes are proposed and reviewed. | when outside contributions are accepted |
| `SECURITY.md` | How to report a vulnerability and which versions get fixes. | for anything published |
| `AGENTS.md` | Instructions for coding agents: conventions, verbs, what not to touch. `CLAUDE.md` and similar files point to it or are links to it. | recommended |
| `sdlc.yaml` | The project's verbs and facts as data (see [sdlc-yaml.md](./sdlc-yaml.md)). | recommended |
| `.github/CODEOWNERS` | Who reviews which paths. | when more than one person reviews |

GitHub, npm, crates.io and PyPI find `README`, `LICENSE`, `CONTRIBUTING`
and `SECURITY` by these names, so do not rename or move them.

## The `docs/` tree

```text
docs/
  index.md            entry point: what is here and where to start
  guide/              tutorials and how-to: "how do I ..."
  reference/          complete, exact facts: CLI, config keys, API, error codes
  architecture/       how it is built and why: components, data flow, diagrams
  runbooks/           operating it: deploy, roll back, recover, rotate secrets
  planning/
    decisions/        decision records: D-<id>-<slug>.md
    standards/        this project's own standards: S-<id>-<slug>.md
    tasks/            task files, when work is tracked in the repo
    roadmaps/         milestones and roadmaps, when tracked in the repo
```

Create a folder when its first document exists. An empty tree is not
required.

### The split by reader

The four reader folders follow the [Diátaxis](https://diataxis.fr) model,
with tutorials and how-to guides merged into `guide/` because few projects
have enough of either to justify two folders:

| Folder | The reader is | A document here |
|---|---|---|
| `guide/` | trying to get something done | walks through steps toward one goal |
| `reference/` | looking up a fact | is complete and exact, and is often generated |
| `architecture/` | trying to understand | explains the design and its reasons |
| `runbooks/` | operating a running system, maybe under pressure | is a checklist with commands to copy |

A document that serves two readers is two documents.

### Generated documents

A generated document lives with the hand-written ones of its kind, usually
under `reference/`. It starts with a comment naming its generator, and the
project's `generate` verb rebuilds it. A `check` step fails when it is out
of date. Nobody edits it by hand.

### Decision records

A decision that will constrain later work is written down as a decision
record in `docs/planning/decisions/`. It states the question, the options,
the choice, and what would reopen it. A record is not rewritten when the
decision changes. A new record supersedes it, and the old one links to the
new one.

Identifiers:

- `D-01`, `D-02`, ... in a project where one person or one session writes
  decisions at a time. Numbers are short and show order.
- A short random key such as `D-LSLH` in a project where many sessions
  write in parallel. Sequential numbers collide when two branches take the
  same next number.

Standards (`S-`) follow the same rule.

## Repositories with several packages

Each package directory repeats the root shape for itself: its own
`README.md`, `CHANGELOG.md`, `LICENSE` and `docs/`. A package's documents
travel with it when it is published or moved to its own repository.

The root `docs/` holds only what spans packages: the architecture of the
whole, shared standards, cross-package decisions, the overall roadmap. When
a document starts in one package and a second package comes to depend on
it, it moves to the root.

## Rules

1. **One home per fact.** A fact is written once. Other documents link to
   it. The README links into `docs/`; it does not copy from it.
2. **Docs change with the code.** A change that alters behaviour updates
   the documents that describe it in the same pull request.
3. **Documents live in the repository.** A wiki or an external site may
   publish `docs/`, but the source is in the repository, reviewed like
   code.
4. **Links are relative.** A link between documents in the repository uses
   a relative path, so it works on the host, in an editor and in a
   published copy.

## Examples

A published TypeScript library:

```text
README.md  LICENSE-MIT  LICENSE-APACHE  CHANGELOG.md  CONTRIBUTING.md  SECURITY.md
docs/planning/decisions/D-01-name.md
docs/planning/decisions/D-02-read-only.md
```

A web service:

```text
README.md  CHANGELOG.md  AGENTS.md  sdlc.yaml  .github/CODEOWNERS
docs/index.md
docs/guide/local-development.md
docs/reference/config.md              (generated)
docs/architecture/overview.md
docs/runbooks/deploy.md
docs/runbooks/database-restore.md
docs/planning/decisions/D-01-postgres.md
```

## Anti-examples

- Setup steps written out in the README, in `CONTRIBUTING.md` and in
  `docs/guide/`. Three copies drift. Write them once and link.
- A runbook that explains the architecture before reaching the commands.
  Move the explanation to `architecture/` and link to it.
- `docs/notes.md`, `docs/misc/`, `docs/stuff/`. A document with no reader
  in mind has no home. Decide who reads it.
- A decision record edited in place to record a reversal. The history of
  why is lost. Write a new record that supersedes it.
- A generated reference page edited by hand. The next `generate` erases the
  edit.

## Decisions in this draft

Each of these was a choice. Overturn any of them in review.

1. **Diátaxis with tutorials and how-to merged.** Diátaxis is the most
   widely used model for splitting documentation by reader. Merging two of
   its four types keeps small projects from having near-empty folders.
   `runbooks/` is added because operating a system is a distinct need that
   Diátaxis files under how-to.
2. **`AGENTS.md` is the agent file; others point to it.** `AGENTS.md` is
   read by the most agent tools. A project keeps one file, so instructions
   cannot differ between tools.
3. **`docs/planning/` for the decision trail.** This matches the existing
   osdlc packages and the development repository, which both use
   `docs/planning/decisions/`.
4. **Two identifier schemes, chosen by how many write at once.** Sequential
   numbers read better; random keys avoid collisions. Neither suits every
   project.
