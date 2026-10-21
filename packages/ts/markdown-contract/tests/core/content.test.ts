/**
 * Unit tests for the content plane — the leaf data-shape checks and the
 * frontmatter Zod pass, exercising the cases the fixture corpus does not pin directly:
 * the `extraColumns: "ignore"` no-op, the `everyItem: ZodType` form, the deferral to
 * the structure plane (wrong-kind / absent block), the row-line remap on a cell finding,
 * and the frontmatter `lineForPath` remap for enum / unknown-key / required / type.
 */
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import type { DocTree, Finding } from '../../src/index.js'
import { code, contract, list, maxWords, parse, section, sections, table } from '../../src/index.js'

const CTX = { path: 'fixture.md' }

/** Validate `source` against `c`, returning the findings (deterministically sorted). */
function find(c: ReturnType<typeof contract>, source: string): Finding[] {
  return c.validate(source, CTX).findings
}

/** The (id, line) pairs of the findings, for compact assertions. */
function shape(findings: Finding[]): { id: string; line: number | undefined }[] {
  return findings.map((f) => ({ id: f.id, line: f.pos?.line }))
}

// ── Table ──────────────────────────────────────────────────────────────────────

describe('table leaf', () => {
  const filesTable = (extra?: 'ignore' | 'error') =>
    contract({
      body: sections({}, [
        section('Files', {
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            minRows: 1,
            ...(extra ? { extraColumns: extra } : {}),
          }),
        }),
      ]),
    })

  test('column-missing — one finding per declared column absent', () => {
    const src = ['## Files', '', '| Location |', '| -------- |', '| a.ts     |'].join('\n')
    expect(shape(find(filesTable(), src))).toEqual([
      { id: 'content/table/column-missing', line: 3 },
      { id: 'content/table/column-missing', line: 3 },
    ])
  })

  test('min-rows — header-only table fires the row floor', () => {
    const src = ['## Files', '', '| Location | Kind | Change |', '| - | - | - |'].join('\n')
    expect(shape(find(filesTable(), src))).toEqual([{ id: 'content/table/min-rows', line: 3 }])
  })

  test('extraColumns: error — one column-extra per undeclared column', () => {
    const src = [
      '## Files',
      '',
      '| Location | Kind | Change | Owner |',
      '| - | - | - | - |',
      '| a.ts | add | new | alice |',
    ].join('\n')
    expect(shape(find(filesTable('error'), src))).toEqual([
      { id: 'content/table/column-extra', line: 3 },
    ])
  })

  test('extraColumns: ignore (and default) — an undeclared column is silent', () => {
    const src = [
      '## Files',
      '',
      '| Location | Kind | Change | Owner |',
      '| - | - | - | - |',
      '| a.ts | add | new | alice |',
    ].join('\n')
    expect(find(filesTable('ignore'), src)).toEqual([])
    expect(find(filesTable(), src)).toEqual([]) // default is ignore
  })

  test('typed cell enum — the finding localizes to the offending row via rowPos(i)', () => {
    const c = contract({
      body: sections({}, [
        section('Files', {
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            cells: { Kind: z.enum(['add', 'modify', 'delete']) },
          }),
        }),
      ]),
    })
    const src = [
      '## Files', // 1
      '', // 2
      '| Location | Kind   | Change |', // 3 header
      '| -------- | ------ | ------ |', // 4 delimiter
      '| a.ts     | add    | new    |', // 5 row 0
      '| b.ts     | rename | edit   |', // 6 row 1 — bad
      '| c.ts     | delete | gone   |', // 7 row 2
    ].join('\n')
    expect(shape(find(c, src))).toEqual([{ id: 'content/table/cell', line: 6 }])
  })

  test('a wrong-kind block defers to the structure plane (no content finding)', () => {
    const c = filesTable()
    // A list where a table is declared: structure emits block-kind; content stays silent.
    const src = ['## Files', '', '- not a table'].join('\n')
    const ids = find(c, src).map((f) => f.id)
    expect(ids).toContain('structure/block-kind')
    expect(ids.some((id) => id.startsWith('content/'))).toBe(false)
  })
})

// ── Typed cell values ────────────────────────────────────────────────────
// `validateTable` keeps a cell transform's parsed output for the typed model. The values belong to
// one `validate()` call, so the parse tree's rows stay raw and a second contract that validates
// the same tree never sees them.

