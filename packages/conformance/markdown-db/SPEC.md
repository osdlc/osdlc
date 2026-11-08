# markdown-db, version 0

**Status: in force, version 0.** Accepted 2026-11-05. It is rewritten in place while it is at
version 0. [Design review](../../../docs/parley/markdown-db-v0.json). The spec lives in osdlc
while it is young, beside its [conformance cases](README.md), and moves to a repository of its own
once it is stable.

## Purpose

markdown-db keeps typed records as files in a folder that people browse and edit as plain notes,
and tools validate. The folder is pure data. Every rule a tool enforces is written in this spec
or in the corpus's own files, never only in code. Code is one implementation of it; the reference
validator is the [`@osdlc/markdown-db`](../../ts/markdown-db/README.md) package.

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## Rule

### Terms

- **Corpus**: a folder holding a root file, and everything under it.
- **Root file**: `markdown-db.md`, `markdown-db.yaml` or `markdown-db.json`. The name matches
  exactly, case included, so a corpus is the same on every file system.
- **Type**: a folder holding a schema file named after the folder.
- **Record**: one file of a type. Its id is its file name.
- **Narrative**: every other file in a corpus.

In the rest of osdlc a [corpus](../../../docs/terms/corpus.md) is any folder of linked notes. The
corpus here is a [markdown-db corpus](../../../docs/terms/markdown-db-corpus.md): one of those that
holds a root file.

### Corpus

- A corpus is a folder holding a root file. A folder MUST NOT hold more than one root file.
- The corpus's name is its folder name. Renaming the folder renames the corpus, as renaming a
  package does. A name taken from the folder needs no lookup: a path to the corpus already names
  it, and Obsidian resolves such paths by suffix.
- A corpus holds every file under its folder, except:
  - any path with a component that starts with `.` (`.git/`, `.obsidian/`, `.DS_Store`);
  - any path with a component named `node_modules`;
  - a symbolic link, to a file or to a folder. A tool does not follow it, so a link to it does not
    resolve. A validator SHOULD warn on a symbolic link in a type folder, since a record there is
    not checked;
  - a folder holding its own root file. That folder is a separate corpus, and the outer corpus
    stops at it.
- A corpus MUST NOT sit inside a type folder.

The root file has a fixed name so that a tool finds every corpus in a vault by name alone, without
reading files. It works like `.git` for a repository or `package.json` for a package.

### Root file

In `markdown-db.md` the data is the YAML frontmatter, and the body is the corpus's front page. The
body MAY be empty. In `markdown-db.yaml` and `markdown-db.json` the whole file is the data. The data
MUST be a mapping.

| Key           | Required | Holds                                                             |
| ------------- | -------- | ----------------------------------------------------------------- |
| `markdown-db` | yes      | The spec version: `0` for this document.                          |
| `id`          | no       | A stable handle for the corpus, such as `reading-list` or a UUID. |
| `formats`     | no       | The record formats the corpus allows. Default `[md]`.             |

- A tool MUST refuse a corpus whose `markdown-db` version it does not support.
- `id` lets an app find its corpus after a user moves or renames the folder: the app scans for root
  files and picks the one with its id. Links never use `id`. A tool that sees two corpora with one
  `id` SHOULD warn.
- A validator SHOULD warn on any other key. Later versions add keys.

### Formats

`formats` lists the record formats a corpus allows, from this table. `[md]` keeps every record a
note, browsable in Obsidian. `[md, yaml, json]` is a hybrid corpus: data-only records may sit beside
notes, even in one type.

| Format | Extension | The record's data                                                     |
| ------ | --------- | --------------------------------------------------------------------- |
| `md`   | `.md`     | The YAML frontmatter, fenced by `---` lines. A Markdown body follows. |
| `yaml` | `.yaml`   | The whole file, one YAML mapping.                                     |
| `json` | `.json`   | The whole file, one JSON object.                                      |

- A record in a format the corpus does not list is an error.
- A `.yml` file in a type folder is an error. The extension is `.yaml`.
- Extensions are lower case. A file in a type folder whose extension is `.md`, `.yaml`, `.json` or
  `.yml` in any other case, such as `X.MD`, is an error.

### Types

- A type is a folder holding a schema file named after the folder: `harnesses/harnesses.schema.md`,
  `.yaml` or `.json`, matched exactly, case included. A type folder MUST NOT hold more than one.
- The type's name is its folder name. Type names MUST be unique within a corpus. A type folder MAY
  sit at any depth in the corpus, but MUST NOT sit inside another type folder.
