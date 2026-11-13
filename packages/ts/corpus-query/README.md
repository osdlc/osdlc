# @osdlc/corpus-query

Query one [corpus-schema](../corpus-schema#readme) corpus: describe its types, find records by
filter and full-text search, read a record with what it refers to and what refers to it, walk
references, and count the values of a field.

One core does the work, behind four surfaces: a TypeScript API, the `corpus-query` command, a
read-only REST server, and an MCP server for agents. All four take the same query and give the
same JSON. The core reads the plain data `loadCorpus` of `@osdlc/corpus-schema` returns, parses
no file itself, and loads no `node:` module, so a browser bundle can use it on a corpus that was
loaded at build time.

## Install

```sh
npm install @osdlc/corpus-query
```

ESM only. Node.js 22 or later.

## Quick start

Each surface, on a corpus in `docs/corpus`.

TypeScript:

```ts
import { openCorpus } from '@osdlc/corpus-query/node'

const corpus = openCorpus('docs/corpus')
corpus.find({ type: 'decisions', where: 'status=accepted', search: 'config' }).records
```

Command line:

```sh
npx corpus-query -C docs/corpus describe
npx corpus-query -C docs/corpus find decisions status=accepted -s config
```

REST:

```sh
npx corpus-query -C docs/corpus serve --port 4010
curl 'http://127.0.0.1:4010/records?type=decisions&where=status=accepted&search=config'
```

MCP, for an agent, in the client's config file (`.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "corpus": { "command": "npx", "args": ["-y", "@osdlc/corpus-query", "-C", "docs/corpus", "mcp"] }
  }
}
```

Without `-C`, the command uses the corpus the working directory is in, or the one corpus below
it.

## A corpus package that serves itself

A package that ships a corpus adds this package as a dependency and one script:

```json
{
  "scripts": { "mcp": "corpus-query -C ./corpus mcp", "serve": "corpus-query -C ./corpus serve" }
}
```

Or one bin file, so `npx my-corpus find ...` and `npx my-corpus mcp` work wherever the package is
installed:

```js
#!/usr/bin/env node
import { runCli } from '@osdlc/corpus-query/cli'

await runCli({ root: new URL('../corpus/', import.meta.url), name: 'my-corpus' })
```

## Entries

| Import | Holds | Loads |
| --- | --- | --- |
| `@osdlc/corpus-query` | The core: every query function, over a `LoadedCorpus` | nothing |
| `@osdlc/corpus-query/node` | `openCorpus`, `loadCorpusAt`, `findCorpusRoot`, `serveRest` | `node:fs`, `node:http`, `@osdlc/corpus-schema` |
| `@osdlc/corpus-query/rest` | `createRestHandler`: the REST API as `(Request) => Response` | nothing |
| `@osdlc/corpus-query/mcp` | `createMcpServer`, `serveMcpStdio`, `createMcpHandler` | `@modelcontextprotocol/sdk` |
| `@osdlc/corpus-query/cli` | `createApp`, `runCli`: the `corpus-query` command | all of the above, `@osdlc/cli-tool` |

## The core

```ts
import { loadCorpus } from '@osdlc/corpus-schema'
import { corpusQuery, findRecords } from '@osdlc/corpus-query'

const model = loadCorpus('docs/corpus')
findRecords(model, { type: 'decisions', limit: 5 })

