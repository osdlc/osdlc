/**
 * Unit tests for the typed model, for edge cases the consumption fixtures may not isolate:
 * `unknown` (empty and not), an absent optional section as `undefined`, the three key paths
 * that reach one view, `byAnchor` for a declared and an undeclared anchor, nested `sections`,
 * `text("prose")` against `text("all")`, and `TableView` (iteration, `column`, `find`,
 * `rowPos`). They build the model through the public `read()`, the same path consumers use.
 */
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import type {
  Doc,
  Infer,
  ListItem,
  ListView,
  SectionGroup,
  SectionView,
  TableView,
} from '../../src/index.js'
import {
  contract,
  docRule,
  gap,
  list,
  oneOf,
  optional,
  section,
  sections,
  table,
} from '../../src/index.js'

const PATH = { path: 'model.test.md' }

describe('unknown partitioning', () => {
  test('body.unknown is [] when every section is declared', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [section('Alpha'), section('Beta')]),
    })
    const doc = c.read('## Alpha\n\na\n\n## Beta\n\nb\n', PATH)
    expect((doc.body as any).unknown).toEqual([])
    expect((doc.body as any).alpha.name).toBe('Alpha')
  })

  test('a section matching no declared slot lands in unknown (document order), not a key', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        section('Title'),
        section('Status'),
        gap(),
      ]),
    })
    const doc = c.read('## Title\n\nt\n\n## Status\n\non track\n\n## Risks\n\nthin\n', PATH)
    const body = doc.body as any
    expect(body.unknown.length).toBe(1)
    expect(body.unknown[0].name).toBe('Risks')
    expect(body.unknown[0].text()).toBe('thin')
    // An unknown section is not an enumerable key.
    expect(Object.keys(body)).not.toContain('Risks')
    expect(Object.keys(body)).not.toContain('risks')
    // …but `.section()` (the dynamic/edge accessor) still reaches it.
    expect(body.section('Risks')?.name).toBe('Risks')
  })

  test('unknown and section are non-enumerable; an empty group deep-equals {}', () => {
    const c = contract({ body: sections({}, [section('Solo')]) })
    const doc = c.read('## Solo\n\nx\n\n### Child\n\ny\n', PATH)
    // `Solo` declares no `children`, so the H3 `Child` is undeclared at the nested level and goes
    // to unknown. The nested group still has no enumerable keys.
    const childGroup = (doc.body as any).solo.sections as SectionGroup
    expect(childGroup).toEqual({})
    expect(Object.keys(childGroup)).toEqual([])
    expect(typeof childGroup.section).toBe('function')
    expect(childGroup.unknown.map((s: SectionView) => s.name)).toEqual(['Child'])
  })
})

describe('absence', () => {
  test('a declared optional section that is absent reads as undefined on every path', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Present'),
        optional(section('Maybe')),
      ]),
    })
    const doc = c.read('## Present\n\nhere\n', PATH)
    const body = doc.body as any
    expect(body.maybe).toBeUndefined()
    expect(body['Maybe']).toBeUndefined()
    expect(body.section('Maybe')).toBeUndefined()
    expect(body.maybe?.text()).toBeUndefined()
  })
})

describe('dual-key — three paths, one view', () => {
  test('exact bracket, lowerCamelCase, and .section() reach the same SectionView', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [section('Files to touch')]),
    })
    const doc = c.read('## Files to touch\n\nprose\n', PATH)
    const body = doc.body as any
    const exact = body['Files to touch']
    const camel = body.filesToTouch
    const accessed = body.section('Files to touch')
    expect(exact).toBe(camel)
    expect(accessed).toBe(exact) // a non-promoted prose section: all three are the SectionView
    expect(exact.name).toBe('Files to touch')
  })

  test('a sole content:table() section promotes its key to the TableView; .section() stays the SectionView', () => {
    const c = contract({
      body: sections({}, [section('Files', { content: table({ columns: ['File', 'Kind'] }) })]),
    })
    const doc = c.read('## Files\n\n| File | Kind |\n| - | - |\n| a.ts | add |\n', PATH)
    const body = doc.body as any
    expect(body['Files']).toBe(body.files) // bracket === dotted (the promoted TableView)
    expect(body.files.kind).toBe('table')
    expect(body.files.rowCount).toBe(1)
    expect(body.section('Files').name).toBe('Files') // the underlying SectionView
  })
})

