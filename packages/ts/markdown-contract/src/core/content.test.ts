/**
 * Unit tests for the content plane — the leaf data-shape checks and the
 * frontmatter Zod pass, exercising the cases the fixture corpus does not pin directly:
 * the `extraColumns: "ignore"` no-op, the `everyItem: ZodType` form, the deferral to
 * the structure plane (wrong-kind / absent block), the row-line remap on a cell finding,
 * and the frontmatter `lineForPath` remap for enum / unknown-key / required / type.
 */
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import type { DocTree, Finding } from '../index.js'
import { code, contract, list, maxWords, section, sections, table } from '../index.js'

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

// ── Table typed-cell cache ───────────────────────────────────────────────
// `validateTable` keeps a cell transform's parsed output (previously discarded) and caches it
// on the table node's sparse overlay, reachable via `node.typed(row, col)` — the runtime
// substrate the model layer reads. The raw `rows` stay verbatim.

describe('table typed-cell cache', () => {
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

  /** The projected table `BlockNode` for the first section's first block. */
  function tableNode(c: ReturnType<typeof contract>, source: string) {
    const node = c.validate(source, CTX).tree.root.sections[0]!.blocks[0]!
    if (node.kind !== 'table') throw new Error('expected a table block')
    return node
  }

  test('a transform cell caches its parsed output, retrievable via typed(row, col)', () => {
    const src = [
      '## Files',
      '',
      '| Location | Kind | Change |',
      '| --- | --- | --- |',
      '| src/core/content.ts#validateTable | modify | keep res.data |',
    ].join('\n')
    const node = tableNode(filesWithLocation, src)
    // The transform cell's `z.output` is cached beside the raw rows.
    expect(node.typed(0, 'Location')).toEqual({
      path: 'src/core/content.ts',
      symbol: 'validateTable',
    })
    // Raw rows retained verbatim — the overlay is additive, not a replacement.
    expect(node.rows[0]).toEqual(['src/core/content.ts#validateTable', 'modify', 'keep res.data'])
  })

  test('a column with no declared cell reports typed(...) === undefined', () => {
    const src = [
      '## Files',
      '',
      '| Location | Kind | Change |',
      '| --- | --- | --- |',
      '| src/a.ts | modify | tidy |',
    ].join('\n')
    const node = tableNode(filesWithLocation, src)
    expect(node.typed(0, 'Change')).toBeUndefined() // "Change" declares no cell → nothing cached
    expect(node.typed(9, 'Location')).toBeUndefined() // an out-of-range row is undefined too
  })

  test('a failing transform caches nothing and still emits one content/table/cell finding', () => {
    const src = [
      '## Files', // 1
      '', // 2
      '| Location | Kind | Change |', // 3
      '| --- | --- | --- |', // 4
      '| #no-path | modify | oops |', // 5 row 0 — Location transform rejects (starts with #)
    ].join('\n')
    const res = filesWithLocation.validate(src, CTX)
    // Exactly one cell finding, pinned to the offending row's line (A3 remap preserved).
    expect(shape(res.findings)).toEqual([{ id: 'content/table/cell', line: 5 }])
    // Nothing cached for the failed cell.
    const node = res.tree.root.sections[0]!.blocks[0]!
    if (node.kind !== 'table') throw new Error('expected a table block')
    expect(node.typed(0, 'Location')).toBeUndefined()
  })

  test('the cached output rides only on the accessor, never on the serialized tree', () => {
    // The transform injects a sentinel that appears NOWHERE in the raw source, so finding it in
    // a serialized `tree` would mean the typed overlay leaked onto the public surface.
    const Tagged = z.string().transform((s) => ({ raw: s, tag: 'CLOSURE_ONLY_9f3a' }))
    const c = contract({
      body: sections({}, [
        section('Files', {
          content: table({ columns: ['Location'], cells: { Location: Tagged } }),
        }),
      ]),
    })
    const src = ['## Files', '', '| Location |', '| --- |', '| src/a.ts |'].join('\n')
    const { tree } = c.validate(src, CTX)
    const node = tree.root.sections[0]!.blocks[0]!
    if (node.kind !== 'table') throw new Error('expected a table block')
    // Reachable by CALLING the accessor…
    expect(node.typed(0, 'Location')).toEqual({ raw: 'src/a.ts', tag: 'CLOSURE_ONLY_9f3a' })
    // …but not serialized onto the node or the wider tree.
    expect(JSON.stringify(node)).not.toContain('CLOSURE_ONLY_9f3a')
    expect(JSON.stringify(tree)).not.toContain('CLOSURE_ONLY_9f3a')
  })
})

// ── List ────────────────────────────────────────────────────────────────────────