const corpus = corpusQuery(model) // the same functions, bound to the model
corpus.get('decisions/Read config from the XDG folder').references
```

| Function | On `corpusQuery` | Returns |
| --- | --- | --- |
| `describeCorpus(model)` | `describe()` | `CorpusSummary`: name, identity, version, each type with its record count, and each `CorpusLink` to a corpus it extends or references |
| `listTypes(model, corpus?)` | `types(corpus?)` | `TypeSummary[]` |
| `describeType(model, name, corpus?)` | `type(name, corpus?)` | `TypeDescription`: each `FieldDescription` with its kind, description, allowed `FieldValue`s and what it references |
| `findRecords(model, query?)` | `find(query?)` | `QueryResult` |
| `countFacets(model, query)` | `facets(query)` | `FacetResult` |
| `readRecord(model, ref, options?)` | `get(ref, options?)` | `RecordDetail` |
| `getReferences(model, ref)` | `references(ref)` | `OutgoingReference[]` |
| `getBacklinks(model, ref)` | `backlinks(ref)` | `IncomingReference[]` |
| `traverse(model, ref, options?)` | `traverse(ref, options?)` | `TraverseResult` |

`corpusQuery(model)` returns a `CorpusQuery`. Every function is pure and returns plain JSON. The
functions index a model the first time they read it, so do not change a model after that.

### A record's name

Every result names a record by a `RecordHeader`: `corpus`, `type`, `id`, `path`, `title`, and
`ref`. The `ref` is the one string that names the record everywhere: to `readRecord`, on the
command line, in a URL and to an MCP tool. A `RecordRef` is that string or an object:

| `RecordRef` | Names |
| --- | --- |
| `decisions/Read config from the XDG folder` | `<type>/<id>`, in the loaded corpus. Case does not matter |
| `org/principles/Write decisions down` | `<corpus key>/<type>/<id>`, in a referenced corpus |
| `decisions/Read config from the XDG folder.md` | the record's path in the loaded corpus |
| `Read config from the XDG folder` | a bare id, when one type has it |
| `{ type, id, corpus? }` | the same, as an object, such as a `RecordTarget` |

### The query

A `Query` is plain JSON, so REST and MCP pass it through unchanged. Every key is optional.

| Key | Type | Meaning |
| --- | --- | --- |
| `type` | string or list | The type or types to read. Absent: every type |
| `corpus` | string | The key of a referenced corpus, or `*` for every corpus of the graph. Absent: the loaded corpus |
| `where` | string or list | Conditions that must all hold: one string of terms, or a list of terms and `Filter` objects |
| `search` | string | Words every match must hold. See [Search](#search) |
| `sort` | string or list | Fields to sort by. `-field` is descending. A string may join them with commas |
| `limit` | number | How many records to return. Default 50. 0 returns none, with `total` |
| `offset` | number | How many matches to skip. Default 0 |
| `fields` | string or list | Data fields to return with each record: names, paths, or `*` for all. Default none |
| `body` | boolean | Whether to return each record's Markdown body. Default false |

```json
{
  "type": "statements",
  "where": ["status=current", { "field": "strength", "op": "in", "value": ["strong", "moderate"] }],
  "search": "permission mode",
  "sort": "-scope.since",
  "limit": 10,
  "fields": ["strength", "harness"]
}
```

A `QueryResult`:

```json
{
  "total": 78,
  "offset": 0,
  "limit": 10,
  "next": 10,
  "records": [
    {
      "ref": "statements/Claude Code Hooks",
      "corpus": "",
      "type": "statements",
      "id": "Claude Code Hooks",
      "path": "statements/Claude Code/Claude Code Hooks.md",
      "title": "Claude Code Hooks",
      "identity": null,
      "data": { "strength": "strong", "harness": "[Claude Code](../../harnesses/Claude%20Code.md)" },
      "score": 27,
      "snippet": "…hooks run in every permission mode…"
    }
  ]
}
```

`total` counts every match. `next` is the `offset` of the next page, or null on the last. Each
`RecordHit` is a `RecordHeader` plus `identity` (the record's package URL, or null for a corpus
in no package), `data` when `fields` asks for any, `body` with `body: true`, and `score` and
`snippet` with `search`. The body and the data are left out by default because of their size.

Without `sort`, a search is ordered by score, best first. Anything else is ordered by corpus key,
type, id and path. Those four break every tie, so the order is the same on every run. A record
with no value for a sort field comes last in both directions.

### Filters

A `Filter` is `{ field, op, value }`, and `op` is a `FilterOp`. The string form writes one as a
term:

| Term | `op` | Holds when |
| --- | --- | --- |
| `status=done` | `eq` | the field is the value |
| `status!=done` | `ne` | it is not |
| `status=done,open` | `in` | it is one of the values |
| `status!=done,open` | `nin` | it is none of them |
| `title~hook` | `contains` | it contains the text, without regard to case |
| `title!~hook` | `ncontains` | it does not |
| `rating>4`, `>=`, `<`, `<=` | `gt`, `gte`, `lt`, `lte` | it compares so: numbers by size, strings by code unit, so ISO dates work |
| `owner!=` | `exists` (`value: true`) | the field has a value |
| `owner=` | `exists` (`value: false`) | it has none: absent, null or an empty list |

The grammar:

```text
filter = term *( space term )
term   = field op value
field  = [ "@" ] name *( "." name )      no space, and none of = ! ~ < >
op     = "=" | "!=" | "~" | "!~" | ">" | ">=" | "<" | "<="
value  = item *( "," item )              a list only after = and !=
item   = bare | '"' text '"'             in quotes, \" is a quote and \\ a backslash
```

- `parseFilter(text)` reads a whole filter. Terms are split at spaces outside quotes, so a value
  with a space is quoted: `harness="Claude Code" status=current`.
- `parseTerm(term)` reads one term. Its value runs to the end, so a term that is one command-line
  argument or one URL parameter needs no quotes: `'harness=Claude Code'`.
- `formatFilter(filter)` writes a `Filter` back as a term.
- A comma splits a list only after `=` and `!=`. Quote an item to keep its comma:
  `title="a, b",c`.
- A value in the string form is text. It stands for a number, `true`, `false` or `null` when the
  record's value is one, so `pages=304` and `owned=true` work. In JSON, write the value itself.

What a field can be:

- A data field: `status`. Or a path into one: `scope.since`, `edition.year`. A list on the way
  gives the values of each of its items.
- A list field holds a value when one of its items does: `tags=utopia`.
- A reference field (one with `x-ref`) compares the record it points at, not the link text. The
  value is the record's id, its `<type>/<id>`, its `ref` or its path: `harness=Claude Code`,
  `harness=harnesses/Claude Code`. In JSON it may be `{ type, id }`.
- A record fact, with `@` in front: `@id`, `@type`, `@title`, `@path`, `@corpus`, `@ref`,
  `@name`, `@format`, `@valid`, `@identity`, `@body`. The `@` may be left off when no type the
  query reads has a data field of that name.

A query is checked against the types it reads before it runs. Every error is a `QueryError` with
a `code` (a `QueryErrorCode`) and a one-line message that says what exists:

| `code` | Message |
| --- | --- |
| `unknown-type` | `no type 'book' in corpus 'library'; types: authors, books` |
| `unknown-corpus` | `no corpus 'nope' in the graph of 'fernlog'; corpus keys: claims, org` |
| `unknown-field` | `no field 'nope' in type 'books'; fields: title, author, status, ...` |
| `unknown-field` | `no record fact '@nope'; facts: @id, @type, @title, ...` |
| `bad-value` | `'done' is not a value of field 'status' in type 'books'; values: read, reading, queued` |
| `bad-value` | `'many' is not a number; field 'pages' of type 'books' holds numbers` |
| `bad-query` | `no query key 'filter'; keys: type, corpus, where, search, sort, limit, offset, fields, body` |
| `bad-query` | `limit: expected a whole number, 0 or more, got -1` |
| `not-found` | `no record 'Invisible' of type 'books' in corpus 'library'; did you mean: Invisible Cities` |
| `ambiguous` | `'Notes' is the id of 2 records; name one: books/Notes, authors/Notes` |

A field is known when a type the query reads declares it or one of its records holds it. A term
that does not parse is `bad-filter`, with one of these messages:

| Term | Message |
| --- | --- |
| (empty) | `empty filter term` |
| `status` | `'status': no operator; write <field><op><value> with one of = != ~ !~ > >= < <=` |
| `=done` | `'=done': no field before '='` |
| `status!done` | `'status!done': '!' must be followed by '=' or '~'` |
| `rating>` | `'rating>': '>' needs a value` |
| `title="a` | `'title="a': unterminated quote` |
| `title="a"b` | `'title="a"b': text after the closing quote` |