describe('byAnchor — declared vs undeclared', () => {
  const src = [
    '## Decision',
    '',
    '| # | Component |',
    '| - | --------- |',
    '| 1 | parser    |',
    '^components',
    '',
    '| Option | Note |',
    '| ------ | ---- |',
    '| A      | slow |',
    '^extra',
  ].join('\n')
  const build = () =>
    contract({
      body: sections({}, [
        section('Decision', {
          content: { components: table({ anchor: 'components', columns: ['#', 'Component'] }) },
        }),
      ]),
    })

  test('a declared anchor resolves to a kind-discriminated BlockView', () => {
    const doc = build().read(src, PATH)
    const b = (doc as any).byAnchor('components')
    expect(b?.kind).toBe('table')
    expect(b.columns).toEqual(['#', 'Component'])
  })

  test('an undeclared anchor still resolves dynamically (Record<string,string> table)', () => {
    const doc = build().read(src, PATH)
    const b = (doc as any).byAnchor('extra')
    expect(b?.kind).toBe('table')
    expect(b.rows[0].Option).toBe('A')
    // section-scoped byAnchor reaches the same block; a missing id is undefined.
    expect((doc.body as any).decision.byAnchor('extra')?.kind).toBe('table')
    expect((doc.body as any).decision.byAnchor('nope')).toBeUndefined()
    expect((doc as any).byAnchor('nope')).toBeUndefined()
  })

  test('named-table record fields surface each ^anchor-bound table on the SectionView', () => {
    const doc = build().read(src, PATH)
    expect((doc.body as any).decision.components.rowCount).toBe(1)
    expect((doc.body as any).decision.components.column('Component')).toEqual(['parser'])
  })
})

describe('byAnchor — section-level anchor is NOT a block-level hit', () => {
  // A `^section-id` on its own, with no block before it, is a section-level anchor. It is in
  // `node.anchors` (and so in `SectionView.anchors`) but binds to no block, so the block-level
  // `byAnchor` does not find it.
  const src = ['## Notes', '', '^section-id'].join('\n')
  const build = () => contract({ body: sections({}, [section('Notes')]) })

  test('the section id surfaces on SectionView.anchors but byAnchor returns undefined', () => {
    const doc = build().read(src, PATH)
    expect((doc.body as any).notes.anchors).toContain('section-id')
    expect((doc.body as any).notes.byAnchor('section-id')).toBeUndefined()
  })
})

describe('nested sections recursion', () => {
  test('SectionView.sections is the same dual-key shape, partitioned by the children grammar', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Post-mortem', {
          children: sections({ order: 'strict', allowUnknown: false }, [
            section('What worked'),
            section('What did not'),
          ]),
        }),
      ]),
    })
    const doc = c.read(
      '## Post-mortem\n\n### What worked\n\ngood\n\n### What did not\n\nbad\n',
      PATH,
    )
    const nested = (doc.body as any).postMortem.sections
    expect(nested.whatWorked.text()).toBe('good')
    expect(nested['What did not'].text()).toBe('bad')
    expect(nested.section('What worked').name).toBe('What worked')
    expect(nested.unknown).toEqual([])
    // one level deeper still empty-equals {}
    expect(nested.whatWorked.sections).toEqual({})
  })
})

describe('text() scope', () => {
  test("'prose' is own paragraphs (soft wraps collapsed); 'all' is the full subtree", () => {
    const c = contract({
      body: sections({}, [
        section('Intro', {
          children: sections({ order: 'none', allowUnknown: true }, [section('Detail')]),
        }),
      ]),
    })
    const doc = c.read(
      '## Intro\n\nfirst line\nwrapped second line\n\n### Detail\n\ndeep prose\n',
      PATH,
    )
    const intro = (doc.body as any).intro
    // soft wrap collapsed to a space; nested subsection prose excluded
    expect(intro.text()).toBe('first line wrapped second line')
    expect(intro.text('prose')).toBe('first line wrapped second line')
    // "all" pulls the nested subsection prose into the flattened subtree
    expect(intro.text('all')).toContain('deep prose')
    expect(intro.text('all')).toContain('first line wrapped second line')
  })
})

describe('anchors aggregation', () => {
  test('SectionView.anchors gathers section-level + block-bound ^block-ids', () => {
    const c = contract({ body: sections({}, [section('Summary')]) })
    const doc = c.read('## Summary\n\nthe blurb\n^summary\n', PATH)
    // `^summary` binds to the paragraph block in the projection, but it is still the section's id.
    expect((doc.body as any).summary.anchors).toEqual(['summary'])
  })
})

