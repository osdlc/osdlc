# markdown-db, version 0

markdown-db is a way to keep typed records as Markdown files in a folder. The folder is pure data.
Code sits around it and never inside it. Every rule an implementation enforces is declared in the
data or in this spec.

## Corpus

A corpus is a folder that holds a manifest named `markdown-db.yaml`. All paths below are relative to
that folder.

## Manifest

The manifest is a YAML mapping with these keys.

| Key          | Required | Meaning                                                  |
| ------------ | -------- | -------------------------------------------------------- |
| `markdown-db` | yes      | The spec version. `0` for this document.                 |
| `types`      | yes      | A mapping from type name to a type definition.           |

A type name is lowercase letters, digits and hyphens. A type definition has these keys.

| Key      | Required | Meaning                                                         |
| -------- | -------- | --------------------------------------------------------------- |
| `path`   | yes      | The path pattern of the type's entries.                         |
| `schema` | yes      | The path of the JSON Schema file for the type's records.    |

## Paths and ids

A path pattern is a relative path with forward slashes. It MUST contain the placeholder `{id}`
exactly once, in its last segment, for example `harnesses/{id}.md`. The text before the last
segment is the type's directory. It MAY be empty.

An entry's id is the text that `{id}` matches in its path. An id MUST match
`^[a-z0-9][a-z0-9-]*$`: lowercase letters, digits and hyphens, not starting with a hyphen. The id
is not repeated in the record.

## Entry formats

The format of a type's entries follows the extension of its path pattern. A type has one pattern,
so one format. Different types MAY use different formats. Any other extension is a manifest error.

| Extension       | Format                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| `.md`           | YAML frontmatter fenced by `---` lines, then an optional Markdown body.         |
| `.yaml`, `.yml` | The whole file is one YAML mapping.                                             |
| `.json`         | The whole file is one JSON object.                                              |

The body of a `.md` entry MAY be empty. A `.md` file with no frontmatter fence is an error. The
record is the frontmatter, the YAML mapping or the JSON object. It MUST be a mapping or object.
The type of an entry comes from its path. Entries carry no `type` field.

## Validation

The record MUST validate against the type's JSON Schema, draft 2020-12. Formats such as `uri`
and `date` are checked.

## References

A schema property MAY carry the annotation `"x-ref": "<type>"`. The property's value, or each item
of it when the value is an array, MUST be the id of an existing entry of that type. The type MUST be
defined in the manifest.

## Paths rule

Every file under a type's directory MUST match that type's path pattern. A file that does not match
is an error. Files outside every type's directory are ignored.

## Derived outputs

An implementation MAY produce outputs from a corpus, such as indexes, HTML pages or exports in
other formats. These are derived. They MUST NOT be committed inside the corpus, and nothing in the
corpus depends on them.

## Verbs

An implementation SHOULD offer these verbs, named as below.

| Verb       | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| `validate` | Check a corpus against the manifest and this spec. Report errors. |
| `build`    | Write the derived outputs from a corpus.                         |
| `list`     | List the entries of a corpus, optionally of one type.            |
| `new`      | Create an entry of a type with a given id.                       |

Only `validate` is defined in version 0. It exits non-zero when it finds any error, and reports
each error as one line: `<file>: <field>: <message>`.

## Non-normative note

The reference implementation is in `src/markdown-db/` and uses the `ajv` and `yaml` packages.
