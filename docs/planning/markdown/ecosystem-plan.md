# The markdown ecosystem plan

This is a working plan. It says where our markdown packages are today, what is wrong with them,
where we want to end up, and the steps to get there. We update it as we go. The shape we are
building toward is in [the architecture](architecture.md).

## Words we use

- A **note** is a Markdown file, often with YAML frontmatter at the top.
- A **corpus** is a folder of notes and the files they link to. An Obsidian vault is a corpus. So
  is a docs folder. Some of our packages say "vault" for the same thing.
- **The spec** is the format we are writing for typed records kept as notes. It is called
  **corpus-schema** (decided 2026-11-08).
- A **level** says how much a corpus declares about itself. Level 0 declares nothing, but its
  relative links must resolve. Level 1 adds a root file, type folders and ids. Level 2 gives each
  type a JSON Schema.
- A **record folder** is a folder inside a type folder that holds a record file with the folder's
  own name (`<folder>.md`, or `.yaml`, `.json`). The record owns the other files in the folder. A
  record folder can't hold another record folder or a type folder.
- A **profile** is a shared set of types that many corpora can use, such as a set of types for
  evidence. It is a corpus that has only types. A corpus can use more than one profile, next to its own types.
- A **parent** is a corpus that another corpus builds on, named under `extends` in its root file. A
  profile is a parent. So is an org's principles corpus.
- A **dialect** is a named flavor of note syntax on top of a common baseline, such as Obsidian's
  wikilinks and embeds.
- **Conformance cases** are shared test inputs and expected results. Every implementation of the
  spec, in any language, runs the same cases.

## The work

The tasks, milestones and decisions are records in [planning/](planning/README.md), one Markdown
file each. A task's file, such as [27 Org corpora](planning/tasks/27%20Org%20corpora.md), holds its
status, its milestone, the tasks that must come first, and its plan. The
[ecosystem explorer](../tools/explorer/README.md) shows the tasks and the components they change as
graphs. Its data is built from the records.