- A type folder that breaks either rule is an error, and its folder is not a type. Its schema file
  is still checked for links. Its records are not checked as its own: under another type folder
  they are that type's records, and elsewhere they are narrative.
- The schema is a JSON Schema, draft 2020-12, for a record's data. In `.md` the schema is the
  frontmatter and the body documents the type. In `.yaml` and `.json` it is the whole file.
- An empty schema (an empty file, empty frontmatter, a `.md` file with no frontmatter, or `{}`)
  makes an untyped type. Its records are not checked against a schema. Their ids, formats and links
  are.
- Renaming a type folder means renaming its schema file too.

The schema sits inside its folder so that the folder carries its own rules when it moves. It is
named after the folder so that search and Obsidian's quick switcher find it by the type's name.

### Records

- Every `.md`, `.yaml` and `.json` file under a type folder, at any depth, is a record of that type,
  except the type's schema file. Other files there are narrative, such as attachments.
- A record's type comes from its folder. A record carries no type field.
- A record's data MUST be a mapping. A `.md` record with no frontmatter has empty data. Its body MAY
  be empty.
- A record's data MUST validate against its type's schema.

### Ids

A record's id is its file name without the extension: `harnesses/Claude Code.md` has the id
`Claude Code`. An id is a human display name.

- An id MUST NOT contain `/ \ : * ? " < > |`, which some file systems refuse, or `[ ] # ^`, which
  break links. It MUST NOT contain control characters.
- An id MUST NOT start or end with a space or a dot.
- Ids MUST be unique within a type after NFC normalization and Unicode case folding, across every
  folder and every extension. `Kiro.md`, `kiro.json` and `aws/Kiro.md` collide.
- A type MAY narrow its ids with `x-id-pattern`, a regular expression at the root of its schema
  (ECMA-262 syntax, Unicode mode). Every id in the type MUST match it. `^[a-z0-9-]+$` allows only
  slugs.
- Type names follow the same rules.

### Narrative

Every file in a corpus that is not the root file, a schema file or a record is narrative: READMEs,
guides, essays, daily notes, attachments. Narrative is allowed anywhere in a corpus, and validation
ignores it.

### Links

The canonical link is a relative Markdown link: `[Claude Code](../harnesses/Claude%20Code.md)`.
Relative links keep a corpus byte-identical when it moves, and GitHub, docs generators and Obsidian
follow them. Obsidian rewrites wikilinks to vault paths when a corpus moves, so a corpus that uses
them stops working anywhere else.

- The path is relative to the file that holds the link. A space is written `%20`, or the body form
  wraps the path in `<…>`.
- In frontmatter a link is a string holding the whole link:
  `successor: "[Antigravity](Antigravity.md)"`. A bare path such as `"Antigravity.md"` is not a
  link.
- A validator checks the links in records, root files and schema files: their bodies and every
  string in their data. It skips links with a URL scheme (`https:`, `mailto:`) and links to a
  fragment only (`#usage`).
- A relative path MUST resolve, after percent-decoding, to a file or folder that exists, with the
  same case. A validator MUST NOT fall back to matching by name, as Obsidian does: a broken path is
  always an error. A fragment (`#heading`) is not checked.
- A path that starts with `/` is an error. Links in a corpus are relative.
- A link that leaves the corpus, above its root, into a nested corpus or into a path the corpus
  excludes (a `.` component or `node_modules`), is a link between corpora. v0 does not define
  those. A validator SHOULD warn and MUST NOT report an error, except for `x-ref` (see References).

Wikilinks are accepted but not canonical: `[[target]]`, `[[target|text]]`, `[[target#heading]]`
and `![[target]]`.

- A wikilink resolves by path suffix within the corpus, compared after NFC normalization and case
  folding. `[[Claude Code]]`, `[[harnesses/Claude Code]]` and `[[harnesses/Claude Code.md]]` all
  match `harnesses/Claude Code.md`. The extension of a record MAY be left out.
- No match is an error. More than one match is an error.
- A wikilink that matches no file in the corpus but matches one in a nested corpus leaves the
  corpus, and warns as a Markdown link does.
- A target that starts with `/` is an error, as in a Markdown link.
- A validator SHOULD warn on every wikilink, and SHOULD offer a fix that rewrites it as a relative
  Markdown link.

### References

`x-ref` is a schema keyword that makes a field a typed link, like a foreign key. Its value names a
type in the same corpus:

```yaml
successor: { type: string, x-ref: harnesses }
```