describe('TableView surface', () => {
  const c = contract({
    body: sections({}, [
      section('Files', {
        content: table({
          columns: ['File', 'Kind'],
          cells: { Kind: z.enum(['add', 'modify', 'delete']) },
        }),
      }),
    ]),
  })
  const src = [
    '## Files',
    '',
    '| File       | Kind   |',
    '| ---------- | ------ |',
    '| grammar.ts | add    |',
    '| legacy.ts  | delete |',
  ].join('\n')

  test('iteration yields each row keyed by column name', () => {
    const doc = c.read(src, PATH)
    const files = (doc.body as any).files as TableView
    const seen: string[] = []
    for (const row of files) seen.push((row as any).File)
    expect(seen).toEqual(['grammar.ts', 'legacy.ts'])
  })

  test('column / find / rowPos / rowCount / columns / pos', () => {
    const doc = c.read(src, PATH)
    const files = (doc.body as any).files as TableView
    expect(files.rowCount).toBe(2)
    expect(files.columns).toEqual(['File', 'Kind'])
    expect(files.column('Kind' as any)).toEqual(['add', 'delete'])
    expect((files.find((r: any) => r.Kind === 'delete') as any)?.File).toBe('legacy.ts')
    expect(files.find((_r: any, i: number) => i === 0)).toBeDefined()
    // header line 3, separator 4, row 0 line 5, row 1 line 6
    expect(files.rowPos(0)).toEqual({ line: 5, col: 1 })
    expect(files.rowPos(1)).toEqual({ line: 6, col: 1 })
  })
})

describe('frontmatter and the doc shape', () => {
  test('doc = { frontmatter, body, byAnchor }; frontmatter is the parsed YAML', () => {
    const c = contract({
      frontmatter: z.object({ id: z.string() }).strict(),
      body: sections({ order: 'none', allowUnknown: true }, [section('Body')]),
    })
    const doc = c.read('---\nid: X-1\n---\n\n## Body\n\nx\n', PATH)
    expect((doc.frontmatter as any).id).toBe('X-1')
    expect(typeof (doc as any).byAnchor).toBe('function')
    expect((doc.body as any).body.name).toBe('Body')
  })

  test('frontmatter is the schema output: transforms, defaults and trims apply', () => {
    const c = contract({
      frontmatter: z.object({
        n: z.string().transform(Number),
        d: z.string().default('dflt'),
        t: z.string().trim(),
      }),
    })
    const doc = c.read('---\nn: "42"\nt: "  pad  "\n---\n\n# T\n', PATH)
    expect(doc.frontmatter).toEqual({ n: 42, d: 'dflt', t: 'pad' })
  })

  test('a contract with no frontmatter schema reads the parsed YAML', () => {
    const doc = contract({}).read('---\nn: "42"\n---\n\n# T\n', PATH)
    expect(doc.frontmatter).toEqual({ n: '42' })
  })

  test('byAnchor finds a block under the H1 before the first section', () => {
    const doc = contract({ body: sections({ allowUnknown: true }, [section('S')]) }).read(
      '# T\n\nintro ^a1\n\n## S\n\nx\n',
      PATH,
    )
    expect(doc.byAnchor('a1')?.kind).toBe('paragraph')
  })

  test('a list leaf surfaces as a ListView on SectionView.lists', () => {
    const c = contract({
      body: sections({}, [
        section('Checks', { content: list({ everyItem: 'checkbox', minItems: 1 }) }),
      ]),
    })
    const doc = c.read('## Checks\n\n- [ ] one\n- [x] two\n', PATH)
    const lists = (doc.body as any).checks.lists
    expect(lists.length).toBe(1)
    expect(lists[0].items.length).toBe(2)
    expect(lists[0].kind).toBe('list')
  })
})