describe('table typed cells', () => {
  // A transform cell: "path" or "path#symbol" → { path, symbol? }.
  const Location = z.string().transform((s, ctx) => {
    const m = /^([^#]+)(?:#(.+))?$/.exec(s.trim())
    if (!m) {
      ctx.addIssue({ code: 'custom', message: 'expected ‘path’ or ‘path#symbol’' })
      return z.NEVER
    }
    return { path: m[1]!, ...(m[2] ? { symbol: m[2] } : {}) }
  })

  const filesWithLocation = contract({
    body: sections({}, [
      section('Files', {
        content: table({
          columns: ['Location', 'Kind', 'Change'], // "Change" declares no cell → no transform
          cells: { Location, Kind: z.enum(['new', 'modify', 'delete']) },
        }),
      }),
    ]),
  })

  /** The rows the model reads back for the `Files` table. */
  function rowsOf(c: ReturnType<typeof contract>, source: string): Record<string, unknown>[] {
    return (c.read(source, CTX).body as any).Files.rows
  }

  test('a transform cell reads back its parsed output; the tree rows stay raw', () => {
    const src = [
      '## Files',
      '',
      '| Location | Kind | Change |',
      '| --- | --- | --- |',
      '| src/core/content.ts#validateTable | modify | keep res.data |',
    ].join('\n')
    const res = filesWithLocation.validate(src, CTX)
    expect((res.doc!.body as any).Files.rows[0]).toEqual({
      Location: { path: 'src/core/content.ts', symbol: 'validateTable' },
      Kind: 'modify',
      Change: 'keep res.data',
    })
    const node = res.tree.root.sections[0]!.blocks[0]!
    if (node.kind !== 'table') throw new Error('expected a table block')
    expect(node.rows[0]).toEqual(['src/core/content.ts#validateTable', 'modify', 'keep res.data'])
  })

  test('a column with no declared cell reads back the raw string', () => {
    const src = [
      '## Files',
      '',
      '| Location | Kind | Change |',
      '| --- | --- | --- |',
      '| src/a.ts | modify | tidy |',
    ].join('\n')
    expect(rowsOf(filesWithLocation, src)[0]!.Change).toBe('tidy')
  })

  test('a failing transform emits one content/table/cell finding and no model', () => {
    const src = [
      '## Files', // 1
      '', // 2
      '| Location | Kind | Change |', // 3
      '| --- | --- | --- |', // 4
      '| #no-path | modify | oops |', // 5 row 0 — Location transform rejects (starts with #)
    ].join('\n')
    const res = filesWithLocation.validate(src, CTX)
    expect(shape(res.findings)).toEqual([{ id: 'content/table/cell', line: 5 }])
    expect(res.doc).toBeUndefined()
  })

  test('the parsed output never lands on the serialized tree', () => {
    // The transform injects a sentinel that appears nowhere in the source, so finding it in a
    // serialized `tree` would mean the typed value leaked onto the public surface.
    const Tagged = z.string().transform((s) => ({ raw: s, tag: 'CLOSURE_ONLY_9f3a' }))
    const c = contract({
      body: sections({}, [
        section('Files', {
          content: table({ columns: ['Location'], cells: { Location: Tagged } }),
        }),
      ]),
    })
    const src = ['## Files', '', '| Location |', '| --- |', '| src/a.ts |'].join('\n')
    const { tree, doc } = c.validate(src, CTX)
    expect((doc!.body as any).Files.rows[0].Location).toEqual({
      raw: 'src/a.ts',
      tag: 'CLOSURE_ONLY_9f3a',
    })
    expect(JSON.stringify(tree)).not.toContain('CLOSURE_ONLY_9f3a')
  })

  test('one contract does not leak its parsed cells into another that validates the same tree', () => {
    const withNumber = contract({
      body: sections({}, [
        section('Files', {
          content: table({ columns: ['n'], cells: { n: z.string().transform(Number) } }),
        }),
      ]),
    })
    const plain = contract({
      body: sections({}, [section('Files', { content: table({ columns: ['n'] }) })]),
    })
    const tree = parse(['## Files', '', '| n |', '| - |', '| 5 |'].join('\n'))
    expect((withNumber.validate(tree, CTX).doc!.body as any).Files.rows).toEqual([{ n: 5 }])
    expect((plain.validate(tree, CTX).doc!.body as any).Files.rows).toEqual([{ n: '5' }])
  })

  test('a hand-built table block validates without any writer methods', () => {
    const tree: DocTree = {
      frontmatter: null,
      body: '',
      mdast: { type: 'root', children: [] },
      root: {
        name: '',
        depth: 1,
        pos: { line: 0 },
        anchors: [],
        blocks: [],
        sections: [
          {
            name: 'Files',
            depth: 2,
            pos: { line: 1 },
            anchors: [],
            sections: [],
            blocks: [
              {
                kind: 'table',
                columns: ['n'],
                rows: [['7']],
                rowPos: () => ({ line: 5 }),
                cellPos: () => ({ line: 5 }),
                inlineSpans: () => [],
                pos: { line: 3 },
              },
            ],
          },
        ],
      },
    }
    const c = contract({
      body: sections({}, [
        section('Files', {
          content: table({ columns: ['n'], cells: { n: z.string().transform(Number) } }),
        }),
      ]),
    })
    expect((c.validate(tree, CTX).doc!.body as any).Files.rows).toEqual([{ n: 7 }])
  })
})

// ── Repeatable sections ──────────────────────────────────────────────────

describe('a repeatable section is checked on every occurrence', () => {
  const step = contract({
    body: sections({}, [
      section('Step', {
        repeatable: true,
        content: table({
          columns: ['n'],
          minRows: 1,
          cells: { n: z.string().regex(/^\d+$/).transform(Number) },
        }),
      }),
    ]),
  })
  const SRC = [
    '## Step', // 1
    '', // 2
    '| n |', // 3
    '| - |', // 4
    '| 1 |', // 5
    '', // 6
    '## Step', // 7
    '', // 8
    '| n |', // 9
    '| - |', // 10
    '| oops |', // 11
    '', // 12
    '## Step', // 13
    '', // 14
    '| n |', // 15
    '| - |', // 16
  ].join('\n')

  test('the second occurrence’s bad cell and the third’s missing rows are reported', () => {
    expect(shape(find(step, SRC))).toEqual([
      { id: 'content/table/cell', line: 11 },
      { id: 'content/table/min-rows', line: 15 },
    ])
  })

  test('every occurrence reads back transformed', () => {
    const doc = [
      '## Step',
      '',
      '| n |',
      '| - |',
      '| 1 |',
      '',
      '## Step',
      '',
      '| n |',
      '| - |',
      '| 2 |',
    ].join('\n')
    expect((step.read(doc, CTX).body as any).Step.map((t: any) => t.rows)).toEqual([
      [{ n: 1 }],
      [{ n: 2 }],
    ])
  })
})

// ── Frontmatter YAML ────────────────────────────────────────────────────

describe('frontmatter YAML errors', () => {
  const c = contract({ frontmatter: z.object({ title: z.string() }) })
  const noSchema = contract({})

  test('a duplicate key is a frontmatter/yaml error at the repeated key', () => {
    const src = ['---', 'title: a', 'title: b', '---', '', '# T'].join('\n')
    expect(shape(find(c, src))).toEqual([{ id: 'frontmatter/yaml', line: 3 }])
  })

  test('broken syntax gives one frontmatter/yaml finding, not a misleading type finding', () => {
    const src = ['---', 'title: [unclosed', '---', '', '# T'].join('\n')
    expect(find(c, src).map((f) => f.id)).toEqual(['frontmatter/yaml'])
  })

  test('a contract with no frontmatter schema still reports it', () => {
    const src = ['---', 'a: b', 'a: c', '---'].join('\n')
    expect(find(noSchema, src).map((f) => f.id)).toEqual(['frontmatter/yaml'])
  })

  test('an alias to an undefined anchor is a finding, not a throw', () => {
    const src = ['---', 'title: *nope', '---', '', '# T'].join('\n')
    expect(() => find(c, src)).not.toThrow()
    expect(find(c, src).map((f) => f.id)).toEqual(['frontmatter/yaml'])
  })
})

// ── List typed items ─────────────────────────────────────────────────────
// `validateList` keeps an `everyItem` transform's parsed output for the typed model. The raw
// `items` on the tree stay verbatim. The `"checkbox"` gate keeps nothing.

describe('list typed items', () => {
  // A transform item: `AC-1: do the thing` → { ref: "AC-1", text: "do the thing" }.
  const criterion = z.string().transform((raw) => {
    const [ref = '', ...rest] = raw.split(':')
    return { ref: ref.trim(), text: rest.join(':').trim() }
  })

  const acceptance = contract({
    body: sections({}, [
      section('Acceptance criteria', { content: list({ everyItem: criterion, minItems: 1 }) }),
    ]),
  })

  /** The first section's first block as a list `BlockNode` (throws if it is not a list). */
  function listBlockOf(tree: DocTree) {
    const node = tree.root.sections[0]?.blocks[0]
    if (node?.kind !== 'list') throw new Error('expected a list block')
    return node
  }

  /** The items the model reads back for the first list of `section`. */
  function itemsOf(c: ReturnType<typeof contract>, section: string, source: string): unknown[] {
    return (c.read(source, CTX).body as any)[section].lists[0].items
  }

  test('a transform item reads back its parsed output; the tree items stay raw', () => {
    const src = ['## Acceptance criteria', '', '- AC-1: scaffold it', '- AC-2: stub it'].join('\n')
    expect(itemsOf(acceptance, 'Acceptance criteria', src)).toEqual([
      { ref: 'AC-1', text: 'scaffold it' },
      { ref: 'AC-2', text: 'stub it' },
    ])
    const node = listBlockOf(acceptance.validate(src, CTX).tree)
    expect(node.items.map((i) => i.text)).toEqual(['AC-1: scaffold it', 'AC-2: stub it'])
  })

  test('everyItem: checkbox reads back the raw items', () => {
    const c = contract({
      body: sections({}, [
        section('Acceptance criteria', { content: list({ everyItem: 'checkbox', minItems: 1 }) }),
      ]),
    })
    const src = ['## Acceptance criteria', '', '- [ ] one', '- [x] two'].join('\n')
    expect(
      (itemsOf(c, 'Acceptance criteria', src) as { text: string }[]).map((i) => i.text),
    ).toEqual(['one', 'two'])
  })

  test('a failing item emits exactly one content/list/item-kind finding', () => {
    const tags = contract({
      body: sections({}, [
        section('Tags', { content: list({ everyItem: z.string().regex(/^#/) }) }),
      ]),
    })
    const src = [
      '## Tags', // 1
      '', // 2
      '- #alpha', // 3 item 0 — ok
      '- beta', // 4 item 1 — bad (no leading #)
      '- #gamma', // 5 item 2 — ok
    ].join('\n')
    const res = tags.validate(src, CTX)
    expect(shape(res.findings)).toEqual([{ id: 'content/list/item-kind', line: 4 }])
    expect(res.doc).toBeUndefined()
  })

  test('the parsed output never lands on the serialized tree', () => {
    const Tagged = z.string().transform((s) => ({ raw: s, tag: 'CLOSURE_ONLY_7b2c' }))
    const c = contract({
      body: sections({}, [section('Notes', { content: list({ everyItem: Tagged }) })]),
    })
    const { tree, doc } = c.validate(['## Notes', '', '- a', '- b'].join('\n'), CTX)
    expect((doc!.body as any).Notes.lists[0].items[0]).toEqual({
      raw: 'a',
      tag: 'CLOSURE_ONLY_7b2c',
    })
    expect(JSON.stringify(tree)).not.toContain('CLOSURE_ONLY_7b2c')
  })
})

// ── Code ───────────────────────────────────────────────────────────────────────

describe('code leaf', () => {
  const example = contract({
    body: sections({}, [section('Example', { content: code({ lang: 'ts' }) })]),
  })

  test('lang mismatch — content/code/lang at the fence', () => {
    const src = ['## Example', '', '```js', 'const x = 1;', '```'].join('\n')
    expect(shape(find(example, src))).toEqual([{ id: 'content/code/lang', line: 3 }])
  })

  test('lang match — no finding', () => {
    const src = ['## Example', '', '```ts', 'const x = 1;', '```'].join('\n')
    expect(find(example, src)).toEqual([])
  })
})

// ── Paragraph (maxWords) ──────────────────────────────────────────────────────────

describe('maxWords leaf', () => {
  const brief = contract({
    body: sections({ order: 'none', allowUnknown: true }, [
      section('Summary', { content: maxWords(5) }),
    ]),
  })

  test('over budget — content/max-words', () => {
    const src = ['## Summary', '', 'one two three four five six'].join('\n')
    expect(shape(find(brief, src))).toEqual([{ id: 'content/max-words', line: 3 }])
  })

  test('under budget — no finding', () => {
    const src = ['## Summary', '', 'one two three'].join('\n')
    expect(find(brief, src)).toEqual([])
  })
})

// ── Frontmatter (Zod over the YAML, lineForPath remap) ────────────────────────────

describe('frontmatter plane', () => {
  const schema = z.strictObject({
    id: z.string(),
    status: z.enum(['open', 'closed']),
    title: z.string().min(1),
  })
  const c = contract({ frontmatter: schema })

  test("enum mismatch — frontmatter/enum at the offending key's line", () => {
    const src = [
      '---', // 1
      'id: D-1', // 2
      'status: draft', // 3 — bad enum
      'title: t', // 4
      '---', // 5
      '',
      '# t',
    ].join('\n')
    expect(shape(find(c, src))).toEqual([{ id: 'frontmatter/enum', line: 3 }])
  })

  // ── Messages name the field (the documentary cases) ───────────────────────────
  // Every frontmatter message leads with the offending key, so a report says what to fix.

  test("missing required key — message names the field, not 'received undefined'", () => {
    const src = ['---', 'status: open', 'title: t', '---'].join('\n') // id absent
    const f = find(c, src).find((x) => x.id === 'frontmatter/required')
    expect(f?.message).toBe('frontmatter field ‘id’ is required')
  })

  test('const/literal mismatch — message names the field and its required value', () => {
    const lit = contract({ frontmatter: z.strictObject({ type: z.literal('capability') }) })
    const src = ['---', 'type: feature', '---'].join('\n')
    const f = find(lit, src).find((x) => x.id === 'frontmatter/enum')
    expect(f?.message).toBe('frontmatter field ‘type’ must be ‘capability’')
  })

  test('enum mismatch — message lists the allowed values', () => {
    const src = ['---', 'id: D-1', 'status: draft', 'title: t', '---'].join('\n')
    const f = find(c, src).find((x) => x.id === 'frontmatter/enum')
    expect(f?.message).toBe('frontmatter field ‘status’ must be one of ‘open’, ‘closed’')
  })

  test('wrong type — message names the field, the expected type, and what was found', () => {
    const typed = contract({ frontmatter: z.strictObject({ n: z.number() }) })
    const src = ['---', 'n: not-a-number', '---'].join('\n')
    const f = find(typed, src).find((x) => x.id === 'frontmatter/type')
    expect(f?.message).toBe('frontmatter field ‘n’ must be a number (got string)')
  })

  test('pattern mismatch — message names the field', () => {
    const pat = contract({ frontmatter: z.strictObject({ id: z.string().regex(/^C-\d{4}$/) }) })
    const src = ['---', 'id: C-1', '---'].join('\n')
    const f = find(pat, src).find((x) => x.id === 'frontmatter/type')
    expect(f?.message).toBe('frontmatter field ‘id’ does not match the required pattern')
  })

  test('nested path — message renders array indices readably', () => {
    const nested = contract({
      frontmatter: z.strictObject({ related: z.array(z.string()) }),
    })
    const src = ['---', 'related:', '  - 42', '---'].join('\n')
    const f = find(nested, src).find((x) => x.id === 'frontmatter/type')
    expect(f?.message).toBe('frontmatter field ‘related[0]’ must be a string (got number)')
  })

  test("unknown-key — frontmatter/unknown-key at the stray key's line", () => {
    const src = [
      '---', // 1
      'id: D-1', // 2
      'status: open', // 3
      'title: t', // 4
      'foo: bar', // 5 — stray
      '---', // 6
    ].join('\n')
    expect(shape(find(c, src))).toEqual([{ id: 'frontmatter/unknown-key', line: 5 }])
  })

  test('missing required — frontmatter/required, remapped where the key would sit', () => {
    const src = ['---', 'id: D-1', 'status: open', '---'].join('\n') // title absent
    const ids = find(c, src).map((f) => f.id)
    expect(ids).toContain('frontmatter/required')
  })

  test('type mismatch — a non-enum non-missing failure → frontmatter/type', () => {
    const typed = contract({ frontmatter: z.strictObject({ n: z.number() }) })
    const src = ['---', 'n: not-a-number', '---'].join('\n')
    const ids = find(typed, src).map((f) => f.id)
    expect(ids).toContain('frontmatter/type')
  })

  test('absent frontmatter with a declared schema still fires required-key findings', () => {
    const ids = find(c, '# title only, no frontmatter').map((f) => f.id)
    expect(ids).toContain('frontmatter/required')
  })

  test('valid frontmatter — no findings', () => {
    const src = ['---', 'id: D-1', 'status: open', 'title: t', '---'].join('\n')
    expect(find(c, src)).toEqual([])
  })
})
