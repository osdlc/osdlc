# @osdlc/corpus-profile-claims

The claims profile is a set of record types for claims and the evidence behind them. A corpus that
keeps research, test results or fact checks can use these types instead of inventing its own.

The profile is a corpus that holds types and no records. It ships as the npm package
`@osdlc/corpus-profile-claims`. A corpus names it under `extends` in its root file, with the prefix
`claims`, and builds its own types on the profile's types with `x-extends`. The
[corpus-schema spec](../../packages/conformance/corpus-schema/SPEC.md) defines both keys.

A few words used below:

- A corpus is a folder of Markdown notes. A corpus-schema corpus has a root file,
  `corpus-schema.md`, and one folder per type of record.
- A record is one note in a type folder. Its YAML frontmatter is its data, and the type's JSON
  Schema checks it.
- A record folder is a record that keeps its own files beside it, such as a script and a CSV:
  `<type>/<Name>/<Name>.md`.
- A profile is a parent corpus that holds only types. A corpus that extends it sees each type as
  `<prefix>/<type>`, such as `claims/statements`.

## Install

```sh
npm install --save-dev @osdlc/corpus-profile-claims
# or
pnpm add -D @osdlc/corpus-profile-claims
```

Install it in the folder that holds your corpus, or in any folder above it. The validator finds the
package the way Node.js does. The package's `"corpus"` field names its corpus folder, `corpus/`.

You need a corpus-schema validator that reads `extends`: `@osdlc/corpus-schema` 0.3.0 or later.

## Use it

Name the profile in your corpus's root file. `extends` needs level 2:

```yaml
---
corpus-schema: 0
level: 2
extends:
  claims: "@osdlc/corpus-profile-claims"
---
```

Then use the claims types. `uses` gives a folder named after a type that type as it is, with no
schema file in the folder:

```yaml
uses: claims/* # or a list, such as [claims/statements, claims/study-results]
```

The records then go straight into `statements/`, `study-results/` and the rest. To add fields to a
type, leave it out of `uses` and write a schema that names it in `x-extends` instead.
`statements/statements.schema.md`:

```markdown
---
x-extends: claims/statements
---

# Statements
```

Keep the profile's folder names, `documents`, `methods`, `study-results` and `statements`, unless
you have a reason not to. A typed link in the profile, such as a statement's `specifiedBy`
(`x-ref: methods`), accepts a record of any local type that extends the named type, whatever its
folder is called. One rule does need the name: each evidence item must point into a folder named
`study-results` (see departure 4 below).