describe('typed cell read-back', () => {
  // A transforming cell: `path` or `path#symbol` → an object. The content plane keeps the parsed
  // value and the model reads it back. `Kind` is a plain enum with no transform. `Change`
  // declares no cell, so it stays the raw cell string.
  const Location = z.string().transform((raw) => {
    const [path, symbol] = raw.split('#')
    return symbol ? { path, symbol } : { path }
  })
  const c = contract({
    body: sections({}, [
      section('Files', {
        content: table({
          columns: ['Location', 'Kind', 'Change'],
          cells: { Location, Kind: z.enum(['add', 'modify', 'delete']) },
        }),
      }),
    ]),
  })
  const src = [
    '## Files',
    '',
    '| Location                 | Kind   | Change               |',
    '| ------------------------ | ------ | -------------------- |',
    '| src/core/leaves.ts#table | modify | make table() generic |',
    '| src/core/types.ts        | modify | confirm the Row slot |',
  ].join('\n')

  test('a declared transforming cell reads back its parsed object, sourced from the cache', () => {
    const doc = c.read(src, PATH)
    const files = (doc.body as any).files as TableView
    // row 0: `path#symbol` → { path, symbol }
    expect((files.rows[0] as any).Location).toEqual({
      path: 'src/core/leaves.ts',
      symbol: 'table',
    })
    expect((files.rows[0] as any).Location.path).toBe('src/core/leaves.ts')
    // row 1: bare `path` → { path } (no symbol)
    expect((files.rows[1] as any).Location).toEqual({ path: 'src/core/types.ts' })
  })

  test('an undeclared column stays a raw string; a declared enum cell reads back its string', () => {
    const doc = c.read(src, PATH)
    const files = (doc.body as any).files as TableView
    expect((files.rows[0] as any).Change).toBe('make table() generic')
    expect(typeof (files.rows[0] as any).Change).toBe('string')
    expect((files.rows[0] as any).Kind).toBe('modify')
  })

  test('column()/find() see the typed value for a declared cell', () => {
    const doc = c.read(src, PATH)
    const files = (doc.body as any).files as TableView
    expect(files.column('Location' as any)).toEqual([
      { path: 'src/core/leaves.ts', symbol: 'table' },
      { path: 'src/core/types.ts' },
    ])
    expect((files.find((r: any) => r.Location.path === 'src/core/types.ts') as any)?.Change).toBe(
      'confirm the Row slot',
    )
  })

  test('the typed value rides only on the model; the projected tree rows stay raw strings', () => {
    const result = c.validate(src, PATH)
    // Model: the row exposes the parsed object.
    const files = (result.doc!.body as any).files as TableView
    expect((files.rows[0] as any).Location).toEqual({
      path: 'src/core/leaves.ts',
      symbol: 'table',
    })
    // Tree: the same table block's `rows` are the raw strings. Only the model has the
    // transform output.
    const block = result.tree.root.sections[0]?.blocks.find((b) => b.kind === 'table')
    expect(block?.kind).toBe('table')
    if (block?.kind !== 'table') throw new Error('expected a table block')
    expect(block.rows[0]?.[0]).toBe('src/core/leaves.ts#table') // raw cell, not the parsed object
  })

  test('a table with no declared cells reads back raw-string rows (string default)', () => {
    const plain = contract({
      body: sections({}, [section('Files', { content: table({ columns: ['File', 'Kind'] }) })]),
    })
    const doc = plain.read('## Files\n\n| File | Kind |\n| - | - |\n| a.ts | add |\n', PATH)
    const files = (doc.body as any).files as TableView
    expect(files.rows[0]).toEqual({ File: 'a.ts', Kind: 'add' })
    expect(typeof (files.rows[0] as any).Kind).toBe('string')
  })

  test('an undeclared byAnchor table reads back raw-string rows', () => {
    const c2 = contract({ body: sections({}, [section('Notes')]) })
    const src2 = ['## Notes', '', '| Option | Note |', '| - | - |', '| A | slow |', '^extra'].join(
      '\n',
    )
    const doc = c2.read(src2, PATH)
    const t = (doc as any).byAnchor('extra') as TableView
    expect(t.rows[0]).toEqual({ Option: 'A', Note: 'slow' })
    expect(typeof (t.rows[0] as any).Option).toBe('string')
  })
})

// ── Type-level assertions ───────────────────────────────────────────────────────────
// Type checks, run by `pnpm run typecheck` (`expectTypeOf` does nothing at run time). The row
// read through `read()` and `Infer` is `z.output<cells>` for a declared cell and `string` for an
// undeclared column. `Resolve` forces TypeScript to evaluate the conditional types, so the check
// compares the final row shape and not an unevaluated `RowOf<...>` alias.
type Resolve<T> = T extends infer U ? { [K in keyof U]: U[K] } : never

const LocationCell = z.string().transform((raw) => {
  const [path, symbol] = raw.split('#')
  return symbol ? { path, symbol } : { path }
})
const typedSpec = contract({
  body: sections({}, [
    section('Files', {
      content: table({
        columns: ['Location', 'Kind', 'Change'],
        cells: { Location: LocationCell, Kind: z.enum(['add', 'modify', 'delete']) },
      }),
    }),
  ]),
})

// Through `read()`: `doc.body["Files"]` promotes to the typed `TableView<Row>`.
type ReadRow = Resolve<
  ReturnType<typeof typedSpec.read>['body']['Files'] extends TableView<infer R> ? R : never