- On a top-level property, the property's value MUST be a link, and it MUST resolve to a record of
  the named type.
- On the `items` of a top-level array property, each item MUST be such a link.
- The named type MUST exist in the corpus.
- An `x-ref` link that leaves the corpus is an error.
- v0 defines `x-ref` only in those two places. A validator MUST report it anywhere else.

`x-ref` and `x-id-pattern` are markdown-db's vocabulary. JSON Schema validators reject unknown
keywords in strict mode, so a validator MUST register both.

### Verbs

v0 defines one verb.

- `validate <folder>` checks every corpus at or below the folder against this spec, and exits
  non-zero when it finds any error. It reports each problem on one line:
  `<file>: <field>: <message>`, with the file relative to the corpus root. A problem that is not
  in one field puts a word in parentheses in the field's place, such as `(data)` for data that
  does not parse or `(folder)` for a folder that cannot be read. A file or folder that cannot be
  read is an error of the corpus that holds it.
- `validate --fix <folder>` first rewrites every wikilink it can resolve as a relative Markdown
  link, in the files a validator checks. It changes nothing else in those files.

### Writing records

A tool that writes records changes only the keys it owns. It keeps key order, unknown keys,
comments and the body. In v0 a write replaces the whole file, and the last writer wins.

## Enforcement

[`@osdlc/markdown-db`](../../ts/markdown-db/README.md) is the reference validator. Its
`validate` command checks a folder against every rule above that a validator checks:

```sh
markdown-db validate <folder>
```

The package's tests hold it to this spec. [`suite.json`](suite.json) and the corpora under
[`corpora/`](corpora/), beside this file, are cases that name no code, so a validator in another
language can run the same ones. [S-conformance-suites](../../../docs/planning/standards/S-conformance-suites.md)
says how they are kept.

## Exemptions

None.

## Example

```text
harness-reference/
├── markdown-db.md                  the root file and front page
├── README.md                       narrative
└── harnesses/
    ├── harnesses.schema.md         type "harnesses"
    ├── Antigravity.md
    ├── Claude Code.md
    └── google/
        └── Gemini CLI.md           records may sit at any depth
```

`markdown-db.md`:

```markdown
---
markdown-db: 0
---

Facts about coding-agent harnesses. Start with [the harnesses](harnesses/harnesses.schema.md).
```

`harnesses/harnesses.schema.md`:

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

`harnesses/google/Gemini CLI.md`:

```markdown
---
vendor: Google
status: current
successor: "[Antigravity](../Antigravity.md)"
---

Google's open-source terminal agent. See also [Claude Code](../Claude%20Code.md).
```

## Placement

This section is guidance, not a rule. A corpus may sit anywhere; these are the recommended places.

- **In a vault**: one top-level `Data/` folder, with one corpus per app or dataset under it, named
  after it. This serves mini-apps: an app, such as an Obsidian plugin, a CLI or a small web app,
  keeps its database inside the user's vault, and the user still reads and edits it as notes.
- **In a code repository**: `corpora/<name>/`.
- **Keep corpora that link to each other side by side**, in one folder.
- **Don't nest** a corpus inside another corpus's type folder. The spec forbids it.

## Prior art

markdown-db is its own spec. It borrows these rules from
[mdbase](https://github.com/mdbase-dev/mdbase-spec) v0.3.0-rc (MIT), with credit:

- a nested root file starts a separate collection, and the parent stops there;
- paths with a component starting with `.`, or named `node_modules`, are not part of a collection;
- records are found at any depth, and `.md` is the default record format;
- a link resolves relative to the file that holds it;
- a link field may require its target to be of a given type;
- a writer keeps what it does not own.

It differs from mdbase in that a type is a folder holding its own schema, not a type note under
`_types/`; wikilinks resolve by unique path suffix, with no tiebreakers; whole-file YAML and JSON
records are allowed; and a bare path is not a link.

## Deferred

v0 does not define these:

- **Links between corpora**, and the `depends`, mount and distribution design behind them. Options
  seen: corpora side by side with relative links and `depends`; a wikilink that names a declared
  dependency (`[[harness-reference/harnesses/X]]`); none.
- Schema versions and migrations.
- Concurrent edits beyond last-writer-wins.
- Obsidian's vault-wide property types, which clash when two corpora give one key different types.
- `x-ref` inside nested objects.
- Reserved names, such as Windows device names.
- Stable error codes.
- `move` and `rename` verbs that rewrite every link to a record.
- Build targets, such as JSON, Astro, Nuxt and Obsidian Bases views.
