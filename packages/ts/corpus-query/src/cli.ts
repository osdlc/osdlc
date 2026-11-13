/**
 * `@osdlc/corpus-query/cli`: the `corpus-query` command, a command tree on `@osdlc/cli-tool`.
 *
 * The corpus is the folder `-C, --root` names, else the one the app was made for, else the
 * nearest corpus at or above the working directory, else the one corpus below it.
 *
 * Exit codes:
 *
 * - `0`: the command answered. A `find` that matches nothing is an answer.
 * - `1`: the command could not answer from what it found: no corpus, no such record, a record
 *   name that fits more than one record, or a port that is taken.
 * - `2`: the command cannot run as typed: an unknown flag, type, field or corpus key, a filter
 *   term that does not parse, a value the field's schema rules out.
 */
import { fileURLToPath } from 'node:url'

import { EXIT, runMain } from '@osdlc/cli-tool'
import {
  type App,
  CommandError,
  commandKit,
  type CommandContext,
  defineApp,
} from '@osdlc/cli-tool/command'
import type { LoadedCorpus } from '@osdlc/corpus-schema'
import { z } from 'zod'

import {
  countFacets,
  describeCorpus,
  describeType,
  findRecords,
  listTypes,
  type Query,
  QueryError,
  readRecord,
  type RecordHeader,
  traverse,
} from './index.ts'
import { given } from './given.ts'
import { createMcpHandler, serveMcpStdio } from './mcp.ts'
import { loadCorpusAt, serveRest } from './node.ts'
import { VERSION } from './version.generated.ts'

/**
 * Options for `createApp` and `runCli`.
 *
 * @experimental
 */
export interface CliOptions {
  /** The corpus folder to use when `--root` is not given, as a path or a `file:` URL. */
  root?: string | URL
  /** The command's name in help and error lines. Default `corpus-query`. */
  name?: string
}

const GLOBALS = {
  root: {
    kind: 'string',
    short: 'C',
    valueName: 'dir',
    help: 'the corpus folder (default: the corpus the working directory is in)',
  },
} as const

const header = {
  ref: z.string(),
  corpus: z.string(),
  type: z.string(),
  id: z.string(),
  path: z.string(),
  title: z.string(),
}
const Header = z.object(header)
const TypeSummary = {
  corpus: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  records: z.number(),
}
const Via = z.enum(['reference', 'link'])
const Outgoing = z.object({
  via: Via,
  field: z.string().nullable(),
  pointer: z.string().nullable(),
  value: z.unknown(),
  target: Header.nullable(),
  unresolved: z.string().nullable(),
})
const Incoming = z.object({
  via: Via,
  field: z.string().nullable(),
  pointer: z.string().nullable(),
  from: Header,
})

const OP = /[=!~<>]/

/** A table in plain text: columns padded to their widest cell, the last one cut to `width`. */
function table(
  head: readonly string[],
  rows: readonly (readonly string[])[],
  width: number,
): string {
  if (rows.length === 0) return ''
  const cells = [head, ...rows].map((r) => r.map((c) => c.replace(/\s+/g, ' ')))
  const widths = head.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? '').length)))
  const last = widths.length - 1
  const before = widths.slice(0, last).reduce((sum, w) => sum + w + 2, 0)
  // A table wider than the terminal keeps its first columns whole and cuts the last.
  const room = Math.max(12, width - before)
  return cells
    .map((r) =>
      r
        .map((c, i) => {
          if (i < last) return c.padEnd((widths[i] as number) + 2)
          return c.length > room ? `${c.slice(0, room - 1)}…` : c
        })
        .join('')
        .trimEnd(),
    )
    .join('\n')
    .concat('\n')
}

const shown = (value: unknown): string =>
  value === undefined || value === null
    ? ''
    : typeof value === 'string'
      ? value
      : JSON.stringify(value)

function whole(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!/^\d+$/.test(value))
    throw new CommandError(`--${name} needs a whole number, 0 or more`, {
      exit: EXIT.usage,
      code: 'usage',
    })
  return Number(value)
}