>
// Through `Infer`: the same typed row.
type InferRow = Resolve<
  Infer<typeof typedSpec>['body']['Files'] extends TableView<infer R> ? R : never
>

// declared transforming cell → its parsed `z.output`, not a raw string
expectTypeOf<ReadRow['Location']>().toEqualTypeOf<z.output<typeof LocationCell>>()
expectTypeOf<InferRow['Location']>().toEqualTypeOf<z.output<typeof LocationCell>>()
// undeclared column → raw string
expectTypeOf<ReadRow['Change']>().toEqualTypeOf<string>()
expectTypeOf<InferRow['Change']>().toEqualTypeOf<string>()
// the row is not the untyped `Record<string, string>` default
expectTypeOf<ReadRow>().not.toEqualTypeOf<Record<string, string>>()

// Type level: a table with no declared cells keeps the `Record<string, string>` default.
const plainSpec = contract({
  body: sections({}, [section('Files', { content: table({ columns: ['File', 'Kind'] }) })]),
})
type PlainRow =
  ReturnType<typeof plainSpec.read>['body']['Files'] extends TableView<infer R> ? R : never
expectTypeOf<PlainRow>().toEqualTypeOf<Record<string, string>>()

describe('typed list-item read-back', () => {
  // A transforming item: `AC-1: do the thing` → { ref, text }. The content plane keeps the parsed
  // value and the model reads it back. `calls` counts transform runs, to show that reading the
  // view's items does not run the transform again.
  let calls = 0
  const criterion = z.string().transform((raw) => {
    calls++
    const [ref = '', ...rest] = raw.split(':')
    return { ref: ref.trim(), text: rest.join(':').trim() }
  })
  const c = contract({
    body: sections({}, [
      section('Acceptance criteria', { content: list({ everyItem: criterion, minItems: 1 }) }),
    ]),
  })
  const src = ['## Acceptance criteria', '', '- AC-1: scaffold it', '- AC-2: stub it'].join('\n')

  // `body["Acceptance criteria"]` is typed as `SectionView<Item>` (Item = `z.output<everyItem>`),
  // so its `.lists` are `ListView<Item>` with no `as any`. It is read through the exact heading
  // key.
  test('a transforming everyItem reads items back as the parsed value, from the cache', () => {
    const doc = c.read(src, PATH)
    const view = doc.body['Acceptance criteria'].lists[0]
    if (!view) throw new Error('expected a list view')
    expect(view.items).toEqual([
      { ref: 'AC-1', text: 'scaffold it' },
      { ref: 'AC-2', text: 'stub it' },
    ])
    expect([...view]).toEqual(view.items) // iterating the ListView yields the same typed items
  })

  test('the transform is not re-run when reading items back from the view', () => {
    calls = 0
    const doc = c.read(src, PATH)
    const afterValidate = calls // however many times validate ran it (once per item)
    expect(afterValidate).toBeGreaterThan(0) // it ran during validate and stored the values
    const view = doc.body['Acceptance criteria'].lists[0]
    if (!view) throw new Error('expected a list view')
    // Read the items several ways. None runs the transform again: the values are stored.
    void view.items[0]
    void [...view]
    void view.items[1]
    expect(calls).toBe(afterValidate)
  })

  test('typed items ride only on the model; the projected tree items stay raw', () => {
    const result = c.validate(src, PATH)
    const doc = result.doc
    if (!doc) throw new Error('expected a valid doc')
    const view = doc.body['Acceptance criteria'].lists[0]
    expect(view?.items[0]).toEqual({ ref: 'AC-1', text: 'scaffold it' })
    // Tree: the same list block's `items` are the raw strings. Only the model has the
    // transform output.
    const block = result.tree.root.sections[0]?.blocks.find((b) => b.kind === 'list')
    expect(block?.kind).toBe('list')
    if (block?.kind !== 'list') throw new Error('expected a list block')
    expect(block.items[0]?.text).toBe('AC-1: scaffold it') // raw item, not the parsed object
  })

  test('a list with no everyItem reads back raw ListItems (each .text a string)', () => {
    const plain = contract({ body: sections({}, [section('Notes', { content: list({}) })]) })
    const doc = plain.read('## Notes\n\n- a\n- b\n', PATH)
    const view = doc.body.Notes.lists[0]
    if (!view) throw new Error('expected a list view')
    expect(view.items.map((i) => i.text)).toEqual(['a', 'b'])
    expect(typeof view.items[0]?.text).toBe('string')
  })

  test('a checkbox list reads back raw ListItems (the typed store stays empty)', () => {
    const cb = contract({
      body: sections({}, [section('Todo', { content: list({ everyItem: 'checkbox' }) })]),
    })
    const doc = cb.read('## Todo\n\n- [ ] a\n- [x] b\n', PATH)
    const view = doc.body.Todo.lists[0]
    if (!view) throw new Error('expected a list view')
    expect(view.items[0]).toMatchObject({ text: 'a', checked: false })
    expect(view.items[1]).toMatchObject({ text: 'b', checked: true })
  })
})

