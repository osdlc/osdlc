---
title: Query a corpus
description: Ask questions of a corpus-schema corpus from TypeScript, the command line, a REST API or an MCP server, with one query shape.
---

`@osdlc/corpus-query` answers questions about one
[corpus-schema](../../../corpus-schema/README.md) corpus: which types it has, which records match
a filter or a search, what one record says, and how records refer to each other. This page walks
through it on the harness reference, the corpus in `packages/corpora/harness-reference/corpus` of
the [osdlc/osdlc](https://github.com/osdlc/osdlc) repository. It has 2,417 records: statements
about coding-agent harnesses, the study results behind them, and the documents they cite.

The [README](../../README.md) is the reference: every key, operator, route and tool.

## See what the corpus holds

```sh
cd packages/corpora/harness-reference/corpus
npx corpus-query describe
```

```text
harness-reference: 2417 records, 6 types

TYPE           RECORDS  TITLE         DESCRIPTION
documents      295      Document      Something written that we can point at, …
harnesses      17       Harness       The data of one harness, harnesses/<name…
methods        7        Method        A set of steps that says how to get a re…
statements     824      Statement     A claim about one harness and one subjec…
study-results  1189     Study Result  One observation of a harness: what a doc…
subjects       85       Subject       One question asked of every harness, and…
```

The command uses the corpus the working directory is in. From anywhere else, name it:
`corpus-query -C <dir> describe`.

Before filtering on a type, look at its fields:

```sh
npx corpus-query type statements
```

It lists each field, its kind, the values an enum allows, and which fields are references to
which types. `status` is one of `current`, `superseded`, `disputed` and `open`. `harness` is a
reference to `harnesses`.

## Find records

A `find` takes a type and conditions:

```sh
npx corpus-query find statements status=current 'harness=Claude Code' -f strength -n 5
```

```text
RECORD                                            STRENGTH
statements/Claude Code Agent Skills format        weak
statements/Claude Code Appended system prompt     strong
statements/Claude Code Command files              moderate
statements/Claude Code Config directory variable  moderate
statements/Claude Code Continue the last session  moderate

1-5 of 78 records; next page: --offset 5
```

- `status=current` compares a field with a value.
- `harness=Claude Code` is a condition on a reference field. It compares the record the field
  points at, so you write the harness's name, not the Markdown link the file holds.
- `-f strength` adds a data field to each row. Without `-f`, a row is the record's name only.

The other operators are `!=`, `~` (contains), `!~`, `>`, `>=`, `<` and `<=`. A comma after `=`
means "one of": `strength=strong,moderate`. `supersedes!=` finds records that have the field,
and `supersedes=` those that do not. A path reaches into an object: `scope.since>=2.0`.

Full-text search is `-s`:

```sh
npx corpus-query find -s '"permission mode"' -n 3
```

Every word must be in the record's title, a field or its body. A match in the title ranks first.

A mistake gets an answer that lists what exists:

```text
$ npx corpus-query find statements status=done
corpus-query: 'done' is not a value of field 'status' in type 'statements'; values: current, superseded, disputed, open
```

## See which values a field has

```sh
npx corpus-query facets status strength -t statements
```

```text
status: 4 values over 824 records
COUNT  VALUE
720    current
77     open
26     superseded
1      disputed

strength: 3 values over 824 records, 77 without one
COUNT  VALUE
378    moderate
236    strong
133    weak
```

Facets take the same conditions as `find`, with `-w`: `facets strength -t statements -w
'harness=Claude Code'`.

## Read one record and follow its references

```sh
npx corpus-query get 'harnesses/Claude Code'
npx corpus-query backlinks 'harnesses/Claude Code'
npx corpus-query traverse 'harnesses/Claude Code' --in --via harness --depth 2
```

`get` prints the record's data and body, what it refers to and what refers to it. `backlinks`
lists every record that points at it, with the field that does. `traverse` walks several hops.

A record's name is its `ref`: the type, a slash, and the id. Every result gives it, and every
command takes it.

## The same query from TypeScript

```ts
import { openCorpus } from '@osdlc/corpus-query/node'

const corpus = openCorpus('packages/corpora/harness-reference/corpus')
const { total, records } = corpus.find({
  type: 'statements',
  where: ['status=current', 'harness=Claude Code'],
  fields: ['strength'],
  limit: 5,
})
```

The query is plain JSON. `where` takes the same terms the command line does, or
`{ field, op, value }` objects. The functions are also exported one by one, over a corpus that
`loadCorpus` of `@osdlc/corpus-schema` loaded: `findRecords(model, query)`.

The main entry loads no Node module. A site can load a corpus at build time, write it out with
`JSON.stringify`, and run the same queries in the browser.

## Serve it over HTTP

```sh
npx corpus-query serve
```

```text
corpus-query: harness-reference, 2417 records
  rest   http://127.0.0.1:4010
  try    curl 'http://127.0.0.1:4010/records?limit=3'
  stop   Ctrl-C
```

```sh
curl 'http://127.0.0.1:4010/records?type=statements&where=status=current&where=harness=Claude%20Code&fields=strength&limit=5'
curl 'http://127.0.0.1:4010/facets?type=statements&fields=status'
curl 'http://127.0.0.1:4010/records/harnesses/Claude%20Code?body=false'
```

The API is read-only. `GET /openapi.json` describes it. `--watch` loads the corpus again when a
file changes, and `--cors '*'` lets a page on another origin call it.

## Give it to an agent

Add the corpus to an MCP client. For Claude Code, in `.mcp.json`:

```json
{
  "mcpServers": {
    "harness-reference": {
      "command": "npx",
      "args": ["-y", "@osdlc/corpus-query", "-C", "packages/corpora/harness-reference/corpus", "mcp"]
    }
  }
}
```

The agent gets eight tools: `describe_corpus`, `describe_type`, `find_records`, `get_record`,
`get_references`, `get_backlinks`, `traverse` and `count_facets`. `find_records` takes the query
shown above. Answers are small by default: 20 records with no data, and a long body cut at 8000
characters. Each answer says how to get more.

## A corpus that serves itself

A package that ships a corpus can expose it with one script:

```json
{ "scripts": { "mcp": "corpus-query -C ./corpus mcp" } }
```
