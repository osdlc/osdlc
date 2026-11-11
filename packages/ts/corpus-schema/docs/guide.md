# The corpus-schema guide

This guide explains corpus-schema in plain words: what it is, why we made it, how its levels work,
why we chose what we chose, and where it is going. The rules themselves are in the spec,
[SPEC.md](../packages/conformance/corpus-schema/SPEC.md).
This guide explains the spec, but SPEC.md is the rule. Where the two differ, follow SPEC.md, and
tell us so we can fix the guide.

Version 0 of the spec is in force. While it is at version 0 we rewrite it in place. Some parts of
this guide describe proposals from the [ecosystem plan](ecosystem-plan.md)
([osdlc/markdown#4](https://github.com/osdlc/markdown/pull/4)) and the
[architecture](architecture.md) ([osdlc/markdown#5](https://github.com/osdlc/markdown/pull/5)).
Those parts say "Proposed" and are not built. Everything else describes what is on main in
this repository today.

## Contents

1. [What it is](#what-it-is)
2. [Why it exists](#why-it-exists)
3. [A small corpus](#a-small-corpus)
4. [Levels](#levels)
5. [The rules in detail](#the-rules-in-detail)
6. [Three settings: level, dialect and profiles](#three-settings-level-dialect-and-profiles)
7. [Sharing across corpora](#sharing-across-corpora)
8. [Why we decided what we did](#why-we-decided-what-we-did)
9. [What v0 does not do yet](#what-v0-does-not-do-yet)
10. [The plan for the spec](#the-plan-for-the-spec)
11. [FAQ](#faq)
12. [Words used](#words-used)

## What it is

corpus-schema is a spec for folders of notes that hold typed records. A record is one Markdown,
YAML or JSON file. Records of the same kind sit in a type folder, and each type has a JSON Schema
that says what its records hold. A validator then checks the records against their schemas, and
checks their ids, their links and the references between them, the way a database checks its rows.
The files stay plain notes. You can still edit them in Obsidian, read them on GitHub, or open them
in any editor.

We call such a folder a corpus: a folder of notes and the files they link to. The spec says what a
corpus can declare about itself on top of its notes. The reference validator is the npm package
[`@osdlc/corpus-schema`](https://github.com/osdlc/osdlc/tree/main/packages/ts/corpus-schema#readme),
and its command is `corpus-schema validate`.

## Why it exists

Facts kept as notes drift. A field gets misspelled, a link points at a file that was renamed, and
nothing notices. corpus-schema lets a folder of notes say what its records should look like, so a
tool can catch those mistakes, in CI or on your machine.

It is for people and tools that keep typed records as files and still want to edit them as plain
notes. Two kinds of use shaped it:

- A reference corpus that code depends on. harness-reference is a cited record of how coding-agent
  harnesses differ. Code reads its facts as typed values, and each value cites the evidence behind
  it. The evidence work that follows it keeps scripts, queries and CSV results beside the records
  that describe them.
- A small app that keeps its data inside a user's vault. A reading list, a task tracker or a set of
  shared policies can be a corpus. The app reads and writes records, and the user still browses
  and edits them as notes.

One rule runs through the whole design: the folder is pure data. Every rule a tool enforces is
written in the spec or in the corpus's own files, never only in code. So a validator written in
another language can check a corpus the same way. The spec's conformance cases sit beside it for
that reason.

A second rule matters as much: a corpus can be moved. You can drop a corpus folder into a larger
vault or repo, and its data still works. Its links are relative, so they still point at the right
files. Its root file still marks where it starts, and the validator finds every corpus below the
folder you give it. So a team can ship a bundle of records, such as a set of shared types with
example data, and people can copy it into their own notes without fixing anything.

What it is not:

- It is not a database. It does not answer queries, keep an index or handle many writers at once.
  In v0 a write replaces the whole file and the last writer wins.
- It is not a query engine. Reading a corpus as a database is a separate layer that we plan to
  build later on the same files. That layer needs running code: something has to load the
  records, keep an index and answer queries. corpus-schema is only the data definition, so that
  layer can be built on top of it, in any language, without changing the files.
- It does not check the structure of a single document, such as its headings and sections.
  [`@osdlc/markdown-contract`](https://github.com/osdlc/osdlc/tree/main/packages/ts/markdown-contract#readme)
  does that. corpus-schema checks a whole folder: data against schemas, and links, ids and
  references across files.

## A small corpus

Here is a small corpus. It holds two types: `harnesses` (coding-agent harnesses) and `methods`
(ways we check facts about them). The `Survey` method is a record folder, so its script, query and
results sit beside it.

```text
evidence/
├── corpus-schema.md                the root file, and the corpus's front page
├── README.md                       narrative: the validator ignores it
├── harnesses/
│   ├── harnesses.schema.md         the type "harnesses" and its JSON Schema
│   ├── Claude Code.md              a record, id "Claude Code"
│   └── Gemini CLI.md               a record, id "Gemini CLI"
└── methods/
    ├── methods.schema.yaml         the type "methods" and its JSON Schema
    └── Survey/                     a record folder
        ├── Survey.md               the record, id "Survey"
        ├── count.py                these files belong to the record
        ├── query.sql
        └── results/
            └── counts.csv
```

The root file, `corpus-schema.md`, marks the folder as a corpus. Its frontmatter holds the
settings. Its body is the front page people see when they open the corpus.

```markdown
---
corpus-schema: 0
level: 2
formats: [md, yaml]
---

Facts about coding-agent harnesses, and the methods we use to check them.
Start with [the harnesses](harnesses/harnesses.schema.md).
```

`corpus-schema: 0` says which version of the spec the corpus follows. `level: 2` promises that
every type has a schema. `formats: [md, yaml]` allows records written as Markdown or as YAML.

A type is a folder that holds a schema file named after the folder. Here is
`harnesses/harnesses.schema.md`. The frontmatter is the JSON Schema, written in YAML. The body
explains the type to people.

```markdown
---
$schema: https://json-schema.org/draft/2020-12/schema
title: Harness
type: object
additionalProperties: false
required: [vendor, status]
properties:
  vendor: { type: string }
  status: { enum: [current, sunsetting, retired] }
  successor: { type: string, x-ref: harnesses }
---

One harness per record. `successor` links to the harness that replaces it.
```

`x-ref: harnesses` makes `successor` a typed link: its value must be a link to a `harnesses`
record. A record looks like any other note. This is `harnesses/Claude Code.md`, and its id is its
file name without the extension, `Claude Code`.

```markdown
---
vendor: Anthropic
status: current
---

Anthropic's terminal agent.
```

The `methods` type keeps its schema as YAML, in `methods/methods.schema.yaml`. Its `harnesses`
field is a list, and each item must link to a `harnesses` record.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
type: object
additionalProperties: false
required: [question, status]
properties:
  question: { type: string }
  status: { enum: [planned, run] }
  harnesses:
    type: array
    items: { type: string, x-ref: harnesses }
```

`methods/Survey/` is a record folder, because it holds a record file named after itself,
`Survey.md`. The record links to its own files with ordinary relative links. In frontmatter a link
is a quoted string.

```markdown
---
question: Which harnesses read AGENTS.md?
status: run
harnesses:
  - "[Claude Code](../../harnesses/Claude%20Code.md)"
  - "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
---

[count.py](count.py) runs [the query](query.sql) and writes
[the counts](results/counts.csv).
```

`count.py`, `query.sql` and `results/counts.csv` belong to the record. They are not records, so
they are not checked against the schema. The links to them are checked.

Checking the corpus:

```console
$ corpus-schema validate evidence
ok: evidence: 2 harnesses, 1 methods
```

If `Survey.md` said `status: done`, or linked to a file that does not exist, the validator would
print one line for each problem and exit with code 1.

## Levels

The spec has three levels. Each one adds rules to the level below it.

| Level | The corpus declares                                | Rules it adds                                                                   | What you get                                                      |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 0     | Nothing. Any folder of linked notes, no root file. | Its relative Markdown links resolve.                                            | Nothing to set up. Every notes folder is already here.            |
| 1     | A root file marks it as a corpus.                  | Type folders, record folders, ids, YAML and JSON records. Schemas are optional. | The validator finds the corpus and checks ids, formats and links. |
| 2     | A JSON Schema for each type.                       | Every record is checked against its type's schema. `x-ref` links are checked.   | Every field of every record is checked.                           |

### Level 0

Any folder of linked notes is a corpus at level 0. An Obsidian vault is one, and so is a docs
folder. The only rule is that its relative Markdown links resolve.

The validator does not check level 0. It finds a corpus by its root file, and a level-0 folder has
none. Run on such a folder, it says so and exits with code 1:

```console
$ corpus-schema validate notes
notes: no corpus-schema root file at or below it
```

### Level 1

A folder with a root file is a corpus at level 1 or 2. At level 1 the folder can have type folders
and records, and their ids, formats and links are checked. A type does not need a schema yet. An
empty schema file makes an untyped type:

```text
reading-list/
├── corpus-schema.yaml          corpus-schema: 0
└── books/
    ├── books.schema.md         empty: an untyped type
    └── The Dispossessed.md
```

A level-1 corpus can also use `references` to link to another corpus's records (see
[Sharing across corpora](#sharing-across-corpora)). `extends` and `uses` need level 2.

The validator checks that `The Dispossessed` is a valid id and that every link in the record
resolves. It does not check the record's fields, because the type has no schema. A schema file
counts as empty when it is an empty file, has empty frontmatter, is a `.md` file with no
frontmatter, or holds `{}`.

### Level 2

At level 2 every type has a schema that is not empty, and every record is checked against it. To
make that a promise the validator holds you to, state the level in the root file:

```yaml
corpus-schema: 0
level: 2
```

With `level: 2`, an untyped type is an error. A type that has a schema is checked against it at any
level, so a corpus with no `level` key and a schema on every type is checked just as fully. Only the
promise is missing. The `level` key accepts `1` or `2`. Any other value, `0` included, is an error,
since a level-0 folder has no root file to write it in.

### Why levels

Levels let a corpus start as an ordinary folder of notes and add structure one step at a time.
Every notes folder is already at level 0. Adding a root file turns folders into types, with ids and
checked links. Adding schemas, when you know what the fields are, turns on field checks. Nothing
has to be rewritten between steps.

## The rules in detail

This section restates the rules in SPEC.md in plain words. It covers corpora at level 1 and 2:
from here on, a corpus is a folder that holds a root file.

### The root file

The root file is `corpus-schema.md`, `corpus-schema.yaml` or `corpus-schema.json`. The name must
match exactly, case included, so a corpus is the same on every file system. A folder holds at most
one root file.

In `corpus-schema.md` the settings are the YAML frontmatter, and the body is the corpus's front
page. The body may be empty. In the `.yaml` and `.json` forms the whole file is the settings. The
settings must be a mapping.

| Key             | Required | Holds                                                                           |
| --------------- | -------- | ------------------------------------------------------------------------------- |
| `corpus-schema` | yes      | The spec version. `0` for v0. A tool must refuse a version it does not support. |
| `id`            | no       | A stable handle for the corpus, such as `reading-list` or a UUID.               |
| `formats`       | no       | The record formats the corpus allows. The default is `[md]`.                    |
| `level`         | no       | `1` or `2`. Any other value is an error.                                        |
| `extends`       | no       | The parents whose types it builds on, by prefix. Needs `level: 2`.              |
| `references`    | no       | The corpora whose records it links to, by prefix. Works at level 1 and 2.       |
| `uses`          | no       | Parent types its folders hold as they are. Needs `level: 2`.                    |
| `dialect`       | no       | Reserved for a later version. Not checked yet.                                  |
| `profiles`      | no       | Reserved and unused. `extends` replaces it.                                     |

`extends`, `references` and `uses` are explained under
[Sharing across corpora](#sharing-across-corpora).

- `id` lets an app find its corpus after a user moves or renames the folder. The app scans for root
  files and picks the one with its id. Links never use `id`. Two corpora with the same `id` get a
  warning when they are checked together.
- The corpus's name is its folder name. Renaming the folder renames the corpus, as renaming a
  package does.
- `dialect` and `profiles` get a warning that says they are not checked yet. Any other key gets a
  warning that it is not a v0 key. Neither is an error, because later versions add keys.

### Formats

`formats` lists the record formats the corpus allows:

| Format | Extension | The record's data                                                   |
| ------ | --------- | ------------------------------------------------------------------- |
| `md`   | `.md`     | The YAML frontmatter, between `---` lines. A Markdown body follows. |
| `yaml` | `.yaml`   | The whole file, one YAML mapping.                                   |
| `json` | `.json`   | The whole file, one JSON object.                                    |

- `[md]`, the default, keeps every record a note you can browse in Obsidian.
- `[md, yaml, json]` makes a hybrid corpus. Data-only records can sit beside notes, even in one
  type.
- A record in a format the corpus does not list is an error.
- A `.yml` file in a type folder is an error. The extension is `.yaml`.
- Extensions are lower case. `X.MD` in a type folder is an error.
- `formats` covers records only. The root file and schema files can use any of the three forms.

### What a corpus holds

A corpus holds every file under its folder, except:

- any path with a part that starts with `.`, such as `.git/`, `.obsidian/` or `.DS_Store`;
- any path with a part named `node_modules`;
- symbolic links. A tool does not follow them, so a link to one does not resolve. A symbolic link
  inside a type folder gets a warning, since a record there would not be checked;
- a folder with its own root file. That folder is a separate corpus, and the outer corpus stops at
  it;
- the folder `_references` at the corpus root, which holds copies of the corpora it references.

A corpus must not sit inside a type folder.

### Types and schemas

- A type is a folder that holds a schema file named after the folder:
  `harnesses/harnesses.schema.md`, `.yaml` or `.json`. The name matches exactly, case included. A
  type folder holds at most one schema file.
- The type's name is its folder name. Type names are unique within a corpus. A type folder can sit
  at any depth, but not inside another type folder.
- A type folder with the same name as another type, or inside another type folder, is an error,
  and that folder is not a type. Its schema file is still checked for links. Its records count as
  the outer type's records when it sits inside another type folder, and as narrative otherwise.
- A schema file whose name does not match exactly, such as `harnesses/Harnesses.schema.md`, is not
  a schema file. The folder is then not a type, and its files are narrative. No error is reported.
- A second schema file in one type folder is an error. The type keeps the first one.
- The schema is a JSON Schema, draft 2020-12, for a record's data. In a `.md` schema file the
  frontmatter is the schema and the body documents the type. In `.yaml` and `.json` the whole file
  is the schema.
- Renaming a type folder means renaming its schema file too.

The schema sits inside its folder, so the folder carries its own rules when it moves. It is named
after the folder, so search and Obsidian's quick switcher find it by the type's name.

### Each schema stands alone

Each type's schema is read on its own. Two types may give their schemas the same `$id`, and a
`$ref` in one type's schema does not reach another type's schema. A type folder that you copy into
another corpus arrives with all of its rules. To share types on purpose, extend a corpus that holds
them (see the [FAQ](#how-do-i-share-types-between-corpora)).

The spec adds six keywords to JSON Schema, `x-ref`, `x-ref-form`, `x-id-pattern`, `x-extends`,
`x-identity` and `x-record-file`, and a validator must accept all six. The reference validator reports any other unknown keyword in a schema as an error, so a
misspelled keyword is caught.

### Records

- Every `.md`, `.yaml` and `.json` file under a type folder, at any depth, is a record of that
  type. The exceptions are the type's schema file, the files a record folder owns and the files in
  a narrative folder. Other files in a type folder, such as images, are narrative.
- A folder in a type folder, at any depth, whose name starts with `_`, such as `_attachments/`, is
  a narrative folder. Every file under it is narrative. This tells it apart from the two other
  kinds of folder in a type folder: a record folder holds its record file, and a plain folder
  holds records.
- A record's type comes from its folder. A record has no type field.
- A record's data must be a mapping. A `.md` record with no frontmatter has empty data, and its body
  may be empty.
- A record's data must pass its type's schema.

So records can be grouped in plain folders inside a type folder, such as
`harnesses/google/Gemini CLI.md`. The folder is only a place to keep files. The record is still a
`harnesses` record with the id `Gemini CLI`.

### Record folders

A record folder lets a record keep its own files beside it, such as the script, the query and the
CSV results of a method the record describes.

- A folder inside a type folder that holds a record file is a record folder. The record file is
  named after the folder (`<folder>.md`, `<folder>.yaml` or `<folder>.json`), or it has the name
  the type's `x-record-file` gives. The name matches exactly, case included. The record file must
  sit directly in the folder.
- The record's id comes from the folder name (see [Ids](#ids)). `methods/Survey/Survey.md` has the
  id `Survey`.
- `x-record-file` at the root of a schema names a record file for the type's record folders. It is
  a file name with no path and a `.md`, `.yaml` or `.json` extension, such as `README.md`. With
  `x-record-file: README.md`, `decisions/D-0001-split/README.md` is a record with the id of its
  folder. A type with no `x-record-file` of its own takes the one of the nearest type up its
  chain, so a type that `uses` a parent type or builds on it gets the parent's. Any other value is
  an error.
- The type folder's own file of that name, such as `decisions/README.md`, documents the type. It
  is narrative, not a record.
- A record folder holds one record file. A folder that holds two, such as `<folder>.md` and the
  `x-record-file`, is an error at the second.
- This holds whatever `formats` says. A record file in a format the corpus does not allow still
  makes a record folder, and that file is a format error.
- Every other file under a record folder, at any depth, belongs to the record. It is not a record,
  so its data and id are not checked, and its links are not checked either. The validator ignores it,
  as it ignores narrative.
- Links from the record file to its own files resolve as any relative link does:
  `[the counts](results/counts.csv)`. Links into another record's folder resolve too. An `x-ref`
  points at the record file, not at the folder.
- A record folder must not hold another record folder, at any depth. That is an error, and the inner
  folder's files belong to the outer record. A folder in a record folder whose only record file is
  the `x-record-file`, such as a `README.md`, is not a record folder, and its files belong to the
  outer record with no error. A record folder cannot hold a type folder either, since
  no type folder sits inside another.
- Ids are compared across both shapes: `methods/Survey/Survey.md` and `methods/survey.md` collide.
- A folder in a type folder with no record file is not a record folder. Unless its name starts with
  `_`, it is a plain folder: each `.md`, `.yaml` and `.json` file in it is a record of the type.

osdlc calls this shape a bundle: a note's folder holding `<name>/<name>.md` and the files beside it.
Moving the folder moves the record and its files together, and their relative links keep working.

### Ids

A record's id comes from its name: its file name without the extension, or for a record folder's
record, the folder name. `harnesses/Claude Code.md` has the id `Claude Code`. An id is a name
people read, so spaces and capitals are fine.

- A type can narrow its ids with `x-id-pattern`, a regular expression at the root of its schema
  (ECMA-262 syntax, Unicode mode). For example, `x-id-pattern: "^[a-z0-9-]+$"` allows only slugs.
  With a pattern, the id is the longest of these that every `x-id-pattern` up the type's chain
  matches: the whole name, or a part of it that ends just before a `-`. With
  `x-id-pattern: "^P-[0-9]{4}$"`, `P-0002-favor-deterministic.md` has the id `P-0002`, and the rest
  of the name is a slug for people. A name the patterns match whole keeps the whole name as its
  id. A name with no matching part is an error.
- A record's data can hold `id`. When it does, it must be a string that names the record's id, as
  ids compare. Anything else is an error at `id`.

- An id must not contain `/ \ : * ? " < > |`, which some file systems refuse, or `[ ] # ^`, which
  break links. It must not contain control characters.
- An id must not start or end with a space or a dot.
- Ids are unique within a type, across every folder and every extension. They are compared after
  Unicode NFC normalization and case folding, so `Kiro.md`, `kiro.json` and `aws/Kiro.md` collide.
- Type names follow the same rules.

### Narrative

Every file that is not the root file, a schema file or a record is narrative: READMEs, guides,
essays, daily notes, attachments. Narrative can sit anywhere in a corpus, and the validator ignores
it, links included.

### Links

The canonical link is a relative Markdown link: `[Claude Code](../harnesses/Claude%20Code.md)`.

- The path is relative to the file that holds the link. A space is written `%20`, or the body form
  wraps the path in `<…>`.
- In frontmatter a link is a quoted string that holds the whole link:
  `successor: "[Antigravity](Antigravity.md)"`. A bare path such as `"Antigravity.md"` is not a
  link.
- The validator checks the links in records, the root file and schema files: in their bodies, in
  every string of the data of records and the root file, and in a schema in the strings of its
  prose keywords `title`, `description` and `$comment`, at any depth. Other strings in a schema,
  such as a `pattern`, a `const` or an `enum` value, are not text and hold no links. It skips links with a URL scheme, such as `https:` or `mailto:`, and
  links to a heading in the same file, such as `#usage`.
- A relative path must lead, after percent-decoding, to a file or folder that exists, with the same
  case. The validator never falls back to matching by name, as Obsidian does. A broken path is
  always an error. The part after `#` is not checked.
- A path that starts with `/` is an error. Links in a corpus are relative.
- A link into `_references/<prefix>/` is a link to a file of a corpus the corpus references. It
  stays in the corpus (see [References and the copy](#references-and-the-copy)).
- A link that leaves the corpus (above its root, into a nested corpus, or into an excluded path such
  as `.git/`) is a link between corpora. v0 does not define those yet. It gets a warning, not an
  error, except in an `x-ref` field.

### Wikilinks

Wikilinks are accepted but not canonical: `[[target]]`, `[[target|text]]`, `[[target#heading]]` and
`![[target]]`.

- A wikilink resolves by path suffix within the corpus and the copies of the corpora it references
  directly, as `_references/<prefix>/<path>`, after NFC normalization and case folding. A match in
  a copy is a link into it. A copy's own `_references/` is not searched. `[[Claude Code]]`, `[[harnesses/Claude Code]]` and `[[harnesses/Claude Code.md]]` all match
  `harnesses/Claude Code.md`. The extension of a record can be left out.
- A wikilink that matches no file and has no `/` names a record by id. The record can be of any
  type, in the corpus or in a corpus it references, and its id or whole file name must fold to the
  target, as the `id` form of `x-ref` resolves. `[[P-0002]]` names
  `principles/P-0002-favor-deterministic.md`. A record of a referenced corpus is a link into its
  copy. Obsidian does not resolve such a wikilink by itself. `validate --fix` rewrites it as a
  relative link.
- No match is an error. More than one match is an error.
- A wikilink that matches nothing in the corpus but matches a file in a nested corpus leaves the
  corpus, and gets the same warning as a Markdown link that leaves it.
- A target that starts with `/` is an error.
- Every wikilink that resolves gets a warning.
- `corpus-schema validate --fix` rewrites each wikilink that resolves to one file as a relative
  Markdown link, and changes nothing else. `See [[Dune]].` becomes `See [Dune](Dune.md).`
- In frontmatter, a wikilink must be a quoted string: `series: "[[Dune]]"`. Unquoted,
  `series: [[Dune]]` is a YAML list inside a list, not a link. `--fix` leaves such a file alone and
  warns, because the rewrite would change its data.

### References: `x-ref`

`x-ref` is a schema keyword that makes a field a typed reference, like a foreign key in a
database. Its value names a type, or lists several types. A type is named `<type>` in the same
corpus, or `<prefix>/<type>` in a parent or a referenced corpus (see
[Namespace](#namespace)):

```yaml
successor: { type: string, x-ref: harnesses }
cites: { type: string, x-ref: org/principles }
after:
  {
    type: array,
    items: { type: string, x-ref: [tasks, decisions, milestones] },
  }
```

- It sits on a top-level property, or on the `items` of a top-level array property, where each
  item is a reference. v0 defines `x-ref` only in those two places. Anywhere else, such as inside
  a nested object, it is an error.
- Every named type must exist, in the corpus or in a corpus its prefixes name. A list must name one
  or more.
- A reference matches a record of any named type, or of a type that extends one through
  `x-extends`.

`x-ref-form`, beside `x-ref`, says how the value names the record:

| `x-ref-form`     | Value                                  | Resolved                                        |
| ---------------- | -------------------------------------- | ----------------------------------------------- |
| `link` (default) | `"[Antigravity](Antigravity.md)"`      | as a relative link, to a matching record's file |
| `id`             | `T-0012`                               | by id, among the matching records               |
| `wikilink`       | `"[[N-0001]]"` or `"[[N-0001\|text]]"` | by id, as `id` does                             |

- An `x-ref` link that leaves the corpus is an error, not a warning. A link to a referenced
  corpus's record goes through `_references/<prefix>/`.
- An id matches as ids compare, after NFC normalization and case folding. It may name a record in
  the corpus or in any corpus it references, at any depth. A parent gives no records. A value can
  also name a record by its whole file name without the extension, or by its record folder's name,
  where that is longer than its id: `P-0002-favor-deterministic` names `P-0002`. No match is
  an error, and so is more than one.
- A `null` value, as a field or as an item, refers to nothing and is not checked as a reference.
  The schema says whether `null` is allowed. Records with one identity are one record, however many chains
  reach them (see [Identity](#identity)).
- Quote a wikilink in YAML: `about: "[[N-0001]]"`. Unquoted, `[[N-0001]]` is a list.
- An `id` or `wikilink` field is not checked as a link. Its wikilinks get no warning, and
  `validate --fix` leaves them as they are.
- A `wikilink` to a referenced corpus's record needs its copy in `_references/<prefix>/`, because
  Obsidian resolves the wikilink there. An `id` needs no copy.

The `id` and `wikilink` forms suit corpora written by tools that keep ids, such as sdlc, whose
tasks write `depends_on: [T-0012]` or `[[N-0001]]`.

### Errors and warnings

An error makes the corpus invalid, and `validate` exits with code 1. A warning is printed, and the
corpus is still valid. The warnings in v0 are:

| Warning                                                                         | Why it is not an error                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| The root file uses `dialect` or `profiles`                                      | Reserved for later versions. v0 says it does not check them.         |
| The root file has a key v0 does not know                                        | Later versions add keys.                                             |
| Two corpora checked together share an `id`                                      | Each corpus is still valid on its own.                               |
| A symbolic link inside a type folder                                            | It is not followed, so a record there is not checked.                |
| A link, or a wikilink, that leaves the corpus                                   | v0 defines links to referenced corpora only, through `_references/`. |
| A folder with record files, named like a parent type, that `uses` does not name | It may be a typo or a missing `uses` entry.                          |
| `x-identity` in a corpus that has no package URL                                | There is nothing to match it against.                                |
| A wikilink that resolves, by path or by id                                      | It works, but it is not the canonical form.                          |
| `--fix` could not rewrite a file's wikilinks                                    | The file is left as it was.                                          |

Everything else the validator reports is an error. That includes a broken link, a wikilink with no
match or more than one, a record that fails its schema, data that does not parse, a bad id, two ids
that collide, a record in a format the corpus does not allow, a nested record folder, an unknown
schema keyword, and an `x-ref` that leaves the corpus, points at the wrong type or names no record.
Errors in how corpora are named are also errors: a source that does not resolve, a cycle, a prefix in
both `extends` and `references`, a link into a parent, a `_references/` copy that does not match the
installed corpus, a second version of one corpus in the graph, and a wrong `x-identity`.

`validate --strict` fails on a warning as on an error. Use it in CI to hold a corpus to no
warnings.

### The validate command

v0 defines two verbs, `validate` and `sync`.

```sh
corpus-schema validate [--fix] [--strict] <folder>...
```

- It checks every corpus at or below each folder.
- It prints one line per problem, as `<file>: <field>: <message>`, with the file relative to the
  corpus root. A problem that is not in one field puts a word in parentheses in the field's place,
  such as `(data)` for data that does not parse or `(folder)` for a folder problem.
- Warnings start with `warning: `. A corpus that passes prints `ok: <name>: <counts>`.
- The `<file>: <field>` part of each line is fixed by the spec. The message text after it is not,
  and may change in any release.
- `--fix` first rewrites the wikilinks it can resolve, then checks the result.
- `--strict` fails a corpus that has warnings, and prints `<name>: <n> warning(s), and --strict
fails on them`.

| Exit code | Meaning                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `0`       | Every corpus is valid. Without `--strict`, warnings may have been printed.                            |
| `1`       | A corpus has an error, or a warning under `--strict`. Or a folder holds no corpus, or cannot be read. |
| `2`       | Bad usage: an unknown verb or option, or no folder.                                                   |

### The sync command

```sh
corpus-schema sync [<folder>...]
```

- It writes `_references/<prefix>/` in every corpus at or below each folder, by default `.`: a copy
  of each corpus the root file names under `references`. It removes every other file there. It
  copies nothing for `extends`.
- It changes nothing outside `_references/`, and a second run changes nothing.
- A corpus syncs after the corpora it references that sit below the same folder, so a chain in one
  repository syncs in one run.
- When the root file has an error, or a referenced corpus does not resolve or has errors of its
  own, including a cycle, it writes nothing in that corpus and exits with code 1.
- When a referenced corpus turns a folder into a file, or a file into a folder, the copy follows.
- `sync` owns `_references/`. In a corpus with no `references` it empties it. It does not follow a
  symbolic link there, and reports one as an error.
- `validate` never writes the copy. It checks it, and says to run `sync` when it is stale.

### Writing records

A tool that writes records changes only the keys it owns. It keeps key order, unknown keys,
comments and the body. In v0 a write replaces the whole file, and the last writer wins.

## Three settings: level, dialect and profiles

A corpus says three separate things about itself in its root file. In v0 the level and profiles
work. The dialect is reserved, and its design is a proposal.

| Setting  | It says                                    | In v0                                                     |
| -------- | ------------------------------------------ | --------------------------------------------------------- |
| Level    | How much the corpus declares, from 0 to 2. | Built. `level: 1` or `level: 2`.                          |
| Dialect  | Which syntax it uses beyond the baseline.  | Reserved key `dialect`. Warns that it is not checked yet. |
| Profiles | Which shared sets of types it uses.        | Built, as parents under `extends`. `profiles` is unused.  |

The settings are separate on purpose. A profile is not a higher level, and a dialect is not a
profile. A level-2 corpus can use the claims profile, another profile and its own types all at
once.

A root file that uses all three could look like this. Profiles are named under `extends:` (see
[Sharing across corpora](#sharing-across-corpora)). `dialect` is proposed: in v0 it gets a warning
that it is not checked, and nothing is read from it.

```yaml
corpus-schema: 0
level: 2
dialect: obsidian
extends:
  claims: "@osdlc/corpus-profile-claims"
```

### Dialects (proposed)

The baseline is what every tool supports. Today it has relative Markdown links, and it accepts
wikilinks with a warning, as described above.

A dialect would be a named flavor of note syntax on top of the baseline, for things that vary from
tool to tool. The first one would be `obsidian`. A corpus that says `dialect: obsidian` would make
wikilinks normal, with no warning. They could reach beyond the corpus into the rest of the vault,
and the corpus could use embeds.

There would be no promise that every tool handles every dialect. A tool that knows the dialect
checks it. A tool that does not checks only the baseline, and says that it did. This is how
CommonMark and GFM work: CommonMark is the baseline and GFM is an extension. Our own markdown-tags
package already has dialects in this sense.

### Profiles

A profile is a shared, versioned set of types that many corpora can follow: a parent corpus that
holds types and no records. This repo has two drafts, neither published as a package yet. The
claims profile is for statements backed by evidence, and its design is in
[the plan](ecosystem-plan.md). The [planning profile](../profiles/planning/README.md) holds tasks,
milestones and decisions, and this repo's plan extends it by path.

- A corpus names its profiles in the root file under `extends:`, each under a short prefix. The
  prefix is always required, so adding a second profile later breaks nothing. An unknown prefix is
  an error.
- A profile is an npm package or a folder. npm or pnpm installs it, `package.json` holds the range,
  and the lockfile pins the version.
- A type says which profile type it builds on with `x-extends`, for example
  `x-extends: claims/study-results`.
- A record passes its own type's schema and the schema of every type above it.
- A profile can extend another profile. It adds rules or tightens them, but never loosens them. So
  a record that is valid under the child profile is also valid under the parent. VA-Spec and FHIR
  profiles work this way.
- A corpus can give a profile's type its own folder name: a local `findings/` type can
  `x-extends: claims/statements`. Field names stay the profile's, so tools and exports work
  everywhere.
- A corpus can take a profile's type as it is, with no schema file, by naming it under `uses` (see
  [Uses](#uses)).

## Sharing across corpora

Some things belong to a whole organization, such as its engineering principles. Teams and projects
need them next to their own records. A corpus can build on another corpus's types, link to another
corpus's records, or do both. Refining or waiving a referenced record on purpose is proposed.

### Three keys

A corpus names other corpora in its root file. Three keys do it, each for one purpose:

| Key          | It gives the corpus                                                                               | Needs             |
| ------------ | ------------------------------------------------------------------------------------------------- | ----------------- |
| `extends`    | A parent's **types**, to build on. A parent's records are not brought in.                         | `level: 2`        |
| `references` | Another corpus's **records**, to link to. Its types can be read as `x-ref` targets, not built on. | `level: 1` or `2` |
| `uses`       | Local folders that hold a parent's type **as it is**, with no schema file.                        | `level: 2`        |

```yaml
corpus-schema: 0
level: 2
extends:
  sdlc: "@osdlc/corpus-profile-sdlc" # a package name
references:
  org: "../org-principles" # a path from the corpus root
uses: [sdlc/tasks, sdlc/decisions]
```

A level 0 folder has no root file, so it names no corpora, and no corpus can name it.

### Sources

- `extends` and `references` are each a mapping. Each key is a prefix: lowercase letters, digits
  and `-`. Each value is a source, a string.
- A prefix cannot be in both keys. One corpus can sit under two prefixes, one in each key, to give
  both its types and its records. It is still one corpus.
- A source that starts with `./` or `../` is a path from the corpus root. Any other source is a
  package name.
- A package is found the way Node.js finds one from the corpus folder. Its corpus is the package
  folder, or the folder that a `"corpus"` field in its `package.json` names.
- The source must resolve to a folder that holds a root file. Otherwise it is an error.
- Named corpora load transitively. Each one's own `extends` and `references` resolve from its own
  folder. A cycle, in any mix of the two keys, is an error. So two corpora cannot reference each
  other.
- A folder reached twice, through two prefixes or two paths, is one corpus.
- Each named corpus is checked by its own rules. Its errors are errors of the corpus that names it.
- `package.json` holds each package's range and the lockfile pins it. A private corpus with no
  registry can be a git dependency: `"acme-org-principles": "github:acme/org-principles#v3"`.
- An update arrives only when the project changes its dependency and reinstalls.

### Namespace

One rule says which types a corpus can name:

- A local type is `<type>`.
- A parent's type is `<prefix>/<type>`.
- A type of a referenced corpus is `<prefix>/<type>`, extended by each further reference.
  `b/c/principles` is type `principles` of the corpus that `c` names in the `references` of the
  corpus that `b` names.

Every such name can be read, by `x-ref`. Only a local type and a parent's `<prefix>/<type>` can be
built on, by `x-extends` and `uses`. Each corpus's prefixes are its own. A corpus sees a
grandparent's types only by extending the grandparent too.

### Extends: types only

A corpus gets a parent's types through `extends`. An inherited type is read-only. The corpus uses
it through a local type folder: one with a schema that names it in `x-extends`, or one that `uses`
names.

- A parent's records are not the corpus's. A local record can share an id with a parent's record.
- A link into a parent is an error. `_references/` holds only referenced corpora.

### A profile is a corpus with only types

A profile is a parent corpus that holds types and no records. So `extends` covers profiles, and
there is one mechanism. `extends` takes the place of the reserved `profiles` key, which stays
unused.

### Type inheritance

A type builds on another type with `x-extends` at the root of its schema. The value is a local
type, or `<prefix>/<type>` for a type in a parent corpus. A type of a referenced corpus is an error.

- The fields add up first: the ancestors' root-level `properties` and `patternProperties`, then the
  type's own. A field declared in `allOf` or a `$ref` does not count. A closing
  `additionalProperties: false` or `unevaluatedProperties: false` on the type applies to that
  merged set, so a closed child sees its parents' fields without listing them.
- A record must pass the type's schema and every ancestor's, each with its fields merged this way.
- A child type can add fields and tighten rules, never loosen them. A field it declares again must
  still pass the parent's rules for it. A parent with `additionalProperties: false` admits no new
  fields, and a child that declares one gets an error at that field.
- An `x-ref` to a type accepts records of the types that extend it, local or inherited.
- A type has one parent.
- A schema that holds only `x-extends` uses the parent's type as it is, under a new name.
- A prefix that `extends` does not declare, a name that matches no type, and a loop in the chain
  are errors.

### Uses

`uses` gives local folders a parent's type with no schema file of their own. Its value is one entry
or a list. Each entry is `<prefix>/<type>`, or `<prefix>/*` for every type of the parent.

```yaml
extends:
  sdlc: "@osdlc/corpus-profile-sdlc"
uses: [sdlc/tasks, sdlc/decisions]
```

- A folder named after a used type, with no schema file, holds records of the parent's type as it
  is. Its files are records, as in Records.
- A folder named after a used type that also holds a schema file is an error. To add fields, take
  the type out of `uses` and write `x-extends` in the schema.
- Two used types with the same name, such as `sdlc/tasks` and `other/tasks`, are an error, and
  neither is used. Build the folder's type with `x-extends` instead.
- A used type with no folder of its name is fine. The corpus has no records of it yet.
- An entry that names no parent, a prefix in `references` rather than `extends`, or a type the
  parent does not have, is an error.
- A folder with no schema file that `uses` does not name stays a plain folder. If it holds record
  files and its name is a parent type's name or close to it, the validator warns, since a typo or a
  missing `uses` entry leaves records unchecked.

### References and the copy

A referenced corpus's records stay its own. A link, an `x-ref` link, or a reference by id or
wikilink can point at them. Its types are visible by the Namespace rule, for reading. Its own
references are reachable too: `b/c/principles`.

Referenced records live in another package or folder, not in the project's folder. So Obsidian and
GitHub have no file to follow a link to. `corpus-schema sync` writes a read-only copy of each
referenced corpus into `_references/<prefix>/`, and the project commits it. A local record then
links to `../_references/org/principles/Be%20Kind.md`, and the link works everywhere. `extends`
gets no copy.

- The copy holds every file of the referenced corpus, byte for byte, and its own `_references/`.
  So transitive references sit nested: `_references/b/_references/c/`.
- The validator finds no types, records or nested corpora in `_references/`, and does not check
  its links.
- A link from a checked file to `_references/<prefix>/<path>` is a link to `<path>` in that
  corpus. It resolves in the installed corpus, not in the copy.
- When the copy exists, or a checked file links into it, it must match the installed corpus. The
  validator reports each file that differs, is missing or is extra, and says to run
  `corpus-schema sync`.
- A link into `_references/<prefix>/` where `<prefix>` is in `extends` is an error. A parent gives
  types only.
- A folder or file directly in `_references/` that names no reference is an error.
- A copy is needed only by a link into it: a link or wikilink from a checked file, or a `wikilink`
  reference to the corpus's record. A corpus that references another and has no such link needs no
  copy.

### Identity

Every corpus, type and record has an identity, so that copies reached through two chains, and the
results of queries, builds and exports, can be told apart or merged. Identity uses package URLs
([purl](https://github.com/package-url/purl-spec)).

| Identity | Form                                                    | Example                                                        |
| -------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Corpus   | `pkg:npm/%40scope/name`, with `@version` when versioned | `pkg:npm/%40osdlc/corpus-profile-sdlc@0.3.0`                   |
| Type     | The corpus identity plus `#<type>`                      | `pkg:npm/%40osdlc/corpus-profile-sdlc#tasks`                   |
| Record   | The corpus identity plus `#<type>/<id>`                 | `pkg:npm/%40osdlc/corpus-sdlc-starter@0.1.0#principles/P-0002` |

- A corpus is a package when the nearest `package.json` at or above its folder has a `name`, and
  that file's `"corpus"` field, or its own folder when it has none, is the corpus folder. The purl
  uses that `name`. It does not depend on how the corpus is reached: a package source, an npm
  alias and a `./` or `../` path to the same folder give the same identity. A corpus in no package
  has a local identity only and no purl.
- Two records with the same identity are one record. A reference by id that finds one record
  through two chains is not ambiguous. It resolves to the copy reached through the shortest chain,
  so a direct reference wins. Two records with different identities are two matches, even with the
  same id.
- Across the whole graph of a corpus, each corpus identity appears at exactly one version. A second
  version is an error that names both versions and the chain of prefixes that brings in each.
- A tool that reports, queries, builds or exports records gives each corpus's identity and version
  with its results.
- A schema can state its type's identity in `x-identity` at its root. It must be the unversioned
  type identity, such as `pkg:npm/%40osdlc/corpus-profile-sdlc#tasks`. Anything else is an error.
  `$id` cannot hold it, because JSON Schema forbids a fragment in `$id`. In a corpus with no purl
  there is nothing to match, and the validator warns that it does not check it.
- A corpus package should list the corpora it extends or references as `peerDependencies`, with a
  range, not as `dependencies`. The project that installs it then holds one version of each, which
  the one-version rule needs.

### Explicit blending (proposed)

A local record would relate to a referenced one on purpose, in one of three ways. `x-ref` works
today. `refines` and `waives` are proposed.

| How       | It means                                                         |
| --------- | ---------------------------------------------------------------- |
| `x-ref`   | The local record cites the referenced one.                       |
| `refines` | The local record is a narrower, local version of it.             |
| `waives`  | The referenced record does not apply here. A reason is required. |

Today a local record that has the same id as a referenced record is not an error, since they have
different identities. A reference by id that could match both is ambiguous, and is an error.

### Example: org principles

The org keeps a principles corpus, with a `principles` type. A project references it to link to its
principles, and builds on the types of a shared profile:

```yaml
# project/corpus-schema.yaml
corpus-schema: 0
level: 2
extends:
  sdlc: "@osdlc/corpus-profile-sdlc"
references:
  org: "acme-org-principles" # in package.json: "github:acme/org-principles#v3"
```

A project type can then use `x-ref: org/principles` on a field, and its records link to
`_references/org/principles/Be%20Kind.md`. When the org changes a principle, the project sees the
change only after it moves its pin and runs `corpus-schema sync`.

Under the proposal, the project would refine one principle that needs a stricter local form, and
waive one that does not apply, with a reason. A reviewer could then read the project's corpus and
see which principles hold, which were narrowed, and which were set aside and why. The exact shape
of a `refines` or `waives` record is not designed yet. In the plan, refine and waive come next,
then a real org principles corpus.

## Why we decided what we did

One short entry per decision. Each gives the other options we looked at and the reason. Where the
record of a decision gives no reason, the entry says what the choice allows. Decisions marked
"proposed" are not settled.

### The name corpus-schema

Others considered: markdown-db (the first name), corpus-spec, corpora-spec, markdown-corpus,
markdown-records.

The name says what the spec adds on top of a corpus: its types and their schemas. markdown-db sat
close to MarkdownDB (`mddb`), the npm package `markdown-db` and `@synstack/markdown-db`, and it
suggested a database, which this is not. corpus-spec and corpora-spec named the document more than
the tool, and the plural was easy to mistype. markdown-corpus was already the name of our Rust
crate that models any corpus. markdown-records fit only the levels that have records.
`corpus-schema` was free on both npm and crates.io, so a later Rust implementation can use the
same name. The decision is
[D-01](https://github.com/osdlc/osdlc/blob/main/packages/ts/corpus-schema/docs/planning/decisions/D-01-name.md).

### "Corpus" as the word for a folder of notes

Others considered: vault, which some of our package names still use.

osdlc already used "corpus" for any folder of Markdown notes and the files they link to. Keeping
it avoids a second word for the same thing, and having two words for one idea is one of the
problems the plan sets out to fix. Vault names in our packages move to corpus over time. Inside the
spec, "corpus" alone means a corpus that holds a root file. Everywhere else it keeps the general
meaning.

### JSON Schema 2020-12, not a type language of our own

Others considered: Zod schemas or Rust types in code, and dev's model-schema packs, which are YAML
that compiles to JSON Schema.

The folder must be pure data, with every rule written in the corpus or in the spec, never only in
code. JSON Schema is a written, language-neutral format, so a validator in any language checks a
corpus the same way. Editors and other JSON Schema tools can read the `.json` and `.yaml` schema
files. Profiles are plain JSON Schema too, with `x-extends` between types (D4 in the plan). Packs
can compile to JSON Schema later.

### Relative links, not wikilinks, in the baseline

Others considered: two-segment wikilinks such as `[[harnesses/X]]`, or allowing both with neither
canonical.

We tested this in Obsidian 1.12.7. When we moved a corpus that used wikilinks, Obsidian rewrote the
corpus's own links to vault paths, such as `[[Archive/2026/harness-reference/harnesses/Claude Code]]`.
The corpus no longer worked anywhere else. With relative Markdown links, the corpus's files did not
change at all. GitHub follows relative links, and so do Docusaurus, VitePress and MkDocs. None of
them follows wikilinks without a plugin. This is what lets a corpus be dropped into a larger vault
and keep working. The cost is `%20` for spaces and quoted strings for links in frontmatter.

Two smaller choices go with it. The validator checks paths literally, with no fallback to matching
by name, because that catches the broken path that Obsidian hides and a published site would show
as dead. And `--fix` rewrites wikilinks, so people can paste wikilinks in Obsidian and the corpus
still ends up with one form.

### Levels

Others considered: requiring a schema for every type from the start.

A type folder without a schema is still useful. Its ids, formats and links are checked, and adding
a schema later turns on field checks. Level 0 means any notes folder already conforms, so a corpus
can start where it is. `level: 2` lets a corpus that wants the strict form say so and be held to it.

### Profiles separate from levels, not a level 3

Others considered: making shared types a level above 2.

A level says how much a corpus declares. A profile says whose types it uses. Those are different
questions, so they are different settings. A level-2 corpus can use the claims profile, another
profile and its own types at once, which a single level number could not say.

### "Profile", not "pack"

Others considered: pack, the word dev's model-schema uses.

Profile is the usual word in data standards: FHIR profiles, Dublin Core application profiles, the
W3C Profiles Vocabulary, the `profile` link relation in RFC 6906, and GA4GH VA-Spec profiles. In
dev, "pack" already means plugin bundles. Whether model-schema switches its word is an open question
in [sksizer/dev#4069](https://github.com/sksizer/dev/pull/4069).

### Record folders in v0

Others considered: waiting until the first experiment needed them.

The evidence work needs them now. A test run keeps its script, its query and its CSV results
together, and without record folders a `result.json` beside a Markdown record is an error in a
Markdown-only corpus. So record folders are part of level 1 and ship in the first release.

The shape follows rules we already had. A type is a folder holding `<folder>.schema.*`, and a record
folder is a folder holding `<folder>.*`. It is also the bundle shape osdlc already uses, and
Obsidian's folder-note pattern. A folder with no record file stays a plain folder, as it was before,
because a warning for "a folder with files but no record" would also fire on ordinary folders of
attachments.

### A record file makes a record folder whatever `formats` says

The records of the decision give no separate reason. What the rule allows: whether a folder is a
record folder depends only on its file names, not on the root file's settings. A record file in a
format the corpus does not allow gives one error, on that file. Its sibling files stay the record's
own and are not read as records, so one mistake does not turn into a list of schema errors.

### Ids come from the file name, cut by `x-id-pattern`

Others considered: a frontmatter `id` as the source of the id. The chosen rule keeps the file name
as the source, so a record is found by its name in a file list and in Obsidian. With a pattern,
the id is the longest whole name or leading part (cut before a `-`) that the patterns match, so
`P-0002-favor-deterministic.md` has the id `P-0002`. It also keeps old corpora valid: a name the
pattern matches whole keeps its whole name as its id. A frontmatter `id` is allowed, but it must
equal the id from the name.

### `x-record-file` declares the record file of a record folder

Others considered: always accepting `README.md` as a record file. Declaring it keeps the default
record folder shape, `<folder>/<folder>.md`, and lets each type opt in. A type that wants
`README.md` says so, and a `README.md` elsewhere stays narrative. Types that `uses` or build on a
parent type inherit the setting, so one declaration covers the chain.

### Folders that start with `_` hold narrative

Others considered: treating any folder with no record file as narrative. That would break plain
folders of records such as `harnesses/google/`, which have no record file of their own and hold
records. A leading `_` marks the folder as narrative on purpose, in the name, where a reader sees it.

### Each schema stands alone

The records of the decision give no separate reason. What the rule allows: a type folder carries
all of its own rules, so you can copy it into another corpus and it arrives complete. Two types can
share a `$id` without clashing. Sharing types on purpose is the job of `extends`, `x-extends` and `uses`.

### No database or query layer in the spec

Others considered: a loader and a JSON build in the spec, and the name markdown-db.

The spec is a format and a validator. Reading a corpus as a database is its own layer, which will
read the corpus model and corpus-schema. We keep the word "db" for that layer, and what it covers
is still open in the plan (D5). This is also why the spec is no longer called markdown-db: the name
suggested a database.

### The VA-Spec claims model, and the name "claims"

Others considered: assurance-case standards (ISO/IEC/IEEE 15026-2, OMG SACM and GSN, which name the
parts claim, argument and evidence), OASIS OSLC Quality Management for tests and results, and
keeping our own type names.

VA-Spec is GA4GH's Variant Annotation spec. It is a JSON Schema model for claims backed by evidence:
Statement, Evidence Line, Study Result, Method, Document and Contribution. None of the other
standards has a JSON Schema for the whole chain. Their words feed later name overrides and an
acceptance-testing profile. We take VA-Spec's model, type names and field names, with one change:
study results have no `focus` field. What a study result is about comes from the statements that
cite it, because one observation can support statements about several things.

The profile is called claims. "Claims" is the plain word for statements backed by evidence. It does
not clash with a type name, as "evidence" would. "va-spec" would read as genomics to anyone outside
that field.

### The JSON and SQLite build comes later

Others considered: building a JSON or SQLite copy of the records as part of the first release.

The evidence work does not need it to start. It needs the format, record folders and a published
validator. A database built from the records belongs to the query layer, and the query layer builds
on a shared corpus model that does not exist in TypeScript yet. So the build waits for both.

### The version line, 0.x

Others considered: a 1.0 release.

The version line is
[D-02](https://github.com/osdlc/osdlc/blob/main/packages/ts/corpus-schema/docs/planning/decisions/D-02-version-line-and-stability.md),
which is still proposed and waits for the owner's sign-off. The package and the spec are new, so a
1.0 promise would come too early. The first version on npm is `0.2.0`, and every export is stable within
0.x. A minor release may change any export, and the changelog marks the change as breaking. A patch
release does not. The `<file>: <field>` part of a problem line is part of the contract, as the spec
fixes it. The message text is not.

### `extends`, `references` and `uses` are separate keys

Others considered: one key that brings in a parent's types and records together, as OWL's
`owl:imports` does. `peers` and `mounts` as names for the records key.

The two jobs differ. Building on a parent's types changes how a corpus's own records are checked.
Linking to another corpus's records changes nothing about how they are checked, and the records stay
their own. With one key, a local record could silently share an id with a parent's record, and a
reader could not tell what was inherited. With two keys, `extends` gives types only, `references`
gives records to link to, and a record is never merged into another. `uses` is the plain way to take
a parent's type as it is, with no new schema. The spec's section
"Prior art and terms: other corpora" compares DITA, Sphinx, Antora, Hugo, OWL and AsciiDoc, and says
why each word was chosen.

### Referenced records are copied into `_references/`

Others considered: resolving links into the installed package only.

A referenced corpus lives in another package or folder, so Obsidian and GitHub have no file to
follow a link to. A committed read-only copy gives them one, like a Hugo module mount kept as
files. The validator checks that the copy matches the installed corpus, so it cannot quietly go
stale. A parent's types need no copy, so `extends` has none.

### Identity uses package URLs

Others considered: a plain URL, and a new URN scheme.

A plain URL names where a corpus is fetched from, which changes with mirrors and checkouts, not what
it is. A new URN scheme would need its own registry and tools. A purl already names npm and git
packages, has a written spec and libraries in many languages, and its subpath fits a type and a
record. Identity lets two records reached through different chains be told apart or merged, and it
lets the validator require one version of each corpus across the graph. `x-identity` carries the
type identity because JSON Schema forbids a fragment in `$id`.

### A profile is a types-only corpus

Others considered: profiles as their own thing, under their own `profiles:` key, beside a separate
mechanism for other corpora.

A profile is a parent corpus that happens to hold no records. Treating it that way gives one
mechanism, `extends:`, with one set of rules for sources, prefixes and type inheritance.

### Corpora travel as npm packages, pinned by the lockfile

Others considered: following a corpus's latest version, and a pin written in the root file, such
as `github:acme/org-corpus@4f2a9c1`.

A corpus named by `extends` or `references` is an npm package or a local folder. npm or pnpm
installs it, `package.json` holds the range, and the lockfile pins it. Git dependencies cover
private corpora with no registry. A corpus package lists the corpora it names as `peerDependencies`,
so the project that installs it holds one version of each. The spec stays independent of npm: it
says only that each source resolves to a folder holding a corpus. What a pin allows: a project's
validation result does not change when someone edits the org corpus. An update arrives as a
dependency change that a person makes and can review. And `sync` has a fixed installed version to
compare its copy against.

### Smaller choices from the first design review

- The root file has a fixed name, so a tool finds every corpus in a vault by name alone, without
  reading files, as `.git` marks a repository. The `.md` form doubles as the corpus's front page in
  Obsidian. We considered `index.md` with a key in its frontmatter, but then a tool must read every
  `index.md` to find corpora.
- A corpus's name is its folder name, not a `name` key, because a path to the corpus already names
  it and Obsidian resolves such paths by suffix. The optional `id` covers apps that must find a
  corpus after it moves.
- Ids are display names such as `Claude Code`, not slugs, so files read well in Finder, on GitHub
  and in Obsidian. A type that wants slugs says so with `x-id-pattern`.
- corpus-schema is its own spec, and it borrows several rules from
  [mdbase](https://github.com/mdbase-dev/mdbase-spec) with credit. It does not adopt mdbase whole,
  because mdbase keeps types in `_types/` notes and resolves links from each collection's root.

## What v0 does not do yet

SPEC.md's Deferred section lists what v0 leaves out. Here it is with what the plan says about each
item. The task numbers are the plan's [task records](planning/README.md).

| Not in v0                                                             | Where it stands                                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Links between corpora, other than into a referenced corpus's copy     | Links into `_references/` work through `references:` and `sync`. Others are not in the plan. |
| Refining or waiving a referenced record                               | A task in the plan: `refines` and `waives`.                                                  |
| Inclusion and transclusion of another corpus's content                | Out of scope. Not in the plan.                                                               |
| Two corpora that reference each other                                 | A cycle is an error in v0. Not in the plan.                                                  |
| A type that extends more than one type, and renaming a type or prefix | Deferred. Not in the plan.                                                                   |
| Wikilinks into a copy's own `_references/`                            | Deferred. Not in the plan.                                                                   |
| Dialects                                                              | Proposed: the baseline plus named dialects, `obsidian` first.                                |
| A schema rule that warns instead of failing (`x-warn`)                | A task in the plan, after the first release.                                                 |
| `x-ref` inside nested objects                                         | Needed for evidence lines inside a statement. Not yet a task in the plan.                    |
| Build targets: JSON, SQLite, Astro, Nuxt, Obsidian Bases views        | The JSON and SQLite build is a task after the query layer. The others have no task.          |
| A query layer                                                         | A task in the plan, on top of the shared corpus model.                                       |
| Checking a level-0 folder                                             | Not in the plan. The validator finds corpora by their root file.                             |
| Schema versions and migrations                                        | Deferred. Not in the plan.                                                                   |
| Concurrent edits beyond last-writer-wins                              | Deferred. Not in the plan.                                                                   |
| Obsidian's vault-wide property types, which clash across corpora      | Deferred. Not in the plan.                                                                   |
| Reserved names, such as Windows device names                          | Deferred. Not in the plan.                                                                   |
| Stable error codes                                                    | Deferred. Not in the plan.                                                                   |
| `move` and `rename` verbs that rewrite every link to a record         | Deferred. Not in the plan.                                                                   |
| A Rust validator                                                      | The architecture says it comes later and runs the same cases. No task yet.                   |

## The plan for the spec

The full plan is in [ecosystem-plan.md](ecosystem-plan.md), under review in
[osdlc/markdown#4](https://github.com/osdlc/markdown/pull/4). This is the part that concerns the
spec. The plan numbers each task, and the numbers still change while the plan is edited, so this
section describes tasks by what they do.

Where it lives. The spec, its conformance cases and the TypeScript package are in this repository,
osdlc/markdown, in `packages/conformance/corpus-schema/` and `packages/ts/corpus-schema/`. The rename from
markdown-db and the levels came in [osdlc/osdlc#725](https://github.com/osdlc/osdlc/pull/725), and
record folders in [osdlc/osdlc#729](https://github.com/osdlc/osdlc/pull/729). The release pull
request, [osdlc/osdlc#726](https://github.com/osdlc/osdlc/pull/726), cut 0.1.0, but it was never
published. Record folders landed as a second minor bump, so the first version on npm is 0.2.0, from
[osdlc/osdlc#733](https://github.com/osdlc/osdlc/pull/733). They then moved here, in
[osdlc/markdown#9](https://github.com/osdlc/markdown/pull/9). The npm name stayed the same.

The evidence work comes first:

- An example claims corpus in this repo, at `profiles/claims/example/`. It is a valid level-2
  corpus with the VA-Spec types `documents`, `study-results`, `methods` and `statements`, and a few
  records that show the whole chain. A README maps each type to VA-Spec. CI checks it with the
  published validator, and people copy it with
  `npx degit osdlc/markdown/profiles/claims/example <dir>`. It is in progress in a separate pull
  request.
- harness-reference copies those types, switches to the npm package and renames its root file to
  `corpus-schema.md`. Its capture command then writes study results.
- The evidence project keeps its records in the same format, checked by the validator.

Then the spec grows:

- `x-warn`: a schema can mark a rule as a warning instead of an error.
- The Obsidian dialect.
- Profiles: the validator reads `extends:`, `uses:` and `x-extends`. Next the claims types ship as a
  versioned npm package, `@osdlc/corpus-profile-claims`, and corpora name it instead of holding
  copies. Name overrides and an acceptance-testing profile build on it.
- `extends`, `references`, `uses`, identity and `corpus-schema sync` are built. Next come `refines`
  and `waives`, then a real org principles corpus as the first case.
- `validate --strict`, flattened `x-extends`, references by id (`x-ref-form`) and `x-ref` lists of
  types are built, for the 0.3.0 release.

And the code under it changes:

- TypeScript markdown-link learns to resolve links the same way the Rust crate does. One shared
  TypeScript corpus model follows, called markdown-corpus like its Rust twin.
- The validator reads that corpus model instead of walking the folder itself.
- One query layer is built on the corpus model, and the JSON and SQLite build comes after it.
- A Rust validator comes later. It will run the same conformance cases, which name no code for that
  reason.

## FAQ

### Does my Obsidian vault work?

Your vault is already a corpus at level 0, so in that sense it conforms with no changes. The
validator does not check level 0, though. To check part of a vault, put a root file in a folder,
such as `Data/reading-list/corpus-schema.md`, and add type folders under it. The spec suggests one
top-level `Data/` folder with one corpus per app or dataset.

Obsidian keeps working on the files. `.obsidian/` is skipped, because paths that start with a dot
are not part of a corpus. Wikilinks are accepted with a warning, and `validate --fix` rewrites them.
To make Obsidian write relative links in the first place, turn off "Use [[Wikilinks]]" and set "New
link format" to "Relative path to file" in its Files and links settings. In our tests Obsidian
updated body links when a record moved, but once missed a link in frontmatter, so run `validate`
after you move records. If two corpora in one vault give the same property different types,
Obsidian's vault-wide property types clash. v0 does not handle that yet.

### Is this a database?

No. It is a format and a validator. It checks a folder the way a database checks its rows, but it
has no queries, no index and no handling of concurrent writers. In v0 the last writer wins. Do not
use it as the database for an app with many writers. A query layer that reads corpora is planned as
a separate piece.

### How is it different from Astro content collections, MarkdownDB, Contentlayer or Obsidian Bases?

- [mdbase](https://github.com/mdbase-dev/mdbase-spec) is the closest. It also types Markdown records
  and validates them, and we borrow several of its rules. It declares types in type notes under
  `_types/` and resolves links from each collection's root. corpus-schema puts each type's schema in
  the type's own folder and uses relative links, which GitHub and site generators follow.
- MarkdownDB (`mddb`) parses a folder of Markdown into a SQL database for queries. It does not check
  records against schema files in the folder.
- `@synstack/markdown-db` uses Markdown files with frontmatter as a database from TypeScript code. It
  has no written spec for the folder.
- Astro content collections define each collection's schema in the site's code, with Zod. In our
  tests with Astro 7.4.5, it enforced our schema only after we converted it to Zod, and relative
  links needed some glue code. corpus-schema keeps the schema in the folder as JSON Schema, so it
  does not depend on one site generator. An Astro build target is deferred.
- Contentlayer also defines document types in code, in a site's config file. We have not tested it.
  The difference is the same as with Astro: there the rules live in the site's code, here they live
  in the folder.
- Obsidian Bases shows notes as tables and views inside Obsidian, filtered by their properties. It
  is a way to look at notes, not a check on them. The two fit together: a Bases view of a corpus is
  one of the deferred build targets.

In our own packages, the Rust crate `markdown-corpus` models any corpus (its files, links and
frontmatter) but does not apply the corpus-schema rules, and `@osdlc/markdown-contract` checks the
structure of one document.

### Can I use YAML or JSON instead of Markdown?

Yes. List the formats in the root file, such as `formats: [md, yaml, json]`. The default is `[md]`.
YAML and JSON records hold data only, with no body. They can sit beside Markdown records, even in
one type, and ids are unique across all three. Use `.yaml`, not `.yml`. Schema files and the root
file can be `.md`, `.yaml` or `.json` whatever `formats` says.

### Why can't I nest record folders?

The spec forbids it, and the inner folder's files then belong to the outer record. The record of
the decision gives no separate reason. What the rule gives you: every file under a record folder
belongs to exactly one record, the outer one. If a record has parts that are records in their own
right, make them records of another type and link to them with `x-ref`. A plain folder of records,
one with no record file, can be nested as deep as you like.

### What happens to wikilinks?

They are accepted. A wikilink resolves by path suffix inside the corpus, and each one that resolves
gets a warning. A wikilink with no match, or more than one, is an error. A wikilink with no `/`
that matches no file can name a record by id, such as `[[P-0002]]`. Obsidian does not resolve it,
and `--fix` rewrites it as a relative link. `validate --fix` rewrites
each one that resolves as a relative Markdown link. In frontmatter, quote it: `series: "[[Dune]]"`.
The proposed `obsidian` dialect would make wikilinks normal, with no warning.

### How do I share types between corpora?

Extend a corpus that holds them. Name it under `extends:`, then build local types on its types with
`x-extends`. A schema that holds only `x-extends: <prefix>/<type>` uses the type as it is, under a
new name. To keep records of a parent's type with no schema file, name the type under `uses:` and
make a folder of that name.

You can also copy the type folders. A type folder holds its own schema, so it arrives complete. A
`$ref` from one type's schema to another type's schema does not resolve, so each copy must stand
alone. Copies can drift apart. For the claims types, the example corpus in this repo is meant to be
copied with `npx degit` until the claims profile is published as a package.

### Is there a Rust version?

Not yet. The architecture says a Rust validator comes later and runs the same conformance cases.
Those cases name no code, so any language can run them. The name `corpus-schema` is free on
crates.io for it. The Rust crate `markdown-corpus` reads any corpus, but it does not apply these
rules.

### How stable is v0, and what does `corpus-schema: 0` promise?

`corpus-schema: 0` says the corpus follows version 0 of the spec. A tool must refuse a corpus whose
version it does not support, so a tool never checks your corpus by rules it does not know.

Version 0 is young. We rewrite it in place while it is at version 0, so a rule can still change.
The spec fixes the `<file>: <field>` part of each problem line. The message text is not fixed, and
error codes are not defined yet. For the package, D-02 proposes that a change to what is reported
comes in a minor release, marked as breaking in the changelog. D-02 still waits for the owner's
sign-off. New root keys get a warning from a validator that does not
know them, not an error, so adding a key does not break older validators.

### How do I check a corpus in CI?

Run the validator on the folder and let the exit code fail the job. It needs Node.js 22 or later.

```sh
npx @osdlc/corpus-schema validate corpora/
```

In GitHub Actions:

```yaml
jobs:
  corpus:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx --yes @osdlc/corpus-schema@0.2 validate corpora/
```

Version 0.2.0 is on npm. For the current usage, check the
[package README](../packages/ts/corpus-schema/README.md). A
corpus's schemas run on its data, and a badly written `pattern` or `x-id-pattern` can take a very
long time on some input. So validate a corpus you do not trust only with a time limit, such as the
`timeout-minutes` above. Leave `--fix` out of CI checks: it rewrites files in place.

### How do org principles reach my project?

The project's root file names the org corpus under `references:`, as a package or a relative path
(see [Sharing across corpora](#sharing-across-corpora)). A field can then use `x-ref: org/principles`
to point at an org principle by link, id or wikilink. To link to the org's records from notes, run
`corpus-schema sync` and commit the copy in `_references/org/`. If the project also wants the org's
types, it names the org corpus under `extends:` too, under its own prefix.

### Can I override an org record?

A local record does not replace an org record. The org's records stay the org's. A local record can
have the same id as an org record, since they have different identities, but a reference by id that
could match both is an error. You can cite the org record with `x-ref`. Under the proposal, a local
record could also say `refines`, to be a local, narrower version of the org record, or `waives`,
with a reason, when an org record does not apply.

### Why can't Obsidian see referenced records without sync?

Referenced records live in another package or folder, pinned to a version. They are not files in
your folder, so Obsidian and GitHub have nothing to open when you follow a link to one.
`corpus-schema sync` writes a read-only copy into `_references/<prefix>/`, so the links have real
files to point at. The validator checks that the copy matches the installed corpus, so it cannot
quietly go stale.

## Words used

| Word            | Meaning                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| corpus          | A folder of notes and the files they link to. In the spec, a corpus is a folder that holds a root file, with everything under it.  |
| root file       | `corpus-schema.md`, `.yaml` or `.json`. It marks a folder as a corpus and holds its settings.                                      |
| type            | A folder that holds a schema file named after the folder. The type's name is the folder name.                                      |
| record          | One `.md`, `.yaml` or `.json` file of a type. Its data is checked against the type's schema.                                       |
| id              | A record's name without its extension, such as `Claude Code`, cut by `x-id-pattern` if the type has one. Unique within its type.   |
| record folder   | A folder in a type folder that holds a record file, named after the folder or by `x-record-file`. The record owns the other files. |
| narrative       | Every other file in a corpus: READMEs, guides, attachments. The validator ignores it.                                              |
| level           | How much a corpus declares. 0 is any folder of linked notes, 1 adds the root file and types, 2 gives every type a schema.          |
| dialect         | A named flavor of note syntax on top of the baseline, such as `obsidian`. Reserved in v0.                                          |
| profile         | A shared, versioned set of types that many corpora can use: a parent corpus with only types, named under `extends`.                |
| `extends`       | The root-file key that names parent corpora and profiles by prefix. A parent gives types only.                                     |
| `references`    | The root-file key that names corpora whose records the corpus links to, by prefix.                                                 |
| `uses`          | The root-file key that names parent types which local folders hold as they are, with no schema file.                               |
| `_references/`  | The folder where `corpus-schema sync` keeps a read-only copy of each referenced corpus.                                            |
| identity        | A package URL (purl) for a corpus, a type or a record, such as `pkg:npm/%40osdlc/corpus-profile-sdlc#tasks`.                       |
| `x-ref`         | A schema keyword that makes a field a typed link to a record of a named type, like a foreign key.                                  |
| `x-id-pattern`  | A schema keyword with a regular expression that every id in the type must match.                                                   |
| `x-record-file` | A schema keyword that names the record file of the type's record folders, such as `README.md`.                                     |
| `x-extends`     | A schema keyword that makes a type build on another type, local or from a parent corpus.                                           |
| `x-identity`    | A schema keyword that states the type's unversioned identity.                                                                      |