// ── Type-level assertions ──────────────────────────────────────────
// Type checks: the item read through `read()` and `Infer` is `z.output<everyItem>` for a
// transforming list and the raw `ListItem` otherwise. Unlike a section whose only content is a
// table, this section is not promoted to its block: `doc.body["Acceptance criteria"]` stays a
// `SectionView`, typed as `SectionView<Item>`, so its `.lists` are `ListView<Item>`.
const criterionCell = z.string().transform((raw) => {
  const [ref = '', ...rest] = raw.split(':')
  return { ref: ref.trim(), text: rest.join(':').trim() }
})
const typedListSpec = contract({
  body: sections({}, [
    section('Acceptance criteria', {
      content: list({ everyItem: criterionCell, minItems: 1 }),
    }),
  ]),
})

// Through `read()`: `doc.body["Acceptance criteria"]` refines to `SectionView<Item>`.
type ReadItem = Resolve<
  ReturnType<typeof typedListSpec.read>['body']['Acceptance criteria'] extends SectionView<infer LI>
    ? LI
    : never
>
// Through `Infer`: the same typed item.
type InferItem = Resolve<
  Infer<typeof typedListSpec>['body']['Acceptance criteria'] extends SectionView<infer LI>
    ? LI
    : never
>
// And the `.lists` field carries the typed `ListView<Item>` end to end.
type ListsItem = ReturnType<
  typeof typedListSpec.read
>['body']['Acceptance criteria']['lists'] extends ListView<infer LI>[]
  ? Resolve<LI>
  : never

// a transforming everyItem → its parsed `z.output`, not a raw `ListItem`
expectTypeOf<ReadItem>().toEqualTypeOf<z.output<typeof criterionCell>>()
expectTypeOf<InferItem>().toEqualTypeOf<z.output<typeof criterionCell>>()
expectTypeOf<ListsItem>().toEqualTypeOf<z.output<typeof criterionCell>>()
// the item is not the raw `ListItem`
expectTypeOf<ReadItem>().not.toEqualTypeOf<ListItem>()

// Type level: a list with no `everyItem` keeps the raw `ListItem` default.
const plainListSpec = contract({
  body: sections({}, [section('Notes', { content: list({}) })]),
})
type PlainItem =
  ReturnType<typeof plainListSpec.read>['body']['Notes'] extends SectionView<infer LI> ? LI : never
expectTypeOf<PlainItem>().toEqualTypeOf<ListItem>()
// A `"checkbox"` gate likewise keeps the raw `ListItem`.
const checkboxSpec = contract({
  body: sections({}, [section('Todo', { content: list({ everyItem: 'checkbox' }) })]),
})
type CheckboxItem =
  ReturnType<typeof checkboxSpec.read>['body']['Todo'] extends SectionView<infer LI> ? LI : never
expectTypeOf<CheckboxItem>().toEqualTypeOf<ListItem>()

describe('the model is additive; reading doc never changes findings', () => {
  test('findings are identical whether or not doc is accessed', () => {
    const c = contract({
      frontmatter: z.object({ id: z.string() }).strict(),
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Files', { content: table({ columns: ['File', 'Kind'] }) }),
        optional(section('Notes')),
      ]),
    })
    const src = '---\nid: A-1\n---\n\n## Files\n\n| File | Kind |\n| - | - |\n| a.ts | add |\n'

    const a = c.validate(src, PATH)
    const findingsWithoutDoc = JSON.stringify(a.findings)

    const b = c.validate(src, PATH)
    void b.doc // force the lazy model build
    void (b.doc as any)?.body // and a navigation through it
    const findingsAfterDoc = JSON.stringify(b.findings)

    expect(findingsAfterDoc).toBe(findingsWithoutDoc)
  })
})

