/** The OpenAPI description of the REST routes, and the JSON Schemas the MCP tools share with it. */
import type { LoadedCorpus } from '@osdlc/corpus-schema'

type Schema = Record<string, unknown>

const FILTER_HELP =
  'A condition as a term: field, operator, value. Operators: = (equal; a comma makes a list: one of), ' +
  '!= (not equal; with a list: none of), ~ (contains, any case), !~, >, >=, <, <=. ' +
  '"field=" holds when the field has no value and "field!=" when it has one. A field is a data ' +
  'field, a path into one (scope.since), or a record fact (@id, @type, @title, @path, @corpus, ' +
  '@body). On a reference field the value names the record pointed at, by id or <type>/<id>. ' +
  'Examples: status=current, strength=strong,moderate, title~hook, decided>=2026-01-01, ' +
  'harness=Claude Code.'

/** The JSON Schema of one item of `where`: a term, or the same condition as an object. */
export const WHERE_ITEM: Schema = {
  anyOf: [
    { type: 'string', description: FILTER_HELP },
    {
      type: 'object',
      required: ['field'],
      additionalProperties: false,
      properties: {
        field: { type: 'string' },
        op: {
          enum: [
            'eq',
            'ne',
            'in',
            'nin',
            'contains',
            'ncontains',
            'gt',
            'gte',
            'lt',
            'lte',
            'exists',
          ],
          default: 'eq',
        },
        value: { description: 'A list for in and nin, a boolean for exists.' },
      },
    },
  ],
}

const strings = (description: string): Schema => ({
  anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  description,
})

/** The properties that select records, shared by a query and a facet query. */
export const SELECT_PROPERTIES: Record<string, Schema> = {
  type: strings(
    'The type or types to read, by name. <prefix>/<type> names a type of a referenced corpus. Absent: every type.',
  ),
  corpus: {
    type: 'string',
    description:
      'The key of a referenced corpus to read, or * for every corpus of the graph. Absent: the loaded corpus.',
  },
  where: {
    anyOf: [
      { type: 'string', description: 'Terms separated by spaces. Quote a value with a space.' },
      { type: 'array', items: WHERE_ITEM },
    ],
    description: `Conditions that must all hold. ${FILTER_HELP}`,
  },
  search: {
    type: 'string',
    description:
      'Words every match must hold, in its title, id, string fields or body. Quote a phrase. Results are ordered best first.',
  },
}

/** The JSON Schema of a `Query`. */
export const QUERY_SCHEMA: Schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...SELECT_PROPERTIES,
    sort: strings('Fields to sort by, first one first. A leading - sorts descending.'),
    limit: { type: 'integer', minimum: 0, description: 'How many records to return.' },
    offset: { type: 'integer', minimum: 0, description: 'How many matches to skip.' },
    fields: strings('The data fields to return with each record: names, paths, or * for all.'),
    body: { type: 'boolean', description: "Whether to return each record's Markdown body." },
  },
}

/** The JSON Schema of a `FacetQuery`. */
export const FACET_SCHEMA: Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['fields'],
  properties: {
    ...SELECT_PROPERTIES,
    fields: strings('The fields to count the values of.'),
    top: { type: 'integer', minimum: 0, description: 'How many values to return for each field.' },
  },
}

const ERROR: Schema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
}

const param = (name: string, description: string, schema: Schema = { type: 'string' }): Schema => ({
  name,
  in: 'query',
  description,
  schema,
})
const inPath = (name: string): Schema => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
})

const answers = (description: string): Schema => ({
  '200': { description, content: { 'application/json': { schema: { type: 'object' } } } },
  '400': {
    description: 'The query cannot run. The message says what exists.',
    content: { 'application/json': { schema: ERROR } },
  },
})
const found = (description: string): Schema => ({
  ...answers(description),
  '404': { description: 'No such record.', content: { 'application/json': { schema: ERROR } } },
})