### Search

`search` takes words, and phrases in double quotes. A record matches when it holds every term,
as a substring and without regard to case, in its title, its id, a string anywhere in its data,
or its body. For each term a record scores 20 when its title or id holds it, 6 when a field does
and 2 when the body does, plus 1 for each further time a field or the body holds it, up to 4
each. Ties keep the order of the corpus. The `snippet` is the text around the first term in the
body, else in a field.

There is no index and no search dependency. Each record's text is lowercased the first time a
search reads it, and a search scans that text. Over the 2,417 records of the harness reference
the first search takes about 5 ms and later ones about 1 ms. There is no stemming, no fuzzy
match and no ranking by rarity. See [Limits](#limits).

### Facets

`countFacets(model, { type, corpus, where, search, fields, top })` counts the values of each
field over the records the query selects: what a filter needs to show as its choices, or an
agent needs to see before it filters. A `FacetQuery` takes the selecting keys of a `Query`, the
`fields` to count and `top`, how many values to return for each (default 20). Each `Facet` of the
`FacetResult` has the `distinct` count, how many records are `missing` the field, and `values`,
most frequent first. An item of a list counts once for its record. A reference counts as the
`ref` of the record it points at.

### One record, and its neighbours

`readRecord(model, ref, options?)` returns a `RecordDetail`: the header, `data`, `body`,
`references` and `backlinks`. `ReadOptions` leaves parts out: `{ body: false }`,
`{ references: false }`, `{ backlinks: false }`. An `OutgoingReference` is a value of a
reference field or a link in the body, with the record it points at, or the reason it points at
none. An `IncomingReference` is the same seen from the other side, with the record that holds it.

`traverse(model, ref, options?)` returns the records within a few hops, breadth first, as a
`TraverseResult`: `nodes` with the `depth` each was reached at, `edges`, and `truncated`.
`TraverseOptions`: `direction` (`out` follows references, `in` follows backlinks), `via` (the
reference fields to follow), `links` (follow body links too), `depth` (default 1, at most 10) and
`limit` (default 200 records, at most 5000).

### Referenced corpora

A loaded corpus holds every corpus it extends or references, each once, under a key such as
`org`. Queries span them:

- `type: 'org/principles'` reads a type of a referenced corpus by its namespace path.
  `b/c/principles` follows a reference of a reference.
- `corpus: 'org'` reads one referenced corpus, and `corpus: '*'` every corpus of the graph.
- A record of a referenced corpus has that corpus's key in `corpus` and in front of its `ref`:
  `org/principles/Write decisions down`. Its `identity` is its package URL.
- One corpus reached by two prefixes is one corpus, so a record is one result.
- A reference into a referenced corpus is followed like any other: by a filter, by
  `getBacklinks` and by `traverse`.

## The command

```text
corpus-query [-C <dir>] <command>

describe                     the corpus: its types with record counts, and the corpora it names
types [--corpus <key>]       the types, with record counts
type <name>                  one type: its fields, their allowed values and which are references
find [<type>] [<term>...]    find records by type, conditions and full-text search
get <record>                 one record: its data, body, references and backlinks
refs <record>                what a record refers to
backlinks <record>           what refers to a record
traverse <record>            the records within a few hops of a record
facets <field>...            count the values of fields over the matching records
serve                        serve the corpus over HTTP: a read-only REST API
mcp                          serve the corpus to an agent over MCP (stdio)
```

`-C, --root <dir>` names the corpus folder. Without it the corpus is the nearest folder at or
above the working directory that holds a root file, else the one corpus below it.

`find` flags: `-t, --type`, `-w, --where <term>` (repeat it), `-s, --search`, `--sort`,
`-n, --limit`, `--offset`, `-f, --fields`, `--body`, `--corpus <key>`, and `--query <json>` for
a whole `Query`. The first word is the type unless it is a term. `facets` takes `-t`, `-w`, `-s`,
`--corpus` and `--top`. `traverse` takes `--in`, `--via`, `--links`, `-d, --depth` and
`-n, --limit`. `get` takes `--no-body`. A `<record>` is a `ref`, or the type and the id as two
words.

```sh
corpus-query find statements status=current 'harness=Claude Code' -f strength -n 5
corpus-query find -s '"permission mode"' --json
corpus-query facets status strength -t statements
corpus-query get 'harnesses/Claude Code'
corpus-query traverse 'harnesses/Claude Code' --in --via harness
```

Quote a term that has a space or one of `<` `>` so the shell passes it whole.

Output is a table for people. `--json` prints one JSON document with `schemaVersion` and `kind`
in front, and `--output jsonl` one record a line. `help`, `schema` and `--version` come from
[`@osdlc/cli-tool`](../cli-tool#readme), which the command is built on.

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | The command answered. A `find` that matches nothing is an answer |
| 1 | It could not answer from what it found: no corpus, no such record, a record name that fits more than one, a port that is taken |
| 2 | It cannot run as typed: an unknown flag, type, field or corpus key, a term that does not parse, a value the field's schema rules out |

With `--json`, an error is also a document on stdout: `{ "kind": "error", "code", "message",
"exit" }`, where `code` is the `QueryError`'s. A corpus with validation errors still answers,
with a warning on stderr.

Each run loads the corpus, which takes about 0.6 s for 2,400 records. `serve` and `mcp` load it
once.

In code, `createApp(options?)` returns the command tree as an `@osdlc/cli-tool` app, and
`runCli(options?)` runs it on the process's arguments. `CliOptions`: `root`, the corpus folder
to use when `-C` is not given, and `name`.

## REST

`corpus-query serve` starts it. In code:

```ts
import { serveRest } from '@osdlc/corpus-query/node'

const server = await serveRest('docs/corpus', { port: 4010 })
// server.url is http://127.0.0.1:4010; await server.close() stops it
```

`createRestHandler(model, options?)` is the same API as a `RestHandler`, a fetch-style
`(Request) => Promise<Response>`, for a runtime that has no `node:http` or has a router of its
own. An Astro endpoint:

```ts
import { createRestHandler } from '@osdlc/corpus-query/rest'
import model from '../../corpus.json' // written at build time: JSON.stringify(loadCorpus(root))

const handle = createRestHandler(model, { basePath: '/api/corpus' })
export const GET = ({ request }) => handle(request)
```

| Route | Answers |
| --- | --- |
| `GET /` | the corpus: `describeCorpus` |
| `GET /types` | `listTypes`; `?corpus=` |
| `GET /types/<type>` | `describeType`; `?corpus=` |
| `GET /records` | `findRecords`; the query as parameters, below |
| `POST /query` | `findRecords`; a JSON `Query` as the body |
| `GET /records/<type>/<id>` | `readRecord`; `?corpus=`, `?body=false`, `?references=false`, `?backlinks=false` |
| `GET /records/<type>/<id>/references` | `getReferences` |
| `GET /records/<type>/<id>/backlinks` | `getBacklinks` |
| `GET /records/<type>/<id>/traverse` | `traverse`; `?direction=`, `?via=`, `?links=`, `?depth=`, `?limit=` |
| `GET /facets` | `countFacets`; `?fields=` and the selecting parameters of `/records` |
| `POST /facets` | `countFacets`; a JSON `FacetQuery` as the body |
| `GET /openapi.json` | an OpenAPI 3.1 description of these routes |

`GET /records` takes the query's keys as parameters: `type`, `corpus`, `search`, `sort`, `limit`,
`offset`, `fields`, `body`. `where` is one term and may repeat. `q` is a whole filter in the
string form, in place of `where`. `queryFromParams(params)` is that mapping.

```sh
curl 'http://127.0.0.1:4010/records?type=statements&where=status=current&where=harness=Claude%20Code&fields=strength'
curl 'http://127.0.0.1:4010/records/harnesses/Claude%20Code?body=false'
curl -X POST http://127.0.0.1:4010/query -H 'content-type: application/json' \
  -d '{"search":"permission mode","limit":5}'
```

Every answer is JSON. An error is `{ "error": { "code", "message" } }`:

| Status | When |
| --- | --- |
| 400 | The query cannot run: every `QueryError` code but the two below, and a body that is not JSON |
| 404 | `not-found`: no such record, or no such route |
| 405 | `method-not-allowed`: the API is read-only. It takes `GET`, `HEAD`, `OPTIONS`, and `POST` to `/query` and `/facets` |
| 409 | `ambiguous`: a record name that fits more than one record |
| 413 | `too-large`: a body over 1 MiB |
| 415 | `unsupported-media-type`: a body that is not `application/json` |

`RestOptions`: `basePath` (the path the API is mounted under), `cors` (`true` for any origin, or
one origin; default off) and `maxLimit` (the largest `limit`, default 1000). `ServeOptions` adds
`host` (default `127.0.0.1`), `port` (default 0, any free port; the command's default is 4010),
`watch` (load the corpus again when a file in its folder changes), `before` (routes of your own,
tried first) and `log`. `serveRest` returns a `RestServer`: `url`, `host`, `port`, `server`,
`corpus()` and `close()`.

The server has no authentication. It binds `127.0.0.1` unless told otherwise, and on a loopback
address it refuses a request whose `Host` header names another host (403), so a web page cannot
reach it by pointing a domain at 127.0.0.1. Bind another address only for a corpus that anyone
on that network may read.

## MCP

`corpus-query mcp` serves one corpus over stdio. Add it to an MCP client with the corpus path:

```json
{
  "mcpServers": {
    "harness-reference": {
      "command": "npx",
      "args": ["-y", "@osdlc/corpus-query", "-C", "/path/to/corpus", "mcp"]
    }
  }
}
```

With Claude Code: `claude mcp add harness-reference -- npx -y @osdlc/corpus-query -C /path/to/corpus mcp`.

| Tool | Input | Answers |
| --- | --- | --- |
| `describe_corpus` | none | the corpus, its types with record counts, the corpora it names |
| `describe_type` | `type`, `corpus?` | each field: kind, description, allowed values, what it references |
| `find_records` | a `Query` | `total`, the page of records, `next` |
| `get_record` | `record`, `body?`, `bodyOffset?`, `bodyLimit?` | the record, its references, its first 20 backlinks |
| `get_references` | `record`, `offset?`, `limit?` | what the record refers to |
| `get_backlinks` | `record`, `offset?`, `limit?` | what refers to the record |
| `traverse` | `record`, `direction?`, `via?`, `links?`, `depth?`, `limit?` | `nodes`, `edges`, `truncated` |
| `count_facets` | a `FacetQuery` | the values of each field, with counts |

Each tool's input is a JSON Schema with a description of every argument, and the server's
instructions name the corpus and its types, so an agent needs no other documentation. Each tool
is marked read-only.

Answers are small by default, and each says how to get more:

- `find_records` returns 20 records, each as its `ref`, its `title` when that is not the id, and
  a `snippet` with `search`. Name `fields` for data, pass `body: true` for bodies, raise `limit`
  (at most 200), or page with `offset` from `next`.
- `get_record` returns the first 8000 characters of the body with `bodyLength` and `bodyNext`,
  the `bodyOffset` of the rest. It returns the first 20 backlinks with `backlinksTotal`;
  `get_backlinks` pages through them.
- A record inside any result is cut to `ref`, `title` when that is not the id, and `identity`
  when it has one. The type and the id are the parts of the `ref`.
- A query error is a tool result with `isError` whose text is the `QueryError` message, which
  lists what exists, so the agent can correct the call.

Each record of the loaded corpus is also a resource, `corpus://<corpus name>/<type>/<id>`, read
as the record's JSON. The list is paged 100 at a time.

In code, `createMcpServer(model, options?)` returns the SDK's `Server`, not yet connected.
`serveMcpStdio(model, options?)` serves stdio until the client goes away. `mcpTools()` lists the
tools. `McpOptions`: `name`, `defaultLimit` (20), `maxLimit` (200) and `bodyLimit` (8000).

For MCP over streamable HTTP, `corpus-query serve --mcp` adds the endpoint `/mcp` beside the REST
routes. `createMcpHandler(model, options?)` is that endpoint as a `(Request) => Response`
function. It keeps no session and answers in JSON.

## Performance

Measured on the harness reference, `packages/corpora/harness-reference/corpus` in this
repository: 2,417 records, 5.6 MB as JSON. One run on an Apple M-series laptop, Node 24.

| Step | Time |
| --- | --- |
| Load the corpus (`openCorpus`) | 570 to 760 ms |
| `describe` | 2 ms |
| `find` with two filters, one on a reference field, over 824 records | 0.5 ms |
| First `search` (lowercases every record) | 5 ms |
| Later searches | 1 ms |
| `facets` of three fields over 824 records | 0.7 ms |
| `get` a record with 254 backlinks | 0.1 ms |
| REST `GET /records` with two filters, on a warm connection | 0.8 ms |
| MCP `find_records` with a search, in process | 1 ms |
| A whole `corpus-query find` run, load included | 0.8 s |

## Limits

- Filters are joined with "and". There is no "or" between fields; `field=a,b` is the one "or".
- Search is a substring scan: no stemming, no fuzzy match, no ranking by how rare a term is. It
  is fast to a few tens of thousands of records. A larger corpus needs an index.
- A filter checks top-level reference fields against their targets. A link inside an object or
  a list of objects is compared as text.
- The command loads the corpus on every run. There is no cache on disk.
- Nothing writes. To change a corpus, edit its files.
- `watch` loads the whole corpus again on a change.
- The REST server has no authentication and no rate limit.

In the [Markdown Ecosystem Plan](../../../docs/planning/markdown/milestones/m-query.md) this
package is the query layer of tasks 15 and 72: one query layer over the corpus model that spans
referenced corpora, names a referenced type by its namespace path and gives each result its
identity. Task 15 also names a move of markdown-vault-query, which decision D19 leaves where it
is; nothing of it is here. Task 16, the JSON and SQLite build, is not here either:
`JSON.stringify(loadCorpus(root))` is the JSON build this package reads.

## Stability

This is a 0.x package, built on the experimental `loadCorpus` of `@osdlc/corpus-schema`. Every
export is experimental: a minor release may change or remove it, and the CHANGELOG says so. The
wording of an error message may change in any release; its `code` is the stable part.

The experimental exports of `@osdlc/corpus-query`:

`CorpusLink`, `CorpusQuery`, `CorpusSummary`, `Facet`, `FacetQuery`, `FacetResult`,
`FieldDescription`, `FieldValue`, `Filter`, `FilterOp`, `IncomingReference`, `OutgoingReference`,
`Query`, `QueryError`, `QueryErrorCode`, `QueryResult`, `ReadOptions`, `RecordDetail`,
`RecordHeader`, `RecordHit`, `RecordRef`, `TraverseOptions`, `TraverseResult`, `TypeDescription`,
`TypeSummary`, `corpusQuery`, `countFacets`, `describeCorpus`, `describeType`, `findRecords`,
`formatFilter`, `getBacklinks`, `getReferences`, `listTypes`, `parseFilter`, `parseTerm`,
`readRecord`, `traverse`

The experimental exports of `@osdlc/corpus-query/node`:

`RestServer`, `ServeOptions`, `findCorpusRoot`, `loadCorpusAt`, `openCorpus`, `serveRest`

The experimental exports of `@osdlc/corpus-query/rest`:

`RestHandler`, `RestOptions`, `createRestHandler`, `queryFromParams`

The experimental exports of `@osdlc/corpus-query/mcp`:

`McpOptions`, `createMcpHandler`, `createMcpServer`, `mcpTools`, `serveMcpStdio`

The experimental exports of `@osdlc/corpus-query/cli`:

`CliOptions`, `createApp`, `runCli`

A test compares each list with the `@experimental` tags in the source.

## Runtimes and platforms

Node.js 22 or later, ESM only. The core and the REST handler use only web-standard APIs, so they
also run in a browser, a worker, Deno and Bun. The tests run on Linux and macOS. Windows is not
tested.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