describe('repeatable slot → an array in the model', () => {
  test('a prose repeatable slot binds an array of SectionViews, positionally indexable', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Entry', { repeatable: true }),
      ]),
    })
    const doc = c.read(
      ['## Entry', '', 'first', '', '## Entry', '', 'second', '', '## Entry', '', 'third', ''].join(
        '\n',
      ),
      PATH,
    )
    const body = doc.body as any
    // Both key paths reach the same array, of length N, indexed by position.
    expect(Array.isArray(body.entry)).toBe(true)
    expect(body.entry).toBe(body['Entry'])
    expect(body.entry).toHaveLength(3)
    expect(body.entry[0].name).toBe('Entry')
    expect(body.entry[0].text()).toBe('first')
    expect(body.entry[1].text()).toBe('second')
    expect(body.entry[2].text()).toBe('third')
    // `.section(name)` returns the first occurrence's SectionView.
    expect(body.section('Entry').text()).toBe('first')
    // The repeated declared heading is not in unknown.
    expect(body.unknown).toEqual([])
  })

  test('a sole content:table() repeatable slot binds an array of promoted TableViews', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Release', { repeatable: true, content: table({ columns: ['Version', 'Date'] }) }),
      ]),
    })
    const doc = c.read(
      [
        '## Release',
        '',
        '| Version | Date       |',
        '| ------- | ---------- |',
        '| 1.0     | 2026-01-01 |',
        '',
        '## Release',
        '',
        '| Version | Date       |',
        '| ------- | ---------- |',
        '| 2.0     | 2026-02-02 |',
        '',
      ].join('\n'),
      PATH,
    )
    const body = doc.body as any
    expect(body.release).toHaveLength(2)
    expect(body.release[0].kind).toBe('table')
    expect(body.release[0].rows[0].Version).toBe('1.0')
    expect(body.release[1].rows[0].Version).toBe('2.0')
  })

  test('a single occurrence of a repeatable slot is still an array of length 1', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Entry', { repeatable: true }),
      ]),
    })
    const doc = c.read('## Entry\n\nonly\n', PATH)
    const body = doc.body as any
    expect(Array.isArray(body.entry)).toBe(true)
    expect(body.entry).toHaveLength(1)
    expect(body.entry[0].text()).toBe('only')
  })
})

// ── Type-level assertions ─────────────────────────────────────
// Type checks: a `repeatable: true` slot binds an array of the inner value, through both `read()`
// and `Infer`. That is `SectionView[]` for a prose slot and `TableView<Row>[]` for a slot promoted to
// its table. `Resolve` is defined above.
const repeatProseSpec = contract({
  body: sections({ order: 'none', allowUnknown: true }, [section('Entry', { repeatable: true })]),
})
type ReadEntry = ReturnType<typeof repeatProseSpec.read>['body']['Entry']
type InferEntry = Infer<typeof repeatProseSpec>['body']['Entry']
expectTypeOf<ReadEntry>().toEqualTypeOf<SectionView[]>()
expectTypeOf<InferEntry>().toEqualTypeOf<SectionView[]>()

const repeatTableSpec = contract({
  body: sections({ order: 'none', allowUnknown: true }, [
    section('Release', { repeatable: true, content: table({ columns: ['Version', 'Date'] }) }),
  ]),
})
type ReadRelease = ReturnType<typeof repeatTableSpec.read>['body']['Release']
expectTypeOf<ReadRelease>().toEqualTypeOf<TableView<Record<string, string>>[]>()
// A non-repeatable prose slot still binds a single `SectionView`, not an array.
const nonRepeatSpec = contract({
  body: sections({ order: 'none', allowUnknown: true }, [section('Entry')]),
})
type NonRepeatEntry = ReturnType<typeof nonRepeatSpec.read>['body']['Entry']
expectTypeOf<NonRepeatEntry>().toEqualTypeOf<SectionView>()

describe('named-leaf content record binds by the record key', () => {
  test('a record leaf with no `anchor` is exposed under its key, as validation checks it', () => {
    const c = contract({
      body: sections({}, [
        section('Decision', { content: { components: table({ columns: ['#'] }) } }),
      ]),
    })
    const src = '## Decision\n\n| # |\n| - |\n| 1 |\n^components\n'
    expect(c.validate(src, PATH).findings.filter((f) => f.level === 'error')).toEqual([])
    const doc = c.read(src, PATH)
    expect((doc.body as any).decision.components?.rowCount).toBe(1)
  })
})