const CORPUS = param('corpus', 'The key of a referenced corpus.')
const SELECT = [
  param('type', 'A type name. May repeat.'),
  param('corpus', 'The key of a referenced corpus, or * for every corpus.'),
  param('where', `One term. May repeat. ${FILTER_HELP}`),
  param('q', 'A whole filter: terms separated by spaces. In place of where.'),
  param('search', 'Words every match must hold.'),
]
const RECORD = [inPath('type'), inPath('id'), CORPUS]

/** An OpenAPI 3.1 description of the routes `createRestHandler` serves for `model`. */
export function openApi(model: LoadedCorpus, basePath: string): Schema {
  const get = (summary: string, parameters: Schema[], responses: Schema): Schema => ({
    get: { summary, parameters, responses },
  })
  return {
    openapi: '3.1.0',
    info: {
      title: `${model.name} corpus`,
      version: model.version ?? '0',
      description: `Read-only queries over the corpus-schema corpus '${model.name}'. Types: ${model.types.map((t) => t.name).join(', ')}.`,
    },
    servers: [{ url: basePath === '' ? '/' : basePath }],
    paths: {
      '/': get(
        'The corpus: its types with record counts and the corpora it names.',
        [],
        answers('A corpus summary.'),
      ),
      '/types': get('The types, with record counts.', [CORPUS], answers('A list of types.')),
      '/types/{type}': get(
        'One type: its fields, their allowed values and which are references.',
        [inPath('type'), CORPUS],
        answers('A type description.'),
      ),
      '/records': get(
        'Find records.',
        [
          ...SELECT,
          param('sort', 'Fields to sort by, joined with commas. A leading - sorts descending.'),
          param('limit', 'How many records to return. Default 50.', { type: 'integer' }),
          param('offset', 'How many matches to skip.', { type: 'integer' }),
          param('fields', 'The data fields to return, joined with commas, or * for all.'),
          param('body', "Whether to return each record's Markdown body.", { type: 'boolean' }),
        ],
        answers('total, offset, limit, next and records.'),
      ),
      '/query': {
        post: {
          summary: 'Find records, from a JSON query.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: QUERY_SCHEMA } },
          },
          responses: answers('total, offset, limit, next and records.'),
        },
      },
      '/records/{type}/{id}': get(
        'One record, with what it refers to and what refers to it.',
        [
          ...RECORD,
          param('body', 'false leaves the body out.', { type: 'boolean' }),
          param('references', 'false leaves the references out.', { type: 'boolean' }),
          param('backlinks', 'false leaves the backlinks out.', { type: 'boolean' }),
        ],
        found('A record.'),
      ),
      '/records/{type}/{id}/references': get(
        'What the record refers to.',
        RECORD,
        found('A list.'),
      ),
      '/records/{type}/{id}/backlinks': get('What refers to the record.', RECORD, found('A list.')),
      '/records/{type}/{id}/traverse': get(
        'The records within a few hops.',
        [
          ...RECORD,
          param('direction', 'out follows references, in follows backlinks.', {
            enum: ['out', 'in'],
          }),
          param('via', 'The reference fields to follow, joined with commas.'),
          param('links', 'Whether to follow body links too.', { type: 'boolean' }),
          param('depth', 'How many hops, 1 to 10. Default 1.', { type: 'integer' }),
          param('limit', 'How many records at most. Default 200.', { type: 'integer' }),
        ],
        found('root, nodes, edges and truncated.'),
      ),
      '/facets': {
        ...get(
          'Count the values of fields over the matching records.',
          [
            ...SELECT,
            param('fields', 'The fields to count, joined with commas.'),
            param('top', 'How many values for each field. Default 20.', { type: 'integer' }),
          ],
          answers('total and facets.'),
        ),
        post: {
          summary: 'Count the values of fields, from a JSON facet query.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: FACET_SCHEMA } },
          },
          responses: answers('total and facets.'),
        },
      },
    },
  }
}