Each task is functional or supporting work, and belongs to one milestone. The
[task schema](planning/tasks/tasks.schema.md) says what each kind means, and the
[milestone schema](planning/milestones/milestones.schema.md) says how a milestone's status follows
from its tasks. The order of the npm work is in [the milestone](#milestone-upstream-corpora-over-npm).

## First: unlock the evidence project

Another project is waiting on one thing. It needs a format for keeping evidence and research as
structured records. It will collect evidence, observations and test material, such as scripts,
queries and CSV results, as records with their files. Most of this exists already, so this comes
before the rest of the plan. It is tasks 1 to 5, 22 and 26.

- **1. Rename to corpus-schema.** Done. The package and spec are now `@osdlc/corpus-schema` on osdlc
  main, with the command `corpus-schema` and the root file `corpus-schema.md` (or `.yaml`,
  `.json`). The spec text has the levels.
  [osdlc/osdlc#725](https://github.com/osdlc/osdlc/pull/725) merged on 2026-11-09.
- **2. Record folders.** A record folder keeps a record together with its files. This is how a test
  run keeps its script, its query and its CSV results together. It is in the first published version:
  [osdlc/osdlc#729](https://github.com/osdlc/osdlc/pull/729). Done: it merged on 2026-11-09.
- **3. Publish the first version.** Done. `@osdlc/corpus-schema` 0.2.0 is on npm as `latest`, with
  record folders. The first release pull request,
  [osdlc/osdlc#726](https://github.com/osdlc/osdlc/pull/726), cut 0.1.0, but a release race left
  record folders pending, so 0.1.0 was never published. The next release pull request,
  [osdlc/osdlc#733](https://github.com/osdlc/osdlc/pull/733), made record folders a second minor
  bump. The owner merged it on 2026-11-09.
- **4. Example claims corpus.** This repo gets a valid level-2 corpus at `profiles/claims/example/`.
  It has the VA-Spec types (decision D8): `documents`, `study-results`, `methods` and `statements`.
  Each type has a schema. A few example records show the whole chain. A statement is a claim
  together with the evidence lines that support or dispute it. A README at
  `profiles/claims/README.md` maps each type to VA-Spec and says what we leave out. CI checks the
  example with `@osdlc/corpus-schema` from npm. People copy it with
  `npx degit osdlc/markdown/profiles/claims/example <dir>`. We don't need an npm package for that
  yet. Done: it merged in [osdlc/markdown#6](https://github.com/osdlc/markdown/pull/6).
- **26. harness-reference adopts the claims types.** Done. harness-reference copies the type folders
  from the example and moves its records over. `references` becomes `documents`, `evidence` becomes
  `study-results`, and the `harness` field goes away
  ([osdlc/skillwright#97](https://github.com/osdlc/skillwright/pull/97)).
- **22. Capture writes study results.** harness-reference has a capture command. It will write
  VA-Spec study results, each with a contribution (who, when and in what role). After 26.
- **5. The project writes records.** It copies the types from the example and starts keeping its
  evidence as records, checked by the validator. After 3, 4 and 22.

### How the types reach other corpora

The claims types reach other corpora in three steps, as the tools improve.

1. Now: a corpus copies the type folders from the example.
2. Task 9: the validator learns `extends` and `x-extends`, so a corpus can build on a parent that
   is a folder.
3. Task 23: the types ship as an npm package, `@osdlc/corpus-profile-claims`. A corpus lists it
   under `extends` in its root file and marks each type with `x-extends`, so it holds no copies.

Until step 3, copies can drift apart. That is fine for one or two corpora.

A database built from the records (JSON or SQLite) is not in the fast path. It is task 16, after
the query layer (task 15).

## Where we are today

![Every markdown package today, by layer, with the problems marked](diagrams/present.svg)

| Layer | TypeScript | Rust |
|---|---|---|
| Render, edit, sites | markdown-render, markdown-editor, markdown-ui, markdown-astro (all in dev) | none |
| Query and store | markdown-vault-query (dev) | markdown-store, ontogen (rust-ontogen) |
| Types | model-schema and its packs (dev, open PRs); corpus-schema (this repo) | none |
| Corpus model | markdown-vault, vault-graph-core (dev) | markdown-corpus, markdown-relink (osdlc) |
| Note parts | markdown-link, frontmatter-lossless, markdown-contract, markdown-tags, gfm-table, yaml-splice (osdlc) | a twin of each (osdlc) |
| Files | etag-write, path-guard (osdlc) | markdown-vault-fs, vfs-walk, vfs-seam, etag-write, path-guard (osdlc) |

markdown-tags moved into osdlc in [osdlc/osdlc#714](https://github.com/osdlc/osdlc/pull/714). Both
twins are on osdlc main with a conformance family. markdown-astro is moving in
[#719](https://github.com/osdlc/osdlc/pull/719) and markdown-render in
[#720](https://github.com/osdlc/osdlc/pull/720). The pack harness is in
[sksizer/dev#4069](https://github.com/sksizer/dev/pull/4069) and the first packs in
[sksizer/dev#4070](https://github.com/sksizer/dev/pull/4070). Neither is on dev main yet.

dev also keeps a private copy of markdown-link (`packages/ts/markdown-link`, version 0.1.0).
markdown-vault, vault-graph-core and markdown-astro use that copy through `workspace:*`, not the
published 0.8.1. dev task T-1NC5 tracks moving them off it.

What is published:

- Most osdlc note-part packages are on npm and crates.io. Two are not: the Rust gfm-pipe-table is
  `publish = false`, and markdown-tags is on neither registry yet.
- The Rust corpus packages (markdown-corpus, markdown-relink, markdown-vault-fs) are on crates.io.
- From rust-ontogen, ontogen 0.11.0, ontogen-core 0.8.0, ontogen-macros 0.2.0, ontogen-jsonapi
  0.3.0 and ontogen-ts 0.2.0 are on crates.io. markdown-store is `publish = false`.
- Nothing from dev is published. corpus-schema 0.2.0 is on npm, and skillwright's harness-reference
  uses it from there ([osdlc/skillwright#95](https://github.com/osdlc/skillwright/pull/95) removed
  skillwright's own copy).

## What is wrong

The biggest problem is that five pieces of code each decide what a link points to, and they don't
use the same rules.

![Five places resolve links, each its own way](diagrams/resolvers.svg)

| Id | Problem | Where |
|---|---|---|
| F1 | Three pieces of TypeScript decide links differently | markdown-vault has its own rule; vault-graph-core copies the Rust one; markdown-astro takes the first match and matches embeds by file name |
| F2 | TypeScript markdown-link can't resolve links | only the Rust crate can, so each TS package wrote its own |
| F3 | markdown-link misses some links | titles and parentheses in paths: [osdlc/osdlc#635](https://github.com/osdlc/osdlc/issues/635), fix in [#651](https://github.com/osdlc/osdlc/pull/651) |
| F4 | One thing, two words | both "vault" and "corpus" appear in both languages, and the spec uses corpus for something narrower |
| F5 | Two ways to define types | packs in model-schema, and schema files in corpus-schema |
| F6 | Two ways to lay out typed records | markdown-store and corpus-schema use different folders and links |
| F7 | markdown-store parses notes itself | its own frontmatter and wikilink code |
| F8 | The validator walks the folder itself | corpus-schema doesn't use the corpus model |
| F9 | Two query layers | markdown-vault-query exists; corpus-schema plans a loader |
| F10 | The old name sounded like a database | fixed: the spec is now corpus-schema |
| F11 | Packages in the wrong place | `@osdlc` packages that live in dev, including a private copy of markdown-link; vault-graph-core is `@sdlc` |

The Rust code says vault in markdown-vault-fs, in markdown-relink's `VaultFacts` and in
markdown-store's `VaultHandle`. The TypeScript code says vault in markdown-vault and
vault-graph-core.

## Where we want to end up

We follow four rules:

1. One package per job per language.
2. When a job has a TypeScript and a Rust package, they are twins. They share one set of
   conformance cases, so they behave the same.
3. One word for each idea.
4. Anything general lives in the osdlc org. The spec and its profiles live in this repo. The
   other packages stay in osdlc/osdlc until they move here. Apps use them from there.

![The target, by layer](diagrams/target.svg)

In practice:

- TypeScript markdown-link learns to resolve links the same way the Rust one does. Then nothing
  else needs its own resolver.
- markdown-vault and vault-graph-core become one TypeScript corpus model, the twin of the Rust
  markdown-corpus crate.
- The spec has levels 0 to 2. Its validator reads the corpus model instead of walking the folder
  itself.
- Types can come from parent corpora, such as profiles. There is one format for defining types, not
  two: plain JSON Schema.
- markdown-store writes the spec's layout and uses the shared note parts.
- There is one query layer, built on the corpus model.

Levels and profiles are separate ideas. A level says how much a corpus declares. A profile says
whose types it uses. So a profile is not "level 3": a corpus at level 2 can use the claims profile,
the sdlc profile and its own types all at once.

![Levels 0 to 2 on one side, profiles on the other](diagrams/levels-profiles.svg)

### Proposal: a baseline and dialects

This is a proposal, not a decision.

The spec would have a baseline that every tool supports. On top of it, a corpus could name a
dialect for things that vary from tool to tool, with no promise that every tool handles them. A
tool that knows the dialect checks it. A tool that doesn't checks only the baseline, and says that
it did.

The spec already accepts wikilinks. Today a wikilink resolves by a unique path suffix inside the
corpus, the validator warns about it, and `--fix` rewrites it as a relative link. A corpus that says
`dialect: obsidian` would make wikilinks first-class, with no warning. They could also reach beyond
the corpus to the rest of the vault, and the corpus could use embeds.

We already use the word this way. markdown-tags has three dialects, and markdown-render renders the
Obsidian dialect. It works like CommonMark as the baseline with GFM as an extension.

So the spec would have three separate settings:

- the **level**: how much a corpus declares, from 0 to 2;
- the **dialect**: which link and syntax flavor it uses beyond the baseline;
- the **extends** key: which parent corpora it uses. A profile, a shared set of types, is a parent
  corpus that has only types.

We'd like to call these shared sets of types **profiles**, not packs. Profile is the usual word in
data standards: FHIR profiles, Dublin Core application profiles, the W3C Profiles Vocabulary and the
`profile` link relation in [RFC 6906](https://www.rfc-editor.org/rfc/rfc6906), and GA4GH VA-Spec
profiles. In dev, "pack" already means plugin bundles (glossary term TM-0050). Its notes also say
that the proposed decision D-ME8T would stretch "pack" to cover packs of entity kinds, so dev may
end up using the word for this too. Whether model-schema switches its word is an open question for
[sksizer/dev#4069](https://github.com/sksizer/dev/pull/4069).

### Sharing across corpora

Some things belong to a whole organization, such as its engineering principles. Teams and projects
need them in their own corpora, next to local records. So a corpus can extend a parent corpus. The
parent can extend another one, so org, team and project form a chain. A profile is a parent that has
only types.

The parts below marked decided are decisions D11, D4 and D12. They are not built yet: tasks 9, 27
and 29 build them. The parts marked proposal are still open.

**Parents are npm packages (decided, D11).** A parent is an npm package or a local folder. npm or
pnpm installs it. `package.json` holds the version range and the lockfile pins the exact version, so a
parent update arrives only when someone updates the lockfile. A private org corpus can be a git
dependency, such as `"acme-principles": "github:acme/principles#v3"`, so it needs no registry.

The spec stays independent of npm. It says that each parent resolves to a folder that holds a
corpus. corpus-schema ships two resolvers: a package name, found the way Node finds packages from the
corpus folder, and a relative path (`./` or `../`), for monorepos.

A root file looks like this:

```yaml
corpus-schema: 0
level: 2
extends:
  claims: "@osdlc/corpus-profile-claims"   # package name, resolved from this folder
  org: "../org-principles"                 # or a relative path
```

The rules (decided):

1. `extends` maps a prefix to a source. A prefix is lowercase letters, digits and `-`. A source that
   starts with `./` or `../` is a path from the corpus root. Anything else is a package name. A
   package's corpus root is the package folder, or the folder named by a `corpus` field in its
   `package.json`. The folder must hold a `corpus-schema.md`. `extends` needs level 2.
2. Parents load transitively. Each parent's own `extends` resolves from the parent's folder. A cycle
   is an error, and so is an unknown prefix anywhere.
3. A parent's types are visible as `<prefix>/<type>`, read-only. A local type folder can use one as
   it is, with a schema that holds only `x-extends: claims/statements`, or add fields. A type has
   one parent for now.
4. Types are plain JSON Schema (D4). A type builds on another with `x-extends`, using a parent type
   or a local type name. A record must pass every schema up the chain, which is JSON Schema's
   `allOf`. A child can add rules or tighten them, never loosen them.
5. `x-ref: <prefix>/<type>` points at records of an inherited type. It also accepts local records
   whose type `x-extends` that type. An `x-ref` to a local type accepts records of local types that
   extend it.
6. Inherited records are read-only. A local record whose type extends an inherited type and whose id
   equals an inherited record's id is an error.
7. The root key `profiles` stays reserved and unused. `extends` replaces the idea.

**Inherited records come in as a committed copy (decided, D12).** `corpus-schema sync` copies each
parent corpus into `_inherited/<prefix>/`: its root file, type folders and records, and its own
`_inherited/`, so the chain carries through. The copy is committed. Relative links from local records
then resolve in Obsidian and on GitHub. The validator skips `_inherited/` when it looks for local
types and records. A link from a local record into `_inherited/<prefix>/` counts as a link to that
parent's record. When the copy is missing or differs from the installed parent, the validator says so
and names the fix: run `corpus-schema sync`. A corpus that only uses a parent's types and never links
its records needs no copy.

**Refine and waive (proposal).** A local record relates to an inherited one on purpose. It can cite
it with `x-ref`, which is decided. It could also narrow it with `refines`, or set it aside with
`waives` and a reason. Two records with the same type and id would be an error unless one says
`refines`. Nothing is shadowed silently. This is task 28.

For principles: the org keeps a principles corpus. A project extends it, refines a principle that
needs a stricter local form, and waives one that doesn't apply, with a reason. A reviewer can then
read the project's own corpus and see what holds and what was set aside.

## Milestone: upstream corpora over npm

The goal: a corpus can build on parent corpora that arrive as npm packages, with a lockfile pinning
them. We work toward it in this order. Each step names its task numbers. A task here can wait on one
outside the milestone, such as task 26.

1. **Finish the release setup here (task 21).** [osdlc/markdown#9](https://github.com/osdlc/markdown/pull/9),
   [osdlc/markdown#10](https://github.com/osdlc/markdown/pull/10) and
   [osdlc/markdown#17](https://github.com/osdlc/markdown/pull/17) have merged.
2. **Spec and validator (tasks 9 and 27).** `extends` with both resolvers, transitive loading,
   `x-extends`, cross-corpus `x-ref` and the id rule.
3. **`corpus-schema sync` and the copy check (task 29).**
4. **Release corpus-schema 0.3.0 (task 36).**
5. **The claims profile as an npm package (task 23).** `@osdlc/corpus-profile-claims`, a corpus with
   types only.
6. **An example pair, checked in CI (task 35).** An org corpus with records, and a project corpus that
   extends both the claims profile and the org corpus, with local records citing inherited ones. This
   is the start of task 30.
7. **harness-reference uses `extends` (task 37).** It stops holding copies of the claims types.

Later in the same milestone: refine and waive (task 28), a real org principles corpus (task 30) and
name overrides (task 24).

## Decisions

Each decision is a record in [planning/decisions/](planning/decisions/decisions.schema.md), with
its status and reasons.

### Names we considered

corpus-spec and corpora-spec named the document more than the tool, and the plural was easy to
mistype. markdown-corpus was already the Rust crate's name. markdown-records fit only the record
levels. markdown-db, the old name, sounds like a database, and other projects with that name are
databases.