describe('declared sections named like Object.prototype members', () => {
  test('`Constructor` and `To String` bind their SectionViews, not prototype members', () => {
    const c = contract({
      body: sections({ order: 'none' }, [section('Constructor'), section('To String')]),
    })
    const doc = c.read('## Constructor\n\nnew\n\n## To String\n\ntext\n', PATH)
    const body = doc.body as any
    expect(body.constructor.name).toBe('Constructor')
    expect(body.toString.name).toBe('To String')
    expect(Object.keys(body).sort()).toEqual([
      'Constructor',
      'To String',
      'constructor',
      'toString',
    ])
  })
})

describe('Doc.inlineSpans finds the row by identity', () => {
  test('a repeated row resolves to its own line, not the first equal row', () => {
    const c = contract({
      body: sections({}, [section('Files', { content: table({ columns: ['A', 'B'] }) })]),
    })
    const src = [
      '## Files',
      '',
      '| A | B |',
      '| - | - |',
      '| `a` | b |',
      '| x | y |',
      '| `a` | b |',
    ].join('\n')
    const doc = c.read(src, PATH)
    const files = (doc.body as any).files as TableView
    const first = (doc as any).inlineSpans(files.rows[0], 'A')
    const third = (doc as any).inlineSpans(files.rows[2], 'A')
    expect(first[0].start.line).toBe(5)
    expect(third[0].start.line).toBe(7)
  })

  test('a row whose cells a schema transformed still finds its spans', () => {
    const c = contract({
      body: sections({}, [
        section('Files', {
          content: table({ columns: ['A'], cells: { A: z.string().transform((s) => ({ s })) } }),
        }),
      ]),
    })
    const doc = c.read('## Files\n\n| A |\n| - |\n| `a` |\n', PATH)
    const files = (doc.body as any).files as TableView
    expect((doc as any).inlineSpans(files.rows[0], 'A')).toHaveLength(1)
  })
})

describe('repeatable slot with several spellings', () => {
  test('every spelling joins one array, bound under each spelling seen', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section(['Entry', 'Item'], { repeatable: true }),
      ]),
    })
    const doc = c.read('## Entry\n\na\n\n## Item\n\nb\n\n## Entry\n\nc\n', PATH)
    const body = doc.body as any
    expect(body.entry).toHaveLength(3)
    expect(body.entry.map((v: SectionView) => v.text())).toEqual(['a', 'b', 'c'])
    expect(body.item).toBe(body.entry)
    expect(body.Item).toBe(body.entry)
  })
})

/**
 * A doc rule that keeps the model it is given. `validate().doc` is unset when there is an error,
 * but doc rules still get the model, so a test can read the model of a document with findings.
 */
function captureDoc(): { rule: ReturnType<typeof docRule>; doc: Doc | undefined } {
  const seen: { rule: ReturnType<typeof docRule>; doc: Doc | undefined } = {
    rule: docRule('test/capture-doc', (doc) => {
      seen.doc = doc as Doc
      return []
    }),
    doc: undefined,
  }
  return seen
}

describe('the model binds the section and block the planes check (the shared slot resolver)', () => {
  test("a sole content:table() section promotes the first block's table, with more tables after", () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Files', { content: table({ columns: ['File'] }) }),
      ]),
    })
    const doc = c.read('## Files\n\n| File |\n| - |\n| a.ts |\n\n| Other |\n| - |\n| x |\n', PATH)
    const files = (doc.body as any).files as TableView
    expect(files.kind).toBe('table')
    expect(files.rows[0]).toEqual({ File: 'a.ts' })
  })

  test('a sole content:table() section whose first block is not a table is not promoted', () => {
    const seen = captureDoc()
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Files', { content: table({ columns: ['File'] }) }),
      ]),
      rules: [seen.rule],
    })
    const result = c.validate('## Files\n\nprose\n\n| File |\n| - |\n| a.ts |\n', PATH)
    expect(result.findings.map((f) => f.id)).toEqual(['structure/block-kind'])
    expect((seen.doc!.body as any).files.name).toBe('Files') // the SectionView
  })

  test('a second spelling of a filled alias set gets no key; .section() still finds it', () => {
    const seen = captureDoc()
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [oneOf(['Goal', 'Objective'])]),
      rules: [seen.rule],
    })
    const result = c.validate('## Goal\n\ng\n\n## Objective\n\no\n', PATH)
    expect(result.findings.map((f) => f.id)).toEqual(['structure/duplicate-section'])
    const body = seen.doc!.body as any
    expect(body.goal.name).toBe('Goal')
    expect(body.objective).toBeUndefined()
    expect(body.Objective).toBeUndefined()
    expect(body.section('Objective').name).toBe('Objective')
    expect(body.unknown).toEqual([])
  })
})
