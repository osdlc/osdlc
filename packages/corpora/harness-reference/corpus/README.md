# Harness reference corpus

A cited record of coding-agent harnesses, in the shape of the
[claims profile](https://github.com/osdlc/markdown/pull/6) (VA-Spec 1.1.0): what each harness is,
and claims about how it behaves, each with the evidence behind it.

The corpus follows
[corpus-schema](https://github.com/osdlc/osdlc/blob/main/packages/conformance/corpus-schema/SPEC.md).
It is data only. The validator is the
[`@osdlc/corpus-schema`](https://www.npmjs.com/package/@osdlc/corpus-schema) package from npm.

## Layout

- `corpus-schema.md`: the root file. Its frontmatter marks the folder as a corpus; its body is the
  front page.
- `harnesses/`: one record per harness, named after the product as the vendor writes it, such as
  `Claude Code.md`. A required `slug` (`claude-code`) is its stable key.
- `documents/`: one record per page we can point at, in a folder per publisher:
  `documents/Anthropic/Claude Code overview.md`. A research note kept in this repository is a
  document with `documentType: research note`.
- `methods/`: one record folder per probe, `methods/<Name>/<Name>.md`, with its commands in the
  frontmatter and any fixture beside it.
- `study-results/`: one record per observation, in a folder per harness, named with the date:
  `study-results/Claude Code/2026-11-08 Claude Code license.md`. It quotes a document or records a
  run of a method. It claims nothing.
- `subjects/`: one record per question asked of every harness, in a folder per category:
  `subjects/cli/Session environment.md`. It holds the `slug` (`cli/session-env`) and a
  `valueSchema` for the answer.
- `statements/`: one record per claim about a harness and a subject in one scope, in a folder per
  harness. It holds the value, its evidence lines (links to study results), its strength and its
  status.

`notes/` holds research notes as narrative files. The validator ignores them. A note sits beside
the type folders, never inside one.

Each type folder holds its schema, `<type>.schema.md`: a hand-written JSON Schema in the
frontmatter. It is the source of truth for the fields; the body explains them.

`documents`, `methods`, `study-results` and `statements` are the claims profile's types, copied
from osdlc/markdown, branch `claims-example`, commit `663f5450a9f9fe777a4c86ace274508782e12346`.
Records are open in the profile; here each schema also lists the harness fields it adds, and
refuses others. The copies go when corpus-schema can resolve a profile package.

Links between records are relative Markdown links, written as quoted strings:
`successor: "[Antigravity](Antigravity.md)"`. A harness's `sources` links to documents, a study
result links to its `harness`, its `reportedIn` documents and its `specifiedBy` method, and a
statement links to its `harness`, its `subject` and the study results in its evidence lines.

A public repository that holds only issues, docs or install scripts is not a source repository, so
`repository` stays unset. When a required value cannot be confirmed, use the honest value (for
`versioning`, `unknown`) and say so in the body.

## Statements

A statement's proposition is the harness, the subject's slug and the value:

```yaml
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/session-env
  object: { vars: [CLAUDE_CODE_SESSION_ID, CLAUDE_PID] }
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Session environment](../../subjects/cli/Session%20environment.md)"
scope: { since: null, until: null, platform: [], model: null }
status: current # current | superseded | disputed | open
```

`harness` and `subject` repeat the proposition, because corpus-schema allows `x-ref` only on
top-level fields. `lint` keeps them equal. `since` is inclusive, `until` exclusive. A superseded
statement is linked from the one that replaced it, in `supersedes`.

Strength follows the evidence: a run, source or help-text line is strong, docs or a changelog
moderate, and an issue, third-party page or inference weak. The statement takes its strongest
supporting line, one step lower when a line disputes it. A reviewer may lower a strength, never
raise it past the rule. `lint` checks two parts of it: a line is no stronger than the best kind
among its own evidence items, and a statement is no stronger than its strongest supporting line.

### Paths in values

A path in `proposition.object` is data, not a quote, so one location is spelled one way:

- A project path is relative to the project root: `.agents/skills`, not `./.agents/skills`,
  `<proj>/.agents/skills` or `<project>/.agents/skills`.
- A home path starts with `~/`: `~/.agents/skills`, not `$HOME/.agents/skills` or
  `<home>/.agents/skills`.
- No trailing slash: `.claude/rules`, not `.claude/rules/`.
- `$VAR` stays only where the harness itself names a variable, such as `$CODEX_HOME`. `$HOME` is
  the exception: it is always written `~`.
- A placeholder with its own meaning stays, such as `<repo_root>/`.
- A setting that lists directories is not a directory. It gets its own key, such as
  `dirs_setting`.

`lint` flags a trailing slash, a leading `./`, a `<proj>/`, `<project>/` or `<home>/` prefix, and
`$HOME`, on any word in a value string that starts with `.`, `~`, `$` or `<` and holds a `/`.
Strings under a `commands` key are shell and keep their own spelling. Quotes in a statement's body
keep the source's spelling.

A listing that lacks an option, such as help text with no flag for it, is evidence of absence. It
supports a `supported: false` value one step below its kind, since a listing can leave an option
out: help text or source is moderate, docs weak.

Some statements cite a research note in `notes/` as a document, so some strong values still rest
on a note. Replace the note with the upstream page as study results are captured.

## Adding a harness

1. Copy a sibling file to `harnesses/<name>.md`, using the product's name as the vendor writes it.
2. Fill each field from the vendor's own pages, and link every page you used under `sources`. A
   page with no document record needs one first: copy a sibling in `documents/<publisher>/`, or
   let `capture` add it. Never guess a URL, license or command name; leave an optional field out
   instead. Pick a `slug` and never change it.
3. Set `checked` to today's date and write the body.
4. Run the check.

## Recording a study result

`capture` fetches a page, checks that a quote occurs on it, and writes a study result. From
`harness-reference/`:

```sh
pnpm run capture --harness "Codex CLI" --document "https://github.com/openai/codex" \
  --kind docs --locator "Docs" --name "Codex README on the license" \
  --observed-by "person: <you>" \
  --excerpt "This repository is licensed under the Apache-2.0 License."
```

- `--document` is an https URL or the path of a document record. A URL with no record gets one:
  its name and title come from the page title (or `--document-name` and `--title`), its publisher
  from the harness's vendor (or `--publisher`).
- `--kind` is one of `docs`, `changelog`, `source`, `issue` and `third-party`: the kinds that look
  at a page.
- The quote must occur in the page's visible text, compared with whitespace collapsed. Page chrome
  (`nav`, `header`, `footer`, `aside`) is not text. For a GitHub `blob/` URL, `capture` reads the
  raw file, and for a repository URL its README source, instead of the HTML page; quote what that
  source holds, Markdown link syntax included. It stores the quote with 32 characters either side,
  and fails when it is not found.
- `--observed-by` is `person: <name>` or `agent: <name>`; it becomes the first `contributions`
  entry.
- `observed` is today. The file is `study-results/<harness>/<today> <name>.md`; `--name` defaults
  to the document's name. `capture` never overwrites a record; a second look the same day needs its
  own `--name`.
- `--version` sets the harness version the page describes, with `--version-basis` (default
  `inferred`).
- `capture` validates the corpus afterwards and removes what it wrote if the corpus fails.

Study results are append-only: a correction, or a later look that finds something else, is a new
record. `capture` writes page kinds only. A run is written by hand and links its method in `specifiedBy`.

## Checking it

From `harness-reference/`:

```sh
pnpm run validate        # corpus-schema validate corpus
pnpm run lint            # the rules that compare records
pnpm run check           # validate, lint, test, typecheck
```

The validator checks each record against its schema, its id, and every link in it. `lint` checks
what a schema cannot:

- `proposition.object` fits the subject's `valueSchema`.
- `proposition.subject` links the same harness as `harness`, and `proposition.predicate` is the
  subject's `slug`.
- `scope.model` appears only on a `model_dependent` subject.
- `scope.since` and `scope.until` are absent when the harness's `versioning` is `unknown`, are
  spelled as that versioning says, and are in order.
- At most one `current` statement covers any version of a harness, subject, platform and model.
- A `supersedes` link names another statement, and that statement has status `superseded`.
- A line is no stronger than its evidence kinds allow, and a statement no stronger than its strongest
  supporting line.
- Every evidence link is a study result about the same harness.
- A `run` study result links a method that lists its harness, and a command names no home
  directory.
- Harness and subject slugs are unique, and a subject's slug starts with its category.

`pnpm exec corpus-schema validate --fix corpus` rewrites any wikilinks as relative links
first.