/** Run a query function, turning its errors into the command's exit codes. */
function answer<T>(run: () => T): T {
  try {
    return run()
  } catch (e) {
    if (!(e instanceof QueryError)) throw e
    const state = e.code === 'not-found' || e.code === 'ambiguous'
    throw new CommandError(e.message, { exit: state ? EXIT.error : EXIT.usage, code: e.code })
  }
}

/**
 * The `corpus-query` command tree: `describe`, `types`, `type`, `find`, `get`, `refs`,
 * `backlinks`, `traverse`, `facets`, `serve` and `mcp`. Run it with `app.run(argv, ctx)`, or
 * use `runCli` in a bin file.
 *
 * @experimental
 */
export function createApp(options: CliOptions = {}): App {
  const fixed =
    options.root === undefined
      ? undefined
      : options.root instanceof URL
        ? fileURLToPath(options.root)
        : options.root
  const { command } = commandKit({ globals: GLOBALS })

  const load = (globals: { root: string | undefined }, ctx: CommandContext): LoadedCorpus => {
    let model: LoadedCorpus
    try {
      model = loadCorpusAt(globals.root ?? fixed, ctx.cwd)
    } catch (e) {
      throw new CommandError((e as Error).message, {
        code: 'no-corpus',
        hint: 'Name the corpus folder with --root <dir>.',
      })
    }
    if (model.errors.length > 0)
      ctx.warn(
        `the corpus has ${model.errors.length} error(s); run corpus-schema validate to see them`,
      )
    return model
  }

  const select = {
    type: {
      kind: 'list',
      short: 't',
      valueName: 'type',
      help: 'the type or types to read (default: every type)',
    },
    where: {
      kind: 'list',
      short: 'w',
      valueName: 'term',
      commaSeparated: false,
      help: 'a condition such as status=done; repeat it for more',
    },
    search: { kind: 'string', short: 's', valueName: 'words', help: 'words every match must hold' },
    corpus: {
      kind: 'string',
      valueName: 'key',
      help: 'the key of a referenced corpus, or * for every corpus',
    },
  } as const
  const corpusFlag = {
    corpus: { kind: 'string', valueName: 'key', help: 'the key of a referenced corpus' },
  } as const
  const record = [
    {
      name: 'record',
      variadic: true,
      required: true,
      help: 'the record: <type>/<id>, or <type> <id>',
    },
  ] as const

  const describe = command({
    summary: 'the corpus: its types with record counts, and the corpora it names',
    readOnly: true,
    kind: 'corpus',
    output: z.object({
      name: z.string(),
      id: z.string().nullable(),
      identity: z.string().nullable(),
      version: z.string().nullable(),
      level: z.union([z.literal(1), z.literal(2)]).nullable(),
      records: z.number(),
      types: z.array(z.object(TypeSummary)),
      corpora: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          identity: z.string().nullable(),
          version: z.string().nullable(),
          relation: z.enum(['extends', 'references', 'extends and references', 'indirect']),
          records: z.number(),
          types: z.array(z.string()),
        }),
      ),
      errors: z.number(),
      warnings: z.number(),
    }),
    run: ({ globals }, ctx) => describeCorpus(load(globals, ctx)),
    text: (o, ctx) =>
      `${o.name}${o.version === null ? '' : ` ${o.version}`}: ${o.records} records, ${o.types.length} types` +
      `${o.identity === null ? '' : `\n${o.identity}`}\n\n` +
      table(
        ['TYPE', 'RECORDS', 'TITLE', 'DESCRIPTION'],
        o.types.map((t) => [t.name, String(t.records), t.title ?? '', t.description ?? '']),
        ctx.width,
      ) +
      (o.corpora.length === 0
        ? ''
        : `\n${table(
            ['CORPUS', 'NAME', 'RELATION', 'RECORDS', 'TYPES'],
            o.corpora.map((c) => [
              c.key,
              c.name,
              c.relation,
              String(c.records),
              c.types.join(', '),
            ]),
            ctx.width,
          )}`),
  })

  const types = command({
    summary: 'the types, with record counts',
    readOnly: true,
    flags: { corpus: select.corpus },
    output: z.object({ types: z.array(z.object(TypeSummary)) }),
    items: { field: 'types', kind: 'type' },
    run: ({ flags, globals }, ctx) => {
      const model = load(globals, ctx)
      return { types: answer(() => listTypes(model, flags.corpus)) }
    },
    text: (o, ctx) =>
      table(
        ['TYPE', 'RECORDS', 'TITLE', 'DESCRIPTION'],
        o.types.map((t) => [
          t.corpus === '' ? t.name : `${t.corpus}/${t.name}`,
          String(t.records),
          t.title ?? '',
          t.description ?? '',
        ]),
        ctx.width,
      ),
  })

  const type = command({
    summary: 'one type: its fields, their allowed values and which are references',
    readOnly: true,
    flags: corpusFlag,
    positionals: [{ name: 'name', required: true, help: 'the type, or <prefix>/<type>' }],
    output: z.object({
      ...TypeSummary,
      origin: z.enum(['local', 'extends', 'uses']),
      identity: z.string().nullable(),
      chain: z.array(z.string()),
      fields: z.array(
        z.object({
          name: z.string(),
          kind: z.string(),
          description: z.string().nullable(),
          required: z.boolean(),
          format: z.string().nullable(),
          values: z
            .array(
              z.object({
                value: z.unknown(),
                title: z.string().optional(),
                description: z.string().optional(),
              }),
            )
            .nullable(),
          ref: z
            .object({
              types: z.array(z.string()),
              form: z.enum(['link', 'id', 'wikilink']),
              list: z.boolean(),
            })
            .nullable(),
          declaredBy: z.string(),
        }),
      ),
    }),
    run: ({ flags, globals, positionals }, ctx) => {
      const model = load(globals, ctx)
      return answer(() => describeType(model, positionals[0] as string, flags.corpus))
    },
    text: (o, ctx) =>
      `${o.name}${o.title === null ? '' : ` (${o.title})`}: ${o.records} records` +
      `${o.chain.length > 1 ? `, builds on ${o.chain.slice(1).join(', ')}` : ''}` +
      `${o.description === null ? '' : `\n${o.description}`}\n\n` +
      table(
        ['FIELD', 'KIND', 'REQUIRED', 'VALUES OR REFERENCE', 'DESCRIPTION'],
        o.fields.map((f) => [
          f.name,
          f.format === null ? f.kind : `${f.kind} (${f.format})`,
          f.required ? 'yes' : '',
          f.ref !== null
            ? `-> ${f.ref.types.join(', ')}`
            : (f.values ?? []).map((v) => shown(v.value)).join(', '),
          f.description ?? '',
        ]),
        ctx.width,
      ),
  })

  const find = command({
    summary: 'find records by type, conditions and full-text search',
    description:
      'The first word is a type name unless it is a condition. Each condition is a term: a field, an ' +
      'operator and a value. Operators: = (equal; a comma makes a list: one of), != (not equal; with a ' +
      'list: none of), ~ (contains, any case), !~, >, >=, <, <=. "field=" holds when the field has no ' +
      'value and "field!=" when it has one. Quote a term that has a space or one of < > for the shell. ' +
      'A field is a data field, a path into one (scope.since), or a record fact: @id, @type, @title, ' +
      '@path, @corpus, @body. On a reference field the value names the record pointed at, by id or ' +
      '<type>/<id>.',
    readOnly: true,
    flags: {
      ...select,
      sort: {
        kind: 'string',
        valueName: 'fields',
        help: 'fields to sort by, joined with commas; -field is descending',
      },
      limit: {
        kind: 'string',
        short: 'n',
        valueName: 'n',
        help: 'how many records to print (default 50)',
      },
      offset: { kind: 'string', valueName: 'n', help: 'how many matches to skip' },
      fields: {
        kind: 'list',
        short: 'f',
        valueName: 'field',
        help: 'data fields to print with each record; * for all',
      },
      body: { kind: 'boolean', help: "print each record's Markdown body too (with --json)" },
      query: {
        kind: 'string',
        valueName: 'json',
        help: 'the whole query as JSON, in place of the other flags',
      },
    },
    positionals: [
      { name: 'terms', variadic: true, help: 'a type name, then conditions such as status=done' },
    ],
    examples: [
      'find statements status=current "harness=Claude Code" -f strength',
      'find -s "permission mode" -n 5',
      'find documents "title~hooks" --sort -title --json',
    ],
    kind: 'records',
    items: { field: 'records', kind: 'record' },
    output: z.object({
      total: z.number(),
      offset: z.number(),
      limit: z.number(),
      next: z.number().nullable(),
      records: z.array(
        z.object({
          ...header,
          identity: z.string().nullable(),
          data: z.record(z.string(), z.unknown()).optional(),
          body: z.string().nullable().optional(),
          score: z.number().optional(),
          snippet: z.string().optional(),
        }),
      ),
    }),
    run: ({ flags, globals, positionals }, ctx) => {
      const model = load(globals, ctx)
      if (flags.query !== undefined) {
        let query: Query
        try {
          query = JSON.parse(flags.query) as Query
        } catch {
          throw new CommandError('--query is not JSON', { exit: EXIT.usage, code: 'usage' })
        }
        return answer(() => findRecords(model, query))
      }
      const [first, ...rest] = positionals
      const named = first !== undefined && !OP.test(first)
      const terms = named ? rest : positionals
      const stray = terms.find((t) => !OP.test(t))
      if (stray !== undefined)
        throw new CommandError(
          `'${stray}' is not a condition; write <field><op><value>, such as status=done`,
          { exit: EXIT.usage, code: 'usage' },
        )
      const query: Query = given({
        type: [...(named ? [first] : []), ...(flags.type ?? [])],
        corpus: flags.corpus,
        where: [...terms, ...(flags.where ?? [])],
        search: flags.search,
        sort: flags.sort,
        limit: whole('limit', flags.limit),
        offset: whole('offset', flags.offset),
        fields: flags.fields,
        body: flags.body ? true : undefined,
      })
      return answer(() => findRecords(model, query))
    },
    text: (o, ctx) => {
      const fields = [...new Set(o.records.flatMap((r) => Object.keys(r.data ?? {})))]
      const search = o.records.some((r) => r.snippet !== undefined)
      const rows = o.records.map((r) => [
        r.ref,
        ...(r.title === r.id ? [] : [r.title]),
        ...fields.map((f) => shown(r.data?.[f])),
        ...(search ? [r.snippet ?? ''] : []),
      ])
      const titled = o.records.some((r) => r.title !== r.id)
      const head = [
        'RECORD',
        ...(titled ? ['TITLE'] : []),
        ...fields.map((f) => f.toUpperCase()),
        ...(search ? ['MATCH'] : []),
      ]
      // Every row needs the title column when one record has a title of its own.
      const full = titled
        ? o.records.map((r, i) =>
            r.title === r.id
              ? [r.ref, '', ...(rows[i] as string[]).slice(1)]
              : (rows[i] as string[]),
          )
        : rows
      if (o.records.length === 0)
        return `${o.total} records${o.total === 0 ? '' : `; none from offset ${o.offset}`}\n`
      return (
        table(head, full, ctx.width) +
        `\n${o.offset + 1}-${o.offset + o.records.length} of ${o.total} records` +
        `${o.next === null ? '' : `; next page: --offset ${o.next}`}\n`
      )
    },
  })

  const refText = (h: RecordHeader): string => (h.title === h.id ? h.ref : `${h.ref} (${h.title})`)

  const get = command({
    summary: 'one record: its data, body, references and backlinks',
    readOnly: true,
    flags: {
      ...corpusFlag,
      body: { kind: 'boolean', negatable: true, help: 'leave the Markdown body out' },
    },
    positionals: record,
    examples: ['get "statements/Claude Code Hooks"', 'get harnesses "Claude Code" --json'],
    kind: 'record',
    output: z.object({
      ...header,
      identity: z.string().nullable(),
      format: z.enum(['md', 'yaml', 'json']),
      valid: z.boolean(),
      files: z.array(z.string()),
      data: z.record(z.string(), z.unknown()),
      body: z.string().nullable().optional(),
      references: z.array(Outgoing).optional(),
      backlinks: z.array(Incoming).optional(),
    }),
    run: ({ flags, globals, positionals }, ctx) => {
      const model = load(globals, ctx)
      return answer(() => readRecord(model, refOf(positionals, flags.corpus), { body: flags.body }))
    },
    text: (o) => {
      const refs = o.references ?? []
      const back = o.backlinks ?? []
      return (
        `${o.ref}\n${o.title}\n${o.path}${o.valid ? '' : '  (not valid)'}\n\n` +
        `${JSON.stringify(o.data, null, 2)}\n` +
        (typeof o.body === 'string' && o.body.trim() !== '' ? `\n${o.body.trim()}\n` : '') +
        (refs.length === 0
          ? ''
          : `\nRefers to (${refs.length}):\n${refs
              .map(
                (r) =>
                  `  ${r.field ?? 'body'}: ${r.target === null ? `${shown(r.value)} (unresolved: ${r.unresolved})` : refText(r.target)}\n`,
              )
              .join('')}`) +
        (back.length === 0
          ? ''
          : `\nReferred to by (${back.length}):\n${back
              .slice(0, 20)
              .map((b) => `  ${refText(b.from)} (${b.field ?? 'body'})\n`)
              .join(
                '',
              )}${back.length > 20 ? `  … ${back.length - 20} more: corpus-query backlinks\n` : ''}`)
      )
    },
  })

  const refs = command({
    summary: 'what a record refers to',
    readOnly: true,
    flags: corpusFlag,
    positionals: record,
    items: { field: 'references', kind: 'reference' },
    output: z.object({ record: Header, references: z.array(Outgoing) }),
    run: ({ flags, globals, positionals }, ctx) => {
      const model = load(globals, ctx)
      return answer(() => {
        const { references = [], ...rest } = readRecord(model, refOf(positionals, flags.corpus), {
          body: false,
          backlinks: false,
        })
        return { record: Header.parse(rest), references }
      })
    },
    text: (o, ctx) =>
      table(
        ['FIELD', 'RECORD', 'TITLE'],
        o.references.map((r) => [
          r.field ?? '(body)',
          r.target?.ref ?? `${shown(r.value)} (unresolved)`,
          r.target?.title ?? '',
        ]),
        ctx.width,
      ) + `${o.references.length} references from ${o.record.ref}\n`,
  })

  const backlinks = command({
    summary: 'what refers to a record',
    readOnly: true,
    flags: corpusFlag,
    positionals: record,
    items: { field: 'backlinks', kind: 'backlink' },
    output: z.object({ record: Header, backlinks: z.array(Incoming) }),
    run: ({ flags, globals, positionals }, ctx) => {
      const model = load(globals, ctx)
      return answer(() => {
        const { backlinks = [], ...rest } = readRecord(model, refOf(positionals, flags.corpus), {
          body: false,
          references: false,
        })
        return { record: Header.parse(rest), backlinks }
      })
    },
    text: (o, ctx) =>
      table(
        ['RECORD', 'FIELD', 'TITLE'],
        o.backlinks.map((b) => [b.from.ref, b.field ?? '(body)', b.from.title]),
        ctx.width,
      ) + `${o.backlinks.length} backlinks to ${o.record.ref}\n`,
  })

  const walk = command({
    summary: 'the records within a few hops of a record',
    readOnly: true,
    flags: {
      ...corpusFlag,
      in: { kind: 'boolean', help: 'follow what refers to the record, not what it refers to' },
      via: {
        kind: 'list',
        valueName: 'field',
        help: 'the reference field or fields to follow (default: every one)',
      },
      links: { kind: 'boolean', help: 'follow links in Markdown bodies too' },
      depth: {
        kind: 'string',
        short: 'd',
        valueName: 'n',
        help: 'how many hops, 1 to 10 (default 1)',
      },
      limit: {
        kind: 'string',
        short: 'n',
        valueName: 'n',
        help: 'how many records at most (default 200)',
      },
    },
    positionals: record,
    examples: ['traverse "harnesses/Claude Code" --in --via harness --depth 2'],
    kind: 'traverse',
    items: { field: 'nodes', kind: 'node' },
    output: z.object({
      root: Header,
      nodes: z.array(z.object({ ...header, depth: z.number() })),
      edges: z.array(
        z.object({ from: z.string(), to: z.string(), via: Via, field: z.string().nullable() }),
      ),
      truncated: z.boolean(),
    }),
    run: ({ flags, globals, positionals }, ctx) => {
      const model = load(globals, ctx)
      return answer(() =>
        traverse(
          model,
          refOf(positionals, flags.corpus),
          given({
            direction: flags.in ? ('in' as const) : undefined,
            via: flags.via,
            links: flags.links ? true : undefined,
            depth: whole('depth', flags.depth),
            limit: whole('limit', flags.limit),
          }),
        ),
      )
    },
    text: (o, ctx) =>
      table(
        ['DEPTH', 'RECORD', 'TITLE'],
        o.nodes.map((n) => [String(n.depth), n.ref, n.title]),
        ctx.width,
      ) +
      `${o.nodes.length} records, ${o.edges.length} edges from ${o.root.ref}` +
      `${o.truncated ? '; cut at the limit, raise --limit for more' : ''}\n`,
  })

  const facets = command({
    summary: 'count the values of fields over the matching records',
    readOnly: true,
    flags: {
      ...select,
      top: { kind: 'string', valueName: 'n', help: 'how many values for each field (default 20)' },
    },
    positionals: [{ name: 'field', variadic: true, required: true, help: 'the fields to count' }],
    examples: [
      'facets status strength -t statements',
      'facets harness -t statements -w status=current',
    ],
    output: z.object({
      total: z.number(),
      facets: z.array(
        z.object({
          field: z.string(),
          distinct: z.number(),
          missing: z.number(),
          values: z.array(z.object({ value: z.unknown(), count: z.number() })),
        }),
      ),
    }),
    run: ({ flags, globals, positionals }, ctx) => {
      const model = load(globals, ctx)
      return answer(() =>
        countFacets(
          model,
          given({
            type: flags.type,
            corpus: flags.corpus,
            where: flags.where,
            search: flags.search,
            fields: positionals,
            top: whole('top', flags.top),
          }),
        ),
      )
    },
    text: (o, ctx) =>
      o.facets
        .map(
          (f) =>
            `${f.field}: ${f.distinct} values over ${o.total} records` +
            `${f.missing === 0 ? '' : `, ${f.missing} without one`}\n` +
            table(
              ['COUNT', 'VALUE'],
              f.values.map((v) => [String(v.count), shown(v.value)]),
              ctx.width,
            ) +
            (f.distinct > f.values.length ? `… ${f.distinct - f.values.length} more: --top\n` : ''),
        )
        .join('\n'),
  })

  const serve = command({
    summary: 'serve the corpus over HTTP: a read-only REST API',
    description:
      'Routes: GET / (the corpus), /types, /types/<type>, /records (find, with the flags of find as ' +
      'parameters), /records/<type>/<id>, and under it /references, /backlinks and /traverse, ' +
      '/facets, and /openapi.json. POST /query and POST /facets take a JSON query. It binds ' +
      '127.0.0.1 unless --host says otherwise, and runs until it is stopped.',
    interactive: true,
    flags: {
      port: {
        kind: 'string',
        short: 'p',
        valueName: 'n',
        default: '4010',
        help: 'the port; 0 for any free one',
      },
      host: {
        kind: 'string',
        valueName: 'address',
        default: '127.0.0.1',
        help: 'the address to bind',
      },
      cors: {
        kind: 'string',
        valueName: 'origin',
        help: 'answer cross-origin requests from this origin; * for any',
      },
      watch: { kind: 'boolean', help: 'load the corpus again when its files change' },
      mcp: { kind: 'boolean', help: 'also serve MCP over streamable HTTP at /mcp' },
    },
    async run({ flags, globals }, ctx) {
      const port = Number(flags.port)
      if (!/^\d+$/.test(flags.port) || port > 65535) {
        ctx.io.stderr(`${ctx.app.name}: --port needs a number from 0 to 65535\n`)
        return EXIT.usage
      }
      const model = load(globals, ctx)
      const mcp = flags.mcp ? createMcpHandler(() => server.corpus()) : undefined
      const server = await serveRest(flags.watch ? model.root : model, {
        host: flags.host,
        port,
        watch: flags.watch,
        ...(flags.cors === undefined ? {} : { cors: flags.cors === '*' ? true : flags.cors }),
        ...(mcp === undefined
          ? {}
          : {
              before: (request) =>
                new URL(request.url).pathname === '/mcp' ? mcp(request) : undefined,
            }),
        log: (line) => ctx.note(line),
      })
      ctx.io.stdout(
        `${ctx.app.name}: ${model.name}, ${model.records.length} records\n` +
          `  rest   ${server.url}\n` +
          (flags.mcp ? `  mcp    ${server.url}/mcp\n` : '') +
          `  try    curl '${server.url}/records?limit=3'\n` +
          `  stop   Ctrl-C\n`,
      )
      await new Promise<void>((resolve) => {
        if (ctx.signal.aborted) resolve()
        ctx.signal.addEventListener('abort', () => resolve(), { once: true })
      })
      await server.close()
      return EXIT.ok
    },
  })

  const mcp = command({
    summary: 'serve the corpus to an agent over MCP (stdio)',
    description:
      'Tools: describe_corpus, describe_type, find_records, get_record, get_references, ' +
      'get_backlinks, traverse and count_facets. Each record is also a resource. stdout carries ' +
      'only the protocol. For MCP over HTTP, use serve --mcp.',
    interactive: true,
    async run({ globals }, ctx) {
      const model = load(globals, ctx)
      ctx.note(`serving ${model.name}, ${model.records.length} records, over MCP`)
      await serveMcpStdio(model, { signal: ctx.signal })
      return EXIT.ok
    },
  })

  return defineApp({
    name: options.name ?? 'corpus-query',
    version: VERSION,
    summary: 'query a corpus-schema corpus: from the command line, over REST, or over MCP',
    globals: GLOBALS,
    commands: {
      describe,
      types,
      type,
      find,
      get,
      refs,
      backlinks,
      traverse: walk,
      facets,
      serve,
      mcp,
    },
  })
}

/** The record the words of a command line name: `<type>/<id>`, or `<type> <id>`. */
function refOf(words: readonly string[], corpus: string | undefined): string {
  const ref = words.join('/')
  return corpus === undefined || corpus === '' ? ref : `${corpus}/${ref}`
}

/**
 * Run the `corpus-query` command on the process's own arguments and streams, and set its exit
 * code. For a bin file of a corpus package:
 *
 * ```js
 * #!/usr/bin/env node
 * import { runCli } from '@osdlc/corpus-query/cli'
 * await runCli({ root: new URL('../corpus/', import.meta.url), name: 'my-corpus' })
 * ```
 *
 * @experimental
 */
export async function runCli(options: CliOptions = {}): Promise<void> {
  const app = createApp(options)
  await runMain(app.main, { name: app.name, version: VERSION })
}