To add fields to a type, list them beside `x-extends`. See
[Adding your own kinds](#adding-your-own-kinds).

Validate as usual:

```sh
npx --yes @osdlc/corpus-schema@^0.3.0 validate my-corpus
```

`extends` brings in types only, so your corpus keeps no copy of the profile, and
`corpus-schema sync` writes none for it. A corpus package that builds on the profile lists it under
`peerDependencies`, with a range, so the project that installs both holds one version of the
profile:

```json
{ "peerDependencies": { "@osdlc/corpus-profile-claims": "^0.1.0" } }
```

## Where the types come from

The types follow GA4GH's Variant Annotation Specification, VA-Spec. VA-Spec is a JSON Schema model
for claims backed by evidence. It was written for genetics, but its core classes say nothing about
genes. We take its class names and field names as they are, so each field here maps to a VA-Spec field
by name.

The draft is checked against VA-Spec 1.1.0, released on 2026-10-02 (tag `1.1.0`, commit
`d9da20ca3c1a8fd20044bf45cc921ea38198b05f`). Its core classes are marked "trial use". The schemas
read were:

- [Statement](https://w3id.org/ga4gh/schema/va-spec/1.1.0/json/Statement)
- [EvidenceLine](https://w3id.org/ga4gh/schema/va-spec/1.1.0/json/EvidenceLine)
- [StudyResult](https://w3id.org/ga4gh/schema/va-spec/1.1.0/json/StudyResult)
- [Method](https://w3id.org/ga4gh/schema/va-spec/1.1.0/json/Method)
- [Document](https://w3id.org/ga4gh/schema/va-spec/1.1.0/json/Document)
- [Contribution](https://w3id.org/ga4gh/schema/va-spec/1.1.0/json/Contribution)
- [Agent](https://w3id.org/ga4gh/schema/va-spec/1.1.0/json/Agent)
- [Proposition](https://w3id.org/ga4gh/schema/va-spec/1.1.0/json/Proposition)

These resolve to the files under `schema/va-spec/json/` in
[ga4gh/va-spec at 1.1.0](https://github.com/ga4gh/va-spec/tree/1.1.0/schema/va-spec/json). The
documentation is at <https://va-spec.ga4gh.org/en/1.1.0/>. The rule that ties strength to
direction comes from the ACMG 2015 profile in the same release,
[VariantPathogenicityEvidenceLine](https://w3id.org/ga4gh/schema/va-spec/1.1.0/json/acmg-2015/VariantPathogenicityEvidenceLine).

## The types

There are four type folders, in [corpus/](corpus/). Four more VA-Spec classes live inside them as
nested objects.

| Folder          | VA-Spec class | Holds                                                       |
| --------------- | ------------- | ----------------------------------------------------------- |
| `documents`     | Document      | A source: a web page, a README, a paper.                    |
| `methods`       | Method        | The steps followed to get a result.                         |
| `study-results` | StudyResult   | One observation: what a document said, or what a run found. |
| `statements`    | Statement     | A claim, its evidence lines, and the verdict.               |

| Nested object | VA-Spec class | Sits in                                         |
| ------------- | ------------- | ----------------------------------------------- |
| proposition   | Proposition   | a statement's `proposition`                     |
| evidence line | EvidenceLine  | a statement's `hasEvidenceLines`                |
| contribution  | Contribution  | `contributions` on study results and statements |
| contributor   | Agent         | a contribution's `contributor`                  |

A statement is the only type that makes a claim. A study result records what was seen and claims
nothing. What a study result is about comes from the statements that cite it.

### documents (Document)

| Field          | VA-Spec field  | Notes                                                            |
| -------------- | -------------- | ---------------------------------------------------------------- |
| `title`        | `title`        | Required here.                                                   |
| `documentType` | `documentType` | Free text, as in VA-Spec. Marked "draft" there.                  |
| `urls`         | `urls`         | Same item rule: a URI starting `http`, `https`, `ftp` or `sftp`. |
| `doi`          | `doi`          | Same pattern as VA-Spec.                                         |

### methods (Method)

| Field        | VA-Spec field | Notes                                  |
| ------------ | ------------- | -------------------------------------- |
| `methodType` | `methodType`  | Free text, as in VA-Spec.              |
| `reportedIn` | `reportedIn`  | One link to a document, as in VA-Spec. |

The steps go in the Markdown body.

### study-results (StudyResult)

| Field              | VA-Spec field      | Notes                                   |
| ------------------ | ------------------ | --------------------------------------- |
| `specifiedBy`      | `specifiedBy`      | A link to a method.                     |
| `reportedIn`       | `reportedIn`       | Links to documents.                     |
| `contributions`    | `contributions`    | Required here, with at least one entry. |
| `ancillaryResults` | `ancillaryResults` | Any object. Marked "draft" in VA-Spec.  |
| `qualityMeasures`  | `qualityMeasures`  | Any object. Marked "draft" in VA-Spec.  |

The observation itself goes in the Markdown body. Full result data goes in files in a record folder.

### statements (Statement)

| Field              | VA-Spec field      | Notes                                                |
| ------------------ | ------------------ | ---------------------------------------------------- |
| `proposition`      | `proposition`      | Inline: `subject`, `predicate`, `object`.            |
| `direction`        | `direction`        | `supports`, `neutral` or `disputes`, as in VA-Spec.  |
| `strength`         | `strength`         | `strong`, `moderate` or `weak`. See departures.      |
| `hasEvidenceLines` | `hasEvidenceLines` | Inline evidence lines.                               |
| `specifiedBy`      | `specifiedBy`      | A link to the method used to weigh the evidence.     |
| `reportedIn`       | `reportedIn`       | Links to documents where the statement is published. |
| `contributions`    | `contributions`    | Required here.                                       |

An evidence line has these fields:

| Field                         | VA-Spec field                 | Notes                                    |
| ----------------------------- | ----------------------------- | ---------------------------------------- |
| `hasEvidenceItems`            | `hasEvidenceItems`            | Links to study results. Required here.   |
| `directionOfEvidenceProvided` | `directionOfEvidenceProvided` | `supports`, `neutral` or `disputes`.     |
| `strengthOfEvidenceProvided`  | `strengthOfEvidenceProvided`  | The same three-step scale as `strength`. |
| `description`                 | `description`                 | Why the results point this way.          |

A contribution has `contributor` (an Agent with `name` and `agentType`), `activityType` and `date`.
`date` is a date and time, as VA-Spec's `datetime` is.

## What we leave out

- `id` and `type` on every class. The record's file name is its id, and its folder is its type.
  corpus-schema gives a record no type field.
- `name` and `description` on records. The file name is the name, and the Markdown body is the
  description. An evidence line has no file, so it keeps `description`.
- `aliases` and `extensions`. Records accept fields their schema does not list, so a corpus adds
  its own fields directly. See [Adding your own kinds](#adding-your-own-kinds).
- Statement `score` and evidence line `scoreOfEvidenceProvided`. A number invites arithmetic that
  nobody can justify, and it goes stale. The three-step strength is enough for now.
- Statement `quality` and `classification`, and evidence line `evidenceOutcome`. Each needs a value
  set that only a domain can give, such as a testing profile.
- Statement `hasEvidence`. Every piece of evidence goes through an evidence line, so a reader always
  sees its direction.
- Evidence line `targetProposition`. A line inside a statement argues for that statement's
  proposition.
- Evidence line `specifiedBy`, `reportedIn` and `contributions`. The statement's own fields cover
  them, and corpus-schema v0 cannot type-check a link inside a nested object.
- Study result `focus`. See departures.
- Study result `sourceDataSet`. There is no DataSet type yet. A record folder keeps the data
  instead.
- Document `pmid`. It is a PubMed id, and only biomedical papers have one.

## Where we depart from VA-Spec

1. No `focus` on a study result. VA-Spec requires it: the subject a result is about. Here a study
   result says what was seen, and the statements that cite it say what it is about. One
   observation can back statements about several things.
2. Evidence lines are kept inside statements. VA-Spec lets a statement embed its evidence lines or
   point at them by IRI. We only embed them, and there is no `evidence-lines` type. A line means
   nothing apart from the statement it argues for.
3. Links instead of objects or IRIs. Where VA-Spec takes an embedded object or an IRI, such as
   `specifiedBy` or `reportedIn`, we take a relative Markdown link to a record. Top-level links use
   corpus-schema's `x-ref`, so the validator checks that each one points at a record of the right
   type.
4. Evidence items are not type-checked by `x-ref`. corpus-schema v0 allows `x-ref` only on
   top-level fields, and `hasEvidenceItems` sits inside an evidence line. Each link must still
   resolve, and a pattern checks that it points into `study-results`, does not step back out with
   `..`, plain or percent-encoded, and does not point at the type's schema file. The pattern has
   two gaps. A link to a `.md` file inside a record folder that is not the record itself still
   passes. A link that climbs above the corpus into some other `study-results` folder gets only a
   warning, and `corpus-schema validate` still exits 0. Both close when corpus-schema allows
   `x-ref` inside nested objects (task 31): the pattern then becomes `x-ref: study-results`.
5. Evidence items are study results only. VA-Spec also lets an evidence line cite statements and
   other information entities. Citing another statement can come later.
6. Strength is a plain word, not a concept object. VA-Spec's `strength` and
   `strengthOfEvidenceProvided` take a MappableConcept: an object with a name and a coding. VA-Spec's
   core gives no value set for it, and each VA-Spec profile binds its own. We use one word from our
   own scale: `strong`, `moderate` or `weak`.
7. Strength follows direction. Following the ACMG 2015 profile, strength is required when the
   direction is `supports` or `disputes`, and not allowed when it is `neutral`. We apply the rule
   to statements and to evidence lines.
8. A proposition is three values, and its object can be any value. VA-Spec's Proposition is an
   abstract class whose `subject` and `object` are entities. Here `subject` and `predicate` are
   text, and `object` is any JSON value except null: text, a number, true or false, an object or a
   list. The corpus decides the object's shape. `subject` may be a slug or a link to a record. The
   validator checks that a link resolves, but not what type it points at, until `x-ref` works
   inside nested objects (task 31). The proposition has no `type`.
9. Some optional fields are required. `title` on a document, `contributions` on study results and
   statements, `hasEvidenceItems` on an evidence line, and all three parts of a contribution. A
   record without them does not carry enough to check.
10. `agentType` is limited to `person`, `organization` and `software`. VA-Spec recommends these
    three but takes any text.
11. The contribution schema is copied into both the study-results and statements schemas.
    corpus-schema v0 keeps each type's schema apart, so one cannot `$ref` another. The copies stay
    until a schema can share a definition with another.
12. Records are open. VA-Spec closes Document, Method, Statement, EvidenceLine, Contribution and
    Agent, and gives each an `extensions` list for anything else. Its abstract classes, Proposition
    and StudyResult, stay open so that its own profiles can add fields. Here the four record types,
    the proposition and the evidence line are all open, because each one is a base that a corpus
    builds on. Contribution and Agent stay closed.

## The example

[example/](example/) is a valid level-2 corpus. It extends the profile by the path `../corpus`. `uses` gives
all four of its type folders the profile's types with no schema files. The example is not part of the npm package.

It checks a claim about a made-up command line tool, fernlog: that version 2.3 reads its config
file from `~/.config/fernlog/config.toml`. It also checks a narrower form of the same claim, for
Linux only, and a claim that lists the config paths for each platform.

- A document: the tool's README.
- A method: a probe that tries each config path in turn.
- Three study results. One is what the README says. Two are runs of the probe, each in a
  subfolder for its platform: `study-results/linux/` holds the Linux run as a record folder with
  its script and CSV, and `study-results/macos/` holds the macOS run.
- Three statements. The first has two evidence lines: the README and the Linux run support the
  claim, and the macOS run disputes it. The second makes the narrower claim for Linux only. It
  also has a field the claims types do not define and an object for its value. See
  [Adding your own kinds](#adding-your-own-kinds). The third lists the paths fernlog reads on each
  platform, and all three study results support it.

### Where the example shows nesting

- Records in subfolders. corpus-schema finds records at any depth in a type folder. A record's id
  is still its file name, or its folder name for a record folder, so the macOS run's id is
  `macOS probe` and the subfolder `macos` is not part of it. Ids must be unique across the whole
  type, whatever the subfolder.
- A record folder inside a subfolder: `study-results/linux/Linux probe/`, with its script and CSV.
- A sub-object in a study result: `qualityMeasures.environment` on both probe runs holds the
  operating system and the shell.
- A list of objects as a proposition's value:
  [fernlog config paths by platform](example/statements/fernlog%20config%20paths%20by%20platform.md)
  has one `{ platform, path, precedence }` entry per path.

A nested field can hold a link, but the validator checks only that the link resolves, not what
type of record it points at. Typed links from nested fields need `x-ref` inside nested objects,
which is plan task 31. Until then, typed links go in top-level fields, and evidence items use the
pattern described in departure 4.

Check the profile and the example from the root of this repository. CI uses the repository's own
validator, since the published 0.2.x does not read `extends`:

```sh
pnpm --filter @osdlc/corpus-schema run build
node packages/ts/corpus-schema/bin/corpus-schema.js validate profiles/claims/corpus profiles/claims/example
```

## The tests

[tests/](tests/) checks that the schemas reject what they should. Each folder in `tests/cases/`
holds one record that breaks one rule, such as a neutral statement with a strength, a null
`object`, an evidence link that steps out of `study-results`, or an extra field on a contribution.
Its `expected-error.txt` holds the error the validator must print. One case,
`evidence-leaves-corpus`, has an `expected-warning.txt` instead. It writes down a known gap: a link
that leaves the corpus gets only a warning. The tests sit outside `example/`, so a copy of the
example has no broken records in it.

For each case, [tests/run.sh](tests/run.sh) copies the profile's corpus and the example, adds the
record to the example, and runs the validator. An error case passes when the validator reports
exactly one error, the expected one. A warning case passes when the validator exits 0 and prints
the expected warning.

[tests/package.sh](tests/package.sh) checks the package as npm ships it. It packs the package
with pnpm, as the release does, unpacks it into a temporary `node_modules/`, and validates
[tests/package/fixture/](tests/package/fixture/), a small corpus that names the profile by its
package name. It also checks that the tarball holds no example or tests, and that a rule of the
profile and a rule the fixture adds both still apply.

Run both after building the validator, from this folder:

```sh
npm test
```

Each script uses `packages/ts/corpus-schema` from this repository. Set `CORPUS_SCHEMA` to the
command of another validator to run that one instead. CI runs both scripts after it checks the
example.

## Adding your own kinds

The claims types hold only the generic structure of a claim: documents, methods, study results,
statements, evidence lines, contributions and propositions. They know nothing about any one
field of study. The kinds of thing a corpus makes claims about, and the fields those claims need,
belong to the corpus that uses the types.

For example, osdlc/skillwright's harness-reference makes claims about agent harnesses. It needs
harnesses and subjects as types of their own, a scope on each claim, and a value with a set shape
for each subject. None of these belong in the claims types. See the review in
[osdlc/markdown#8](https://github.com/osdlc/markdown/issues/8).

### What is open and what is closed

A record may carry fields its schema does not list. The fields the claims types do list are still
checked: a wrong `direction`, or a `specifiedBy` that is not text, is an error as before. A field
the schema does not list is not checked at all.

| Object                | Open or closed | Why                                                                          |
| --------------------- | -------------- | ---------------------------------------------------------------------------- |
| the four record types | open           | Each is a base that a corpus builds on.                                      |
| proposition           | open           | A corpus may qualify a claim, as VA-Spec's own profiles add qualifiers.      |
| evidence line         | open           | A corpus may qualify a line, such as the platform a run covered.             |
| contribution          | closed         | Who did what and when is the whole of it. Anything more is about the record. |
| contributor (Agent)   | closed         | A name and a kind tell agents apart. A version goes in the name.             |

Closed is the choice that can be undone. Opening a closed object later breaks no corpus. Closing an
open one breaks every corpus that added a field to it.

The proposition's `object` takes any JSON value except null. In YAML, `object:` with nothing after
it reads as null, so allowing null would let a claim with a missing value pass. To claim that
something has no value, write an empty list, an empty object, `false`, or a word such as `none`.

### Add to the types

Extend the profile, as [Use it](#use-it) says. Then:

- Add your fields to your type's schema, beside `x-extends`, so the validator checks them. A field
  you leave out of the schema is still allowed, but nothing checks it.
- Add your own types, such as `harnesses` or `subjects`, as folders beside the claims types. A
  top-level field can point at them with `x-ref`.
- Keep the field names the claims types use. If you add a field that VA-Spec defines and the claims
  types leave out, such as `score`, give it VA-Spec's meaning.
- For strict checking, close your type with `additionalProperties: false`. The profile's fields
  count as your type's own, so list only the fields you add. A record still passes the profile's
  rules for its fields.

The example statement
[fernlog config path on Linux](example/statements/fernlog%20config%20path%20on%20Linux.md) has a
`platform` field that the claims types do not define, and its proposition's object is
`{ paths: [...] }`. It validates with no errors and no warnings.

### Building on the claims types with `x-extends`

A type can build on another type with `x-extends`. A type in your corpus names a claims type and
adds fields to it. A record must pass its own schema and the parent's. A child type
may add rules and tighten them, but never loosen them. That is why the claims types are open: a
closed parent would reject every field a child adds.

With the profile named under `extends` as `claims`, harness-reference's claims type could be this:

```yaml
x-extends: claims/statements
properties:
  harness: { type: string, x-ref: harnesses }
  subject: { type: string, x-ref: subjects }
  scope: { type: object }
```

`harness` and `subject` are top-level fields here, so they can be typed links. A typed link inside
the proposition needs `x-ref` in nested objects, which is plan task 31.

### What stays in your corpus

These belong to the corpus that uses the claims types, not to the types:

- Status and supersession: whether a claim is current, superseded or open, and which claim replaces
  which.
- The shape of each subject's value. The claims types say only that `object` is a value. Which
  shape it takes for a given subject is a rule of your domain.
- Rules across records, such as "a `model` field only on subjects marked `model_dependent`". A
  schema checks one record at a time, so these need a script of your own.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
