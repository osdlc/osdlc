import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { CorpusSiteConfigError, type CorpusSiteConfig } from '../src/config.ts'
import { matrixData, relatedTables, searchData, typeData } from '../src/data.ts'
import type { DataTreeObject } from '../src/data-types.ts'
import { backlinkGroups, displayPath, fieldSections, toTree } from '../src/display.ts'
import { filterRecords } from '../src/filter.ts'
import { recordBySlug, recordPaths, viewBySlug } from '../src/routes.ts'
import { prepareSearch, search, searchWords } from '../src/search.ts'
import { loadSite, valueAt, type Site } from '../src/site.ts'
import { formatState, parseState } from '../src/url-state.ts'
import { looksLikeCode, oneLine, treeText } from '../src/value-text.ts'
import { exampleSite } from './helpers.ts'

// A corpus of questions, tools and answers. A question holds a JSON Schema for its answers.
const root = mkdtempSync(join(tmpdir(), 'corpus-site-views-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const file = (path: string, text: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
const answer = (tool: string, question: string, state: string, value: string): string =>
  `---\ntool: "[${tool}](../tools/${tool}.md)"\nquestion: "[${question}](../questions/${question.replaceAll(' ', '%20')}.md)"\nstate: ${state}\nvalue:\n${value}\nsources:\n  - items: ["[${question}](../questions/${question.replaceAll(' ', '%20')}.md)"]\n---\n`

file('quiz.corpus-schema.md', '---\ncorpus-schema: 0\n---\n\n# Quiz\n')
file(
  'questions/questions.schema.md',
  '---\ntype: object\nrequired: [ask, area, shape]\nproperties:\n  ask: { type: string }\n  area: { type: string }\n  shape: { type: object }\n---\n',
)
file(
  'questions/Run syntax.md',
  '---\nask: What a user types to run it.\narea: use\nshape:\n  type: object\n  properties:\n    syntax: { title: Typed as, description: What the user types. }\n    cli_only: { description: Whether it works only in the terminal. }\n---\n',
)
file(
  'questions/Config file.md',
  '---\nask: Where the settings live.\narea: setup\nshape: { type: object }\n---\n',
)
file('tools/tools.schema.md', '---\ntype: object\nproperties:\n  maker: { type: string }\n---\n')
file('tools/Alpha.md', '---\nmaker: One\n---\n')
file('tools/Beta.md', '---\nmaker: Two\n---\n')
file('tools/Gamma.md', '---\nmaker: Two\n---\n')
file(
  'answers/answers.schema.md',
  '---\ntype: object\nrequired: [tool, question, state]\nproperties:\n  tool: { type: string, x-ref: tools }\n  question: { type: string, x-ref: questions }\n  state: { enum: [current, old] }\n  value: { type: [object, string] }\n  sources: { type: array, items: { type: object, properties: { items: { type: array, items: { type: string } } } } }\n---\n',
)
file(
  'answers/Alpha run.md',
  answer('Alpha', 'Run syntax', 'current', '  syntax: /go\n  cli_only: true'),
)
file('answers/Alpha run old.md', answer('Alpha', 'Run syntax', 'old', '  syntax: "!go"'))
file(
  'answers/Beta run.md',
  answer(
    'Beta',
    'Run syntax',
    'current',
    '  syntax: $go\n  also: pick it from the menu\n  extra: { a: 1, b: [x, y] }',
  ),
)
file(
  'answers/Alpha config.md',
  answer('Alpha', 'Config file', 'current', '  path: ~/.alpha/config.toml'),
)

const config: CorpusSiteConfig = {
  searchSynonyms: [['call', 'run']],
  types: {
    answers: {
      summary: '{value}',
      columns: ['title', 'value', 'state'],
      filters: ['state', 'tool'],
      defaultFilters: { state: 'current' },
      fields: { value: { label: 'Answer', keysFrom: { ref: 'question', schemaAt: 'shape' } } },
      views: [
        {
          kind: 'matrix',
          label: 'Compare',
          slug: 'compare',
          rows: 'question',
          columns: 'tool',
          cell: 'value',
          where: { state: 'current' },
          groupRowsBy: 'area',
          rowSummary: '{ask}',
        },
      ],
    },
    questions: {
      summary: '{ask}',
      searchWeight: 3,
      columns: ['title', 'area', 'answered'],
      derived: {
        answered: {
          label: 'Tools answered',
          count: {
            from: 'answers',
            via: 'question',
            where: { state: 'current' },
            distinct: 'tool',
          },
        },
      },
      related: [
        {
          label: 'Across tools',
          from: 'answers',
          via: 'question',
          where: { state: 'current' },
          columns: ['tool', 'value', 'tool.maker', 'sources.items'],
          sort: 'tool',
        },
      ],
    },
    tools: {
      related: [
        {
          label: 'Answers',
          from: 'answers',
          via: 'tool',
          where: { state: 'current' },
          columns: ['title', 'value'],
          groupBy: 'question.area',
        },
      ],
    },
  },
}
const quiz = (over: CorpusSiteConfig = config): Site => loadSite(root, { config: over })
const site = quiz()
const record = (type: string, slug: string) => recordBySlug(site, type, slug)!
const entries = (tree: unknown) => (tree as DataTreeObject).entries

describe('text for values', () => {
  test('oneLine writes an object as pairs, a list with commas and a boolean in words', () => {
    expect(oneLine({ syntax: '/go', cli_only: true, none: null })).toBe(
      'Syntax: /go · Cli only: Yes',
    )
    expect(oneLine(['a', 'b', 3])).toBe('a, b, 3')
    expect(oneLine({ modes: [{ name: 'ask' }, { name: 'plan' }] })).toBe(
      'Modes: Name: ask, Name: plan',
    )
    expect(oneLine('[Alpha](../tools/Alpha.md)')).toBe('Alpha')
    expect(oneLine('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`)
  })

  test('looksLikeCode tells a flag, a path and a command from words', () => {
    for (const code of [
      '/acme:review',
      '--resume <id>',
      'CLAUDE_HOME',
      'workspace-write',
      '~/.x/y.toml',
      '$name',
    ])
      expect(looksLikeCode(code), code).toBe(true)
    for (const words of ['partial', 'pick it from the menu', 'Yes', 'https://example.com/a'])
      expect(looksLikeCode(words), words).toBe(false)
  })

  test('valueAt steps through a list to what each item holds', () => {
    expect(
      valueAt({ lines: [{ items: ['a', 'b'] }, { items: ['c'] }, {}] }, 'lines.items'),
    ).toEqual(['a', 'b', 'c'])
    expect(valueAt({ lines: [] }, 'lines.items')).toBeUndefined()
  })
})

describe('object values', () => {
  test('keysFrom labels the keys from the schema another record holds', () => {
    const tree = toTree(displayPath(site, record('answers', 'alpha-run'), 'value'))
    expect(entries(tree)).toEqual([
      { label: 'Typed as', value: { text: '/go', code: true }, help: 'What the user types.' },
      { label: 'Cli only', value: 'Yes', help: 'Whether it works only in the terminal.' },
    ])
    expect(treeText(tree)).toBe('Typed as: /go · Cli only: Yes')
    // A key the schema does not name gets its name in words, and no help.
    const beta = entries(toTree(displayPath(site, record('answers', 'beta-run'), 'value'), false))
    expect(beta.map((e) => e.label)).toEqual(['Typed as', 'Also', 'Extra'])
    expect(beta[0]).toEqual({ label: 'Typed as', value: { text: '$go', code: true } })
    expect(treeText(beta[2]!.value, false)).toBe('A: 1; B: x, y')
  })

  test('the record page draws the object with the same labels', () => {
    const row = fieldSections(site, record('answers', 'alpha-run'))
      .flatMap((s) => s.rows)
      .find((r) => r.field.name === 'value')!
    expect(row.field.label).toBe('Answer')
    expect(row.value).toMatchObject({
      kind: 'object',
      entries: [{ label: 'Typed as' }, { label: 'Cli only' }],
    })
  })

  test('an object column is a tree in the type data file, searched and sorted as text', () => {
    const data = typeData(site, site.type('answers')!)
    const field = data.fields.find((f) => f.name === 'value')!
    expect(field).toMatchObject({ label: 'Answer', kind: 'json', tree: true, column: true })
    const row = data.records.find((r) => r.id === 'Alpha run')!
    // The file leaves the help out, and the summary, which would repeat the column.
    expect(row.values['value']).toEqual({
      entries: [
        { label: 'Typed as', value: { text: '/go', code: true } },
        { label: 'Cli only', value: 'Yes' },
      ],
    })
    expect(row.summary).toBeNull()
    const state = {
      query: 'menu',
      filters: {},
      sort: { field: 'value', descending: false },
      page: 1,
    }
    expect(filterRecords(data, state).map((r) => r.id)).toEqual(['Beta run'])
    expect(filterRecords(data, { ...state, query: '' }).map((r) => r.id)).toEqual([
      'Alpha config',
      'Alpha run old',
      'Beta run',
      'Alpha run',
    ])
  })

  test('a template place that names an object gives it on one line', () => {
    expect(record('answers', 'alpha-run').summary).toBe('Syntax: /go · Cli only: Yes')
  })
})

describe('derived fields', () => {
  test('a count of the records that point at a record is a number field', () => {
    const data = typeData(site, site.type('questions')!)
    expect(data.fields.find((f) => f.name === 'answered')).toMatchObject({
      label: 'Tools answered',
      kind: 'number',
    })
    expect(Object.fromEntries(data.records.map((r) => [r.id, r.values['answered']]))).toEqual({
      'Config file': 1,
      'Run syntax': 2,
    })
  })
})

describe('related tables', () => {
  test('lists the records that point at a record, with the chosen columns', () => {
    const [table] = relatedTables(site, record('questions', 'run-syntax'))
    expect(table).toMatchObject({ label: 'Across tools', total: 2, showTitle: false })
    expect(table!.table.columns).toEqual(['tool', 'value', 'tool.maker', 'sources.items'])
    expect(table!.table.fields.map((f) => [f.label, f.tree ?? false])).toEqual([
      ['Tool', false],
      ['Answer', true],
      ['Maker', true],
      ['Items', true],
    ])
    const rows = table!.groups[0]!.rows
    expect(table!.groups[0]!.label).toBeNull()
    expect(rows.map((r) => r.id)).toEqual(['Alpha run', 'Beta run'])
    expect(rows[0]!.url).toBe('/answers/alpha-run/')
    expect(rows[0]!.values['tool']).toBe('tools/alpha')
    expect(table!.table.targets['tools/alpha']).toEqual({ title: 'Alpha', url: '/tools/alpha/' })
    // A path through a reference, and a link inside a list of objects.
    expect(rows[1]!.values['tool.maker']).toBe('Two')
    expect(rows[0]!.values['sources.items']).toEqual([
      { text: 'Run syntax', url: '/questions/run-syntax/' },
    ])
    // The table keeps what each key means, for a tooltip.
    expect(entries(rows[0]!.values['value'])[0]!.help).toBe('What the user types.')
  })

  test('groups the rows, and leaves the listed records out of the backlinks', () => {
    const alpha = record('tools', 'alpha')
    const [table] = relatedTables(site, alpha)
    expect(table!.showTitle).toBe(true)
    expect(table!.groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['setup', ['Alpha config']],
      ['use', ['Alpha run']],
    ])
    // The old answer is not in the table, so it stays a backlink.
    expect(backlinkGroups(site, alpha).flatMap((g) => g.records.map((r) => r.record.id))).toEqual([
      'Alpha run old',
    ])
    expect(relatedTables(site, record('tools', 'gamma'))).toEqual([])
  })
})

describe('matrix views', () => {
  const view = site.views()[0]!

  test('a view has a page under its type, and no record takes its path', () => {
    expect(view.url).toBe('/answers/compare/')
    expect(viewBySlug(site, 'answers', 'compare')).toBe(view)
    expect(recordPaths(site)).toContainEqual({ params: { type: 'answers', record: 'compare' } })
    file('answers/Compare.md', answer('Gamma', 'Config file', 'old', '  path: x'))
    const again = quiz()
    expect(recordBySlug(again, 'answers', 'compare-2')!.record.id).toBe('Compare')
    rmSync(join(root, 'answers/Compare.md'))
  })

  test('crosses two reference fields, with a row per record and a column per record in use', () => {
    const matrix = matrixData(site, view)
    expect(matrix).toMatchObject({ label: 'Compare', rowLabel: 'Questions', columnLabel: 'Tools' })
    // Gamma has no answer, so it gets no column. A question with none would keep its row.
    expect(matrix.columns.map((c) => c.key)).toEqual(['alpha', 'beta'])
    expect(matrix.groups).toEqual([
      { key: 'setup', label: 'setup', count: 1 },
      { key: 'use', label: 'use', count: 1 },
    ])
    expect(matrix.rows.map((r) => [r.key, r.group, r.summary, r.url])).toEqual([
      ['config-file', 'setup', 'Where the settings live.', '/questions/config-file/'],
      ['run-syntax', 'use', 'What a user types to run it.', '/questions/run-syntax/'],
    ])
    const [config, run] = matrix.rows
    expect(config!.cells.map((c) => c.length)).toEqual([1, 0])
    expect(run!.cells[0]).toEqual([
      {
        url: '/answers/alpha-run/',
        title: 'Alpha run',
        value: {
          entries: [
            { label: 'Typed as', value: { text: '/go', code: true } },
            { label: 'Cli only', value: 'Yes' },
          ],
        },
      },
    ])
  })

  test('a field that is no reference gives a row or a column per value, and a template fills a cell', () => {
    const shelf = exampleSite({
      types: {
        books: {
          views: [
            {
              kind: 'matrix',
              label: 'By status',
              slug: 'by-status',
              rows: 'author',
              columns: 'status',
              cell: '{title} ({year})',
            },
          ],
        },
      },
    })
    const matrix = matrixData(shelf, shelf.views()[0]!)
    // Enum values keep the schema's order.
    expect(matrix.columns.map((c) => c.title)).toEqual([
      'To read',
      'Reading',
      'Finished',
      'Abandoned',
    ])
    expect(matrix.groups).toEqual([])
    const eliot = matrix.rows.find((r) => r.key === 'george-eliot')!
    expect(eliot.cells[2]!.map((c) => c.value)).toContain('Middlemarch (1871)')
  })
})

describe('default filters', () => {
  const fields = typeData(site, site.type('answers')!).fields
  const defaults = site.type('answers')!.defaultFilters

  test('apply until the address names the field, and an empty value removes one', () => {
    expect(typeData(site, site.type('answers')!).defaults).toEqual({ state: ['current'] })
    expect(parseState('', fields, null, defaults).filters).toEqual({
      state: { kind: 'set', values: ['current'] },
    })
    expect(parseState('?state=old', fields, null, defaults).filters['state']).toEqual({
      kind: 'set',
      values: ['old'],
    })
    expect(parseState('?state=', fields, null, defaults).filters).toEqual({})
  })

  test('the address leaves the default out and writes its removal', () => {
    const start = parseState('', fields, null, defaults)
    expect(formatState(start, fields, null, defaults)).toBe('')
    expect(formatState({ ...start, filters: {} }, fields, null, defaults)).toBe('state=')
    const both = {
      ...start,
      filters: { state: { kind: 'set' as const, values: ['current', 'old'] } },
    }
    expect(formatState(both, fields, null, defaults)).toBe('state=current&state=old')
    for (const query of ['', 'state=', 'state=old', 'state=current&state=old&tool=tools%2Falpha'])
      expect(formatState(parseState(query, fields, null, defaults), fields, null, defaults)).toBe(
        query,
      )
  })
})

describe('search', () => {
  const index = prepareSearch(searchData(site))
  const titles = (query: string): string[] => search(index, query).hits.map((h) => h.title)

  test('the words of a question drop its small words, its endings and its punctuation', () => {
    expect(searchWords('How are skills called in the harness?')).toEqual([
      'skill',
      'call',
      'harnes',
    ])
    expect(searchWords('what is it')).toEqual(['what', 'is', 'it'])
  })

  test('a row holds the summary, and a type and a synonym group weigh in', () => {
    expect(index.data.weights).toEqual(index.data.types.map((t) => (t === 'Questions' ? 3 : 1)))
    expect(index.data.synonyms).toEqual([['call', 'run']])
    expect(index.data.docs.find((d) => d[1] === 'Alpha run')![5]).toBe(
      'Syntax: /go · Cli only: Yes',
    )
    // "called" finds "run" through the group, and the question outranks its answers.
    expect(titles('how is it called')[0]).toBe('Run syntax')
    expect(titles('settings')).toEqual(['Config file'])
  })

  test('a hit shows the summary with its matches, and a snippet only for what the summary hides', () => {
    const [hit] = search(index, 'user types').hits
    expect(hit).toMatchObject({
      title: 'Run syntax',
      summary: 'What a user types to run it.',
      snippet: '',
    })
    expect(hit!.summaryMarks.map(([a, b]) => hit!.summary.slice(a, b))).toEqual(['user', 'type'])
    expect(search(index, '/go').hits.map((h) => [h.title, h.summary])).toContainEqual([
      'Alpha run',
      'Syntax: /go · Cli only: Yes',
    ])
  })

  test('a query of three words or more also finds a record that holds most of them', () => {
    expect(titles('settings live nowhere')).toEqual(['Config file'])
    expect(titles('settings nowhere')).toEqual([])
  })
})

describe('the config check names what exists', () => {
  const problems = (types: NonNullable<CorpusSiteConfig['types']>): string[] => {
    try {
      quiz({ types })
    } catch (error) {
      return (error as CorpusSiteConfigError).problems
    }
    return []
  }

  test('keysFrom, derived and related', () => {
    expect(
      problems({
        answers: { fields: { value: { keysFrom: { ref: 'state', schemaAt: '' } } } },
        questions: {
          derived: { n: { label: 'N', count: { from: 'answer', via: 'question' } } },
          related: [
            { label: 'A', from: 'answers', via: 'state', columns: ['tool'] },
            {
              label: 'B',
              from: 'answers',
              via: 'tool',
              columns: ['tool', 'tool.makr'],
              sort: 'value',
              groupBy: 'nope',
            },
          ],
        },
      }),
    ).toEqual([
      'types.answers.fields.value.keysFrom.ref: type "answers" has no reference field "state". Reference fields: tool, question',
      'types.answers.fields.value.keysFrom.schemaAt: name the field that holds the JSON Schema',
      'types.questions.derived.n.count.from: the corpus has no type "answer". Types: answers, questions, tools',
      'types.questions.related[0].via: type "answers" has no reference field "state". Reference fields: tool, question',
      'types.questions.related[1].columns: type "answers" has no field "tool.makr". Fields: tool, question, state, value, sources',
      'types.questions.related[1].groupBy: type "answers" has no field "nope". Fields: tool, question, state, value, sources',
      'types.questions.related[1].sort: "value" is not a column of the table. Columns: title, tool, tool.makr',
    ])
  })

  test('views and default filters', () => {
    expect(
      problems({
        answers: {
          filters: ['state'],
          defaultFilters: { tool: 'x' },
          views: [
            {
              kind: 'matrix',
              label: 'A',
              slug: 'Bad Slug',
              rows: 'question',
              columns: 'tol',
              cell: '{valu}',
              groupRowsBy: 'aria',
            },
            {
              kind: 'grid' as 'matrix',
              label: 'B',
              slug: 'b',
              rows: 'question',
              columns: 'tool',
              cell: 'value',
            },
            {
              kind: 'matrix',
              label: 'C',
              slug: 'c',
              rows: 'state',
              columns: 'tool',
              cell: 'value',
              groupRowsBy: 'area',
            },
          ],
        },
      }),
    ).toEqual([
      'types.answers.defaultFilters: "tool" is not one of the type\'s filters. Filters: state',
      'types.answers.views[0].slug: "Bad Slug" must be lower-case letters, digits and "-"',
      'types.answers.views[0].columns: type "answers" has no field "tol". Fields: tool, question, state, value, sources',
      'types.answers.views[0].cell: type "answers" has no field "valu". Fields: tool, question, state, value, sources',
      'types.answers.views[0].groupRowsBy: type "questions" has no field "aria". Fields: ask, area, shape',
      'types.answers.views[1].kind: "grid" is not a view. Views: matrix',
      'types.answers.views[2].groupRowsBy: needs "rows" to be a reference field. Reference fields: tool, question',
    ])
  })
})