describe('list leaf', () => {
  test('everyItem: checkbox — item-kind per non-checkbox item, at its line', () => {
    const c = contract({
      body: sections({}, [
        section('Acceptance criteria', { content: list({ everyItem: 'checkbox', minItems: 1 }) }),
      ]),
    })
    const src = [
      '## Acceptance criteria', // 1
      '', // 2
      '- [ ] one', // 3 checkbox
      '- bare', // 4 not a checkbox
      '- [x] three', // 5 checkbox
    ].join('\n')
    expect(shape(find(c, src))).toEqual([{ id: 'content/list/item-kind', line: 4 }])
  })

  test("everyItem: ZodType — runs over each item's text", () => {
    const c = contract({
      body: sections({}, [
        section('Tags', { content: list({ everyItem: z.string().regex(/^#/) }) }),
      ]),
    })
    const src = ['## Tags', '', '- #alpha', '- beta', '- #gamma'].join('\n')
    expect(shape(find(c, src))).toEqual([{ id: 'content/list/item-kind', line: 4 }])
  })

  test('min-items — the count floor fires below the bound', () => {
    const c = contract({
      body: sections({}, [
        section('Acceptance criteria', { content: list({ everyItem: 'checkbox', minItems: 2 }) }),
      ]),
    })
    const src = ['## Acceptance criteria', '', '- [ ] only one'].join('\n')
    expect(shape(find(c, src))).toEqual([{ id: 'content/list/min-items', line: 3 }])
  })
})

// ── List typed-item cache ────────────────────────────────────────────────
// `validateList` keeps an `everyItem` transform's parsed output (previously discarded) and caches it
// on the list node's sparse overlay, reachable via `node.typedItem(i)` — the runtime substrate the
// model layer reads. The raw `items` stay verbatim. The `"checkbox"` gate caches nothing.

describe('list typed-item cache', () => {
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

  /** The projected list `BlockNode` for the first section's first block. */
  function listNode(c: ReturnType<typeof contract>, source: string) {
    return listBlockOf(c.validate(source, CTX).tree)
  }

  test('a transform item caches its parsed output, retrievable via typedItem(i)', () => {
    const src = ['## Acceptance criteria', '', '- AC-1: scaffold it', '- AC-2: stub it'].join('\n')
    const node = listNode(acceptance, src)
    // Each item's `z.output` is cached beside the raw items.
    expect(node.typedItem(0)).toEqual({ ref: 'AC-1', text: 'scaffold it' })
    expect(node.typedItem(1)).toEqual({ ref: 'AC-2', text: 'stub it' })
    // Raw items retained verbatim — the overlay is additive, not a replacement.
    expect(node.items.map((i) => i.text)).toEqual(['AC-1: scaffold it', 'AC-2: stub it'])
  })

  test('everyItem: checkbox caches nothing (the typed store stays empty)', () => {
    const c = contract({
      body: sections({}, [
        section('Acceptance criteria', { content: list({ everyItem: 'checkbox', minItems: 1 }) }),
      ]),
    })
    const src = ['## Acceptance criteria', '', '- [ ] one', '- [x] two'].join('\n')
    const node = listNode(c, src)
    // The `"checkbox"` branch never runs a schema, so nothing is cached — the store is sparse/empty.
    expect(node.typedItem(0)).toBeUndefined()
    expect(node.typedItem(1)).toBeUndefined()
  })

  test('a list with no everyItem caches nothing', () => {
    const c = contract({ body: sections({}, [section('Notes', { content: list({}) })]) })
    const node = listNode(c, ['## Notes', '', '- a', '- b'].join('\n'))
    expect(node.typedItem(0)).toBeUndefined()
    expect(node.typedItem(9)).toBeUndefined() // an out-of-range index is undefined too
  })

  test('a failing item emits exactly one content/list/item-kind finding and caches nothing there', () => {
    // `AC-1: ok` parses (the transform never rejects), but a stricter schema exercises the failure
    // branch: require each item to start with `#`. Item 1 fails; items 0 and 2 succeed and cache.
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
    // Exactly one item-kind finding, pinned to the offending item's line (unchanged).
    expect(shape(res.findings)).toEqual([{ id: 'content/list/item-kind', line: 4 }])
    // Nothing cached for the failed item; the successful items DID cache (regex passthrough → string).
    const node = listBlockOf(res.tree)
    expect(node.typedItem(1)).toBeUndefined()
    expect(node.typedItem(0)).toBe('#alpha')
    expect(node.typedItem(2)).toBe('#gamma')
  })

  test('the cached output rides only on the accessor, never on the serialized tree', () => {
    // The transform injects a sentinel that appears NOWHERE in the raw source, so finding it in a
    // serialized `tree` would mean the typed overlay leaked onto the public surface.
    const Tagged = z.string().transform((s) => ({ raw: s, tag: 'CLOSURE_ONLY_7b2c' }))
    const c = contract({
      body: sections({}, [section('Notes', { content: list({ everyItem: Tagged }) })]),
    })
    const { tree } = c.validate(['## Notes', '', '- a', '- b'].join('\n'), CTX)
    const node = listBlockOf(tree)
    // Reachable by CALLING the accessor…
    expect(node.typedItem(0)).toEqual({ raw: 'a', tag: 'CLOSURE_ONLY_7b2c' })
    // …but not serialized onto the node or the wider tree.
    expect(JSON.stringify(node)).not.toContain('CLOSURE_ONLY_7b2c')
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
