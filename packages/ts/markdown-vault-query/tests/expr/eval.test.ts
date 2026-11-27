import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseExpression } from '../../src/expr/parser.ts'
import { evaluate, evaluateSafe, resolveNote, type EvalContext } from '../../src/expr/eval.ts'
import {
  DateValue,
  DurationValue,
  ErrorValue,
  FileValue,
  LinkValue,
  type Value,
} from '../../src/expr/values.ts'
import { createVaultIndex, type VaultIndex, type VaultNote } from '@osdlc/markdown-vault'

// ---------------------------------------------------------------------------
// In-memory vault helper
// ---------------------------------------------------------------------------

interface NoteSpec {
  path: string
  properties?: Record<string, unknown>
  tags?: string[]
  links?: Array<{ target: string; path?: string | null }>
}

function makeNote(spec: NoteSpec): VaultNote {
  const lastSlash = spec.path.lastIndexOf('/')
  const fileName = lastSlash === -1 ? spec.path : spec.path.slice(lastSlash + 1)
  const lastDot = fileName.lastIndexOf('.')
  return {
    file: {
      name: fileName,
      basename: lastDot === -1 ? fileName : fileName.slice(0, lastDot),
      path: spec.path,
      folder: lastSlash === -1 ? '' : spec.path.slice(0, lastSlash),
      ext: lastDot === -1 ? '' : fileName.slice(lastDot + 1),
      size: 100,
      ctime: new Date(2025, 0, 1, 12, 0, 0),
      mtime: new Date(2025, 5, 15, 8, 30, 0),
    },
    properties: spec.properties ?? {},
    tags: spec.tags ?? [],
    links: (spec.links ?? []).map((l) => ({
      target: l.target,
      path: l.path ?? null,
      display: null,
    })),
    embeds: [],
    backlinks: [],
  }
}

function makeVault(...specs: NoteSpec[]): VaultIndex {
  const notes = specs.map(makeNote)
  return { root: '/vault', notes, byPath: new Map(notes.map((n) => [n.file.path, n])) }
}

const FIXED_NOW = new Date(2026, 6, 5, 10, 0, 0) // 2026-07-05 10:00:00 local

function ctxFor(
  note: VaultNote,
  vault?: VaultIndex,
  overrides: Partial<EvalContext> = {},
): EvalContext {
  return {
    note,
    vault: vault ?? { root: '/vault', notes: [note], byPath: new Map([[note.file.path, note]]) },
    formulas: {},
    now: FIXED_NOW,
    ...overrides,
  }
}

function run(expression: string, ctx: EvalContext): Value {
  return evaluate(parseExpression(expression), ctx)
}

const basicNote = makeNote({
  path: 'projects/Alpha.md',
  properties: {
    status: 'active',
    priority: 3,
    done: false,
    due: '2026-07-10',
    title: 'hello world',
    aliases: ['alpha', 'first'],
    owner: '[[People/Ada|K]]',
    empty_string: '',
  },
  tags: ['project', 'work/deep'],
})

// ---------------------------------------------------------------------------
// Property resolution
// ---------------------------------------------------------------------------

test('bare identifiers resolve to note properties', () => {
  assert.equal(run('status', ctxFor(basicNote)), 'active')
  assert.equal(run('priority', ctxFor(basicNote)), 3)
})

test('note.x and note["x"] resolve properties', () => {
  assert.equal(run('note.status', ctxFor(basicNote)), 'active')
  assert.equal(run('note["status"]', ctxFor(basicNote)), 'active')
})

test('missing properties are null and isEmpty', () => {
  assert.equal(run('nonexistent', ctxFor(basicNote)), null)
  assert.equal(run('nonexistent.isEmpty()', ctxFor(basicNote)), true)
  assert.equal(run('empty_string.isEmpty()', ctxFor(basicNote)), true)
  assert.equal(run('status.isEmpty()', ctxFor(basicNote)), false)
})

test('missing != value is true (absent-property comparisons)', () => {
  assert.equal(run('nonexistent != "done"', ctxFor(basicNote)), true)
  assert.equal(run('nonexistent == null', ctxFor(basicNote)), true)
})

test('file properties resolve', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('file.name', ctx), 'Alpha.md')
  assert.equal(run('file.basename', ctx), 'Alpha')
  assert.equal(run('file.path', ctx), 'projects/Alpha.md')
  assert.equal(run('file.folder', ctx), 'projects')
  assert.equal(run('file.ext', ctx), 'md')
  assert.equal(run('file.size', ctx), 100)
})

test('date-typed frontmatter strings become dates with component fields', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('due.year', ctx), 2026)
  assert.equal(run('due.month', ctx), 7)
  assert.equal(run('due.day', ctx), 10)
})

test('frontmatter wikilinks become links', () => {
  const owner = run('owner', ctxFor(basicNote))
  assert.ok(owner instanceof LinkValue)
  assert.equal((owner as LinkValue).target, 'People/Ada')
  assert.equal((owner as LinkValue).display, 'K')
})

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

test('comparison and logical operators', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('status == "active" && priority > 2', ctx), true)
  assert.equal(run('status == "done" || priority >= 3', ctx), true)
  assert.equal(run('!(priority < 3)', ctx), true)
  assert.equal(run('priority != 3', ctx), false)
})

test('arithmetic follows precedence', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('1 + 2 * 3', ctx), 7)
  assert.equal(run('(1 + 2) * 3', ctx), 9)
  assert.equal(run('10 % 3', ctx), 1)
  assert.equal(run('priority * 2', ctx), 6)
})

test('string concatenation with +', () => {
  assert.equal(run('file.basename + " - " + status', ctxFor(basicNote)), 'Alpha - active')
  assert.equal(run('"n=" + priority', ctxFor(basicNote)), 'n=3')
})

test('date comparisons and coercion against strings', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('due > date("2026-07-01")', ctx), true)
  assert.equal(run('due < "2026-08-01"', ctx), true)
  assert.equal(run('due == date("2026-07-10")', ctx), true)
})

// ---------------------------------------------------------------------------
// Global functions
// ---------------------------------------------------------------------------

test('now/today respect the injected clock', () => {
  const ctx = ctxFor(basicNote)
  const now = run('now()', ctx) as DateValue
  assert.equal(now.date.getTime(), FIXED_NOW.getTime())
  const today = run('today()', ctx) as DateValue
  assert.equal(today.hasTime, false)
  assert.equal(today.date.getHours(), 0)
})

test('if() is a lazy ternary defaulting to null', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('if(done, "yes", "no")', ctx), 'no')
  assert.equal(run('if(status == "active", "yes")', ctx), 'yes')
  assert.equal(run('if(done, "yes")', ctx), null)
  // The untaken branch must not evaluate (would throw: unknown function).
  assert.equal(run('if(true, 1, bogusFn())', ctx), 1)
})

test('min/max/number/list', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('max(1, 9, 4)', ctx), 9)
  assert.equal(run('min(1, 9, 4)', ctx), 1)
  assert.equal(run('number("42")', ctx), 42)
  assert.equal(run('number(true)', ctx), 1)
  assert.deepEqual(run('list("a")', ctx), ['a'])
  assert.deepEqual(run('list(aliases)', ctx), ['alpha', 'first'])
})

test('number() on invalid strings is an error value via evaluateSafe', () => {
  const result = evaluateSafe(parseExpression('number("nope")'), ctxFor(basicNote))
  assert.ok(result instanceof ErrorValue)
})

test('date arithmetic: plus/minus durations, date difference', () => {
  const ctx = ctxFor(basicNote)
  const plus = run('date("2026-01-31") + "1M"', ctx) as DateValue
  assert.equal(plus.date.getMonth(), 1) // February
  assert.equal(plus.date.getDate(), 28) // clamped

  const diff = run('(now() + "1d") - now()', ctx)
  assert.ok(diff instanceof DurationValue)
  assert.equal((diff as DurationValue).totalMs, 86400000)
  assert.equal(run('(now() + "1d") - now() == 86400000', ctx), true)
  assert.equal(run('((now() - file.ctime).days > 100)', ctx), true)
})

test('duration() scalar multiplication', () => {
  const ctx = ctxFor(basicNote)
  const doubled = run('duration("5h") * 2', ctx) as DurationValue
  assert.equal(doubled.totalMs, 10 * 3600000)
  const viaAdd = run('now() + (duration("1d") * 2)', ctx) as DateValue
  assert.equal(viaAdd.date.getTime(), FIXED_NOW.getTime() + 2 * 86400000)
})

test('link() builds internal and external links', () => {
  const vault = makeVault({ path: 'People/Ada.md' }, { path: 'projects/Alpha.md' })
  const alpha = vault.notes[1]
  assert.ok(alpha, 'makeVault should have created both notes')
  const ctx = ctxFor(alpha, vault)
  const internal = run('link("Ada")', ctx) as LinkValue
  assert.equal(internal.resolvedPath, 'People/Ada.md')
  const external = run('link("https://obsidian.md", "Site")', ctx) as LinkValue
  assert.equal(external.external, true)
  assert.equal(external.display, 'Site')
})

test('escapeHTML escapes special characters', () => {
  assert.equal(run('escapeHTML("<b>&\\"")', ctxFor(basicNote)), '&lt;b&gt;&amp;&quot;')
})

// ---------------------------------------------------------------------------
// String methods
// ---------------------------------------------------------------------------

test('string predicates and transforms', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('title.contains("world")', ctx), true)
  assert.equal(run('title.containsAll("hello", "world")', ctx), true)
  assert.equal(run('title.containsAny("nope", "world")', ctx), true)
  assert.equal(run('title.startsWith("hello")', ctx), true)
  assert.equal(run('title.endsWith("world")', ctx), true)
  assert.equal(run('"HELLO".lower()', ctx), 'hello')
  assert.equal(run('title.title()', ctx), 'Hello World')
  assert.equal(run('"  x  ".trim()', ctx), 'x')
  assert.equal(run('"abc".reverse()', ctx), 'cba')
  assert.equal(run('"12".repeat(2)', ctx), '1212')
  assert.equal(run('title.length', ctx), 11)
})

test('a negative repeat count becomes an ErrorValue, not a thrown RangeError', () => {
  const ctx = ctxFor(basicNote)
  const result = evaluateSafe(parseExpression('"a".repeat(-1)'), ctx)
  assert.ok(result instanceof ErrorValue)
})

test('a huge finite repeat count becomes an ErrorValue, not a thrown RangeError', () => {
  const ctx = ctxFor(basicNote)
  const result = evaluateSafe(parseExpression('"a".repeat(100000000000)'), ctx)
  assert.ok(result instanceof ErrorValue)
})

test('slice is start-inclusive end-exclusive', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('"abcdef".slice(1, 3)', ctx), 'bc')
  assert.equal(run('"abcdef".slice(2)', ctx), 'cdef')
  assert.deepEqual(run('[1, 2, 3, 4].slice(1, 3)', ctx), [2, 3])
})

test('replace: string pattern replaces all, regex respects /g', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('"a-b-c".replace("-", "+")', ctx), 'a+b+c')
  assert.equal(run('"a-b-c".replace(/-/, "+")', ctx), 'a+b-c')
  assert.equal(run('"a-b-c".replace(/-/g, "+")', ctx), 'a+b+c')
  assert.equal(run('"x1y2".replace(/([0-9])/g, "[$1]")', ctx), 'x[1]y[2]')
})

test('split with string, regex, and limit', () => {
  const ctx = ctxFor(basicNote)
  assert.deepEqual(run('"a,b,c".split(",")', ctx), ['a', 'b', 'c'])
  assert.deepEqual(run('"a1b2c".split(/[0-9]/)', ctx), ['a', 'b', 'c'])
  assert.deepEqual(run('"a,b,c".split(",", 2)', ctx), ['a', 'b'])
})

// ---------------------------------------------------------------------------
// Number methods
// ---------------------------------------------------------------------------

test('number methods', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('(-5).abs()', ctx), 5)
  assert.equal(run('(2.1).ceil()', ctx), 3)
  assert.equal(run('(2.9).floor()', ctx), 2)
  assert.equal(run('(2.5).round()', ctx), 3)
  assert.equal(run('(2.456).round(2)', ctx), 2.46)
  assert.equal(run('(2.5).toFixed(2)', ctx), '2.50')
})

test('an out-of-range toFixed digit count becomes an ErrorValue, not a thrown RangeError', () => {
  const ctx = ctxFor(basicNote)
  const result = evaluateSafe(parseExpression('(2.5).toFixed(200)'), ctx)
  assert.ok(result instanceof ErrorValue)
})

// ---------------------------------------------------------------------------
// List methods
// ---------------------------------------------------------------------------

test('list predicates and transforms', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('aliases.contains("alpha")', ctx), true)
  assert.equal(run('aliases.containsAny("zzz", "first")', ctx), true)
  assert.equal(run('aliases.containsAll("alpha", "first")', ctx), true)
  assert.equal(run('aliases.join("|")', ctx), 'alpha|first')
  assert.deepEqual(run('[3, 1, 2].sort()', ctx), [1, 2, 3])
  assert.deepEqual(run('[1, 2].reverse()', ctx), [2, 1])
  assert.deepEqual(run('[[1, 2], [3]].flat()', ctx), [1, 2, 3])
  assert.deepEqual(run('[1, 1, 2].unique()', ctx), [1, 2])
  assert.equal(run('aliases.length', ctx), 2)
  assert.equal(run('[].isEmpty()', ctx), true)
})

test('filter/map use implicit value and index', () => {
  const ctx = ctxFor(basicNote)
  assert.deepEqual(run('[1, 2, 3, 4].filter(value > 2)', ctx), [3, 4])
  assert.deepEqual(run('[1, 2, 3, 4].map(value + 1)', ctx), [2, 3, 4, 5])
  assert.deepEqual(run('["a", "b"].map(index)', ctx), [0, 1])
})

test('reduce uses implicit acc', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('[1, 2, 3].reduce(acc + value, 0)', ctx), 6)
  assert.equal(run('[5, 1, 9].reduce(if(acc == null || value > acc, value, acc))', ctx), 9)
})

test('list indexing is zero-based', () => {
  assert.equal(run('aliases[0]', ctxFor(basicNote)), 'alpha')
  assert.equal(run('aliases[5]', ctxFor(basicNote)), null)
})

// ---------------------------------------------------------------------------
// Date methods
// ---------------------------------------------------------------------------

test('date methods: date/time/format/relative', () => {
  const ctx = ctxFor(basicNote)
  const stripped = run('now().date()', ctx) as DateValue
  assert.equal(stripped.hasTime, false)
  assert.equal(run('now().time()', ctx), '10:00:00')
  assert.equal(run('due.format("MMM D, YYYY")', ctx), 'Jul 10, 2026')
  assert.equal(run('due.format("[on] dddd")', ctx), 'on Friday')
  assert.equal(run('(now() - "2d").relative()', ctx), '2 days ago')
  assert.equal(run('(now() + "3h").relative()', ctx), 'in 3 hours')
})

// ---------------------------------------------------------------------------
// File / link / tag methods
// ---------------------------------------------------------------------------

test('hasTag is any-of and matches nested tags', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('file.hasTag("project")', ctx), true)
  assert.equal(run('file.hasTag("work")', ctx), true) // nested: work/deep
  assert.equal(run('file.hasTag("nope", "project")', ctx), true) // any-of
  assert.equal(run('file.hasTag("dee")', ctx), false) // no partial segment match
  assert.equal(run('file.tags.contains("#project")', ctx), true)
})

test('inFolder matches folder and subfolders', () => {
  const nested = makeNote({ path: 'planning/tasks/T-1.md' })
  assert.equal(run('file.inFolder("planning/tasks")', ctxFor(nested)), true)
  assert.equal(run('file.inFolder("planning")', ctxFor(nested)), true)
  assert.equal(run('file.inFolder("planning/task")', ctxFor(nested)), false)
  assert.equal(run('file.inFolder("other")', ctxFor(nested)), false)
})

test('hasLink and hasProperty', () => {
  const vault = makeVault(
    { path: 'People/Ada.md' },
    {
      path: 'projects/Alpha.md',
      properties: { status: 'x' },
      links: [{ target: 'Ada', path: 'People/Ada.md' }],
    },
  )
  const ctx = ctxFor(vault.byPath.get('projects/Alpha.md')!, vault)
  assert.equal(run('file.hasLink("Ada")', ctx), true)
  assert.equal(run('file.hasLink("Nobody")', ctx), false)
  assert.equal(run('file.hasProperty("status")', ctx), true)
  assert.equal(run('file.hasProperty("missing")', ctx), false)
})

test('asLink and link.asFile round-trip', () => {
  const vault = makeVault({ path: 'People/Ada.md' })
  const ada = vault.notes[0]
  assert.ok(ada, 'makeVault should have created the note')
  const ctx = ctxFor(ada, vault)
  const link = run('file.asLink()', ctx) as LinkValue
  assert.equal(link.resolvedPath, 'People/Ada.md')
  const file = run('file.asLink().asFile()', ctx) as FileValue
  assert.equal(file.note.file.path, 'People/Ada.md')
})

test('asFile on a body link of an index built without resolveLinks is null', () => {
  const notes = [
    { path: 'notes/a.md', links: ['x', 'other/y'] },
    { path: 'notes/x.md' },
    { path: 'other/y.md' },
  ]
  const unresolved = createVaultIndex(notes)
  const a = unresolved.byPath.get('notes/a.md')!
  assert.equal(run('file.links[0].asFile()', ctxFor(a, unresolved)), null)
  assert.equal(run('file.hasLink("x")', ctxFor(a, unresolved)), false)
  const resolved = createVaultIndex(notes, { resolveLinks: true })
  const b = resolved.byPath.get('notes/a.md')!
  const file = run('file.links[0].asFile()', ctxFor(b, resolved)) as FileValue
  assert.equal(file.note.file.path, 'notes/x.md')
})

test('link equality: frontmatter link == this file', () => {
  const vault = makeVault(
    { path: 'People/Ada.md' },
    { path: 'books/B1.md', properties: { author: '[[Ada]]' } },
  )
  // Simulate a base whose `this` is Ada, evaluated against B1.
  const ada = vault.byPath.get('People/Ada.md')!
  const b1 = vault.byPath.get('books/B1.md')!
  // Link target resolution happens through fromFrontmatter's resolver → vault.
  const ctx = ctxFor(b1, vault, { thisNote: ada })
  assert.equal(run('author == this', ctx), true)
  assert.equal(run('this.file.name', ctx), 'Ada.md')
})

test('linksTo follows the linked file', () => {
  const vault = makeVault(
    { path: 'hub.md', links: [{ target: 'spoke', path: 'spoke.md' }] },
    { path: 'spoke.md' },
    { path: 'other.md', properties: { ref: '[[hub]]' } },
  )
  const ctx = ctxFor(vault.byPath.get('other.md')!, vault)
  assert.equal(run('ref.linksTo(file("spoke"))', ctx), true)
  assert.equal(run('ref.linksTo(file("other"))', ctx), false)
})

// ---------------------------------------------------------------------------
// Object / regex / any methods
// ---------------------------------------------------------------------------

test('object literal, keys/values/isEmpty', () => {
  const ctx = ctxFor(basicNote)
  assert.deepEqual(run('{"a": 1, "b": 2}.keys()', ctx), ['a', 'b'])
  assert.deepEqual(run('{"a": 1, "b": 2}.values()', ctx), [1, 2])
  assert.equal(run('{}.isEmpty()', ctx), true)
  assert.equal(run('{"a": 1}["a"]', ctx), 1)
  assert.equal(run('{"a": 1}.a', ctx), 1)
})

test('file.properties exposes all frontmatter as object', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('file.properties["status"]', ctx), 'active')
  assert.equal(run('file.properties.keys().contains("priority")', ctx), true)
})

test('regex matches', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('/^act/.matches(status)', ctx), true)
  assert.equal(run('/\\d{4}-\\d{2}-\\d{2}/.matches("2026-07-05")', ctx), true)
  assert.equal(run('/^x$/.matches(status)', ctx), false)
})

test('regex vs division disambiguation', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('10 / 2 / 5', ctx), 1)
  assert.equal(run('/a/.matches("a") && 4 / 2 == 2', ctx), true)
})

test('any-type methods: toString/isTruthy/isType', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('priority.toString()', ctx), '3')
  assert.equal(run('"".isTruthy()', ctx), false)
  assert.equal(run('priority.isTruthy()', ctx), true)
  assert.equal(run('status.isType("string")', ctx), true)
  assert.equal(run('priority.isType("number")', ctx), true)
  assert.equal(run('due.isType("date")', ctx), true)
  assert.equal(run('aliases.isType("list")', ctx), true)
})

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

test('formula scope evaluates and chains', () => {
  const ctx = ctxFor(basicNote, undefined, {
    formulas: { doubled: 'priority * 2', label: '"p" + formula.doubled' },
  })
  assert.equal(run('formula.doubled', ctx), 6)
  assert.equal(run('formula.label', ctx), 'p6')
})

test('circular formulas produce an error, not a hang', () => {
  const ctx = ctxFor(basicNote, undefined, { formulas: { a: 'formula.b', b: 'formula.a' } })
  const result = evaluateSafe(parseExpression('formula.a'), ctx)
  assert.ok(result instanceof ErrorValue)
  assert.match((result as ErrorValue).message, /[Cc]ircular/)
})

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

test('evaluation errors become ErrorValue via evaluateSafe', () => {
  const result = evaluateSafe(parseExpression('status.bogusMethod()'), ctxFor(basicNote))
  assert.ok(result instanceof ErrorValue)
})

test('methods on missing values: predicates false, others null', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('nonexistent.contains("x")', ctx), false)
  assert.equal(run('nonexistent.lower()', ctx), null)
  assert.equal(run('file.hasTag("x") || nonexistent.contains("y")', ctx), false)
})

// ---------------------------------------------------------------------------
// Plain-object lookups are own-property only
// ---------------------------------------------------------------------------

test('a formula named for an Object.prototype member is unknown, not a crash', () => {
  const ctx = ctxFor(basicNote, undefined, { formulas: { real: '1' } })
  for (const name of ['valueOf', 'constructor', 'toString', '__proto__']) {
    for (const expression of [`formula.${name} > 0`, `formula["${name}"]`]) {
      const result = evaluateSafe(parseExpression(expression), ctx)
      assert.ok(result instanceof ErrorValue, `${expression} is a cell error`)
      assert.match(result.message, /Unknown formula/)
    }
  }
})

test('inherited Object members are not properties, locals or object keys', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('file.hasProperty("toString")', ctx), false)
  assert.equal(run('file.hasProperty("status")', ctx), true)
  assert.equal(run('note.constructor', ctx), null)
  assert.equal(run('constructor', ctx), null)
  assert.equal(run('{"draft": 1}["constructor"]', ctx), null)
  assert.equal(run('{"draft": 1}.constructor', ctx), null)
  assert.deepEqual(run('[1].map(constructor)', ctx), [null])
  assert.equal(run('file.properties.hasOwnProperty', ctx), null)
  // `__proto__` is the inherited member that is an object, so an `in` test in
  // the note-property lookup would convert Object.prototype into `{}`.
  assert.equal(run('note["__proto__"]', ctx), null)
})

// ---------------------------------------------------------------------------
// Formulas and lambdas
// ---------------------------------------------------------------------------

test('a formula called inside a lambda reads note properties, not the lambda locals', () => {
  const note = makeNote({ path: 'v.md', properties: { value: 5 } })
  const ctx = ctxFor(note, undefined, {
    formulas: { doubled: 'value * 2', viaLambda: '[1, 2].map(formula.doubled)' },
  })
  assert.equal(run('formula.doubled', ctx), 10)
  assert.deepEqual(run('formula.viaLambda', ctx), [10, 10])
  assert.deepEqual(run('[1, 2].map(formula.doubled)', ctx), [10, 10])
})

test('filter/map/reduce on a missing list are null, like other methods on missing values', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('scores.filter(value > 1)', ctx), null)
  assert.equal(run('scores.map(value * 2)', ctx), null)
  assert.equal(run('scores.reduce(acc + value, 0)', ctx), null)
})

test('list aggregates skip the missing and error entries a summary column holds', () => {
  const ctx = ctxFor(basicNote, undefined, {
    locals: { values: [10, null, 20, new ErrorValue('x')] },
  })
  assert.equal(run('values.sum()', ctx), 30)
  assert.equal(run('values.mean()', ctx), 15)
  assert.equal(run('values.average()', ctx), 15)
  assert.equal(run('values.median()', ctx), 15)
  assert.equal(run('values.stddev()', ctx), 5)
  assert.equal(run('[null].mean()', ctx), null)
  assert.equal(run('[].sum()', ctx), 0)
  // Like the builtin summaries, a non-numeric entry is skipped, not an error.
  assert.equal(run('["a", 1].sum()', ctx), 1)
  assert.equal(run('["", 2, 4].mean()', ctx), 3)
})

test('number() of a blank string is an error, not 0', () => {
  const ctx = ctxFor(basicNote)
  assert.throws(() => run('number("")', ctx), /Cannot convert/)
  assert.throws(() => run('number("  ")', ctx), /Cannot convert/)
  assert.equal(run('number("0")', ctx), 0)
})

test('a string added to a date or a duration concatenates', () => {
  const ctx = ctxFor(basicNote)
  assert.equal(run('"Due: " + due', ctx), 'Due: 2026-07-10')
  assert.equal(run('due + " (due)"', ctx), '2026-07-10 (due)')
  assert.equal(run('"Took " + duration("1d")', ctx), 'Took 1 day')
  // A duration-shaped string still adds as a duration.
  assert.equal((run('due + "1d"', ctx) as DateValue).date.getDate(), 11)
  assert.equal((run('duration("1d") + "2h"', ctx) as DurationValue).totalMs, 26 * 3600000)
})

// ---------------------------------------------------------------------------
// Link resolution matches the scanner
// ---------------------------------------------------------------------------

test('resolveNote matches a folder-qualified target only on a path-segment boundary', () => {
  // 'xa/b.md' ends with the string 'a/b.md' but sits in no folder named 'a'.
  const vault = makeVault({ path: 'xa/b.md' }, { path: 'z/a/b.md' })
  assert.equal(resolveNote(vault, 'a/b')?.file.path, 'z/a/b.md')
})

test('resolveNote resolves a target written with a non-.md extension outside the root', () => {
  const vault = makeVault(
    { path: 'notes/a.md' },
    { path: 'assets/diagram.png' },
    // Same basename as the image; the extension decides which file is meant.
    { path: 'diagram.md' },
  )
  assert.equal(resolveNote(vault, 'diagram.png')?.file.path, 'assets/diagram.png')
  assert.equal(resolveNote(vault, 'diagram')?.file.path, 'diagram.md')
  const ctx = ctxFor(vault.notes[0]!, vault)
  assert.equal(run('file("diagram.png").path', ctx), 'assets/diagram.png')
})

test('resolveNote follows the scanner on extensionless and folder-qualified targets', () => {
  const vault = makeVault({ path: 'note.png' }, { path: 'a/note.md' }, { path: 'aab/x.md' })
  // An extensionless target means a note, not the shorter image.
  assert.equal(resolveNote(vault, 'note')?.file.path, 'a/note.md')
  // A folder that matches no candidate leaves the target unresolved.
  assert.equal(resolveNote(vault, 'b/x'), null)
})

test('a wikilink with a #heading or #^block subpath resolves to its note', () => {
  const vault = makeVault(
    { path: 'a.md', properties: { parent: '[[Project#Goals]]', block: '[[Project#^abc|B]]' } },
    { path: 'projects/Project.md' },
  )
  const ctx = ctxFor(vault.notes[0]!, vault)
  assert.equal(run('parent.asFile().path', ctx), 'projects/Project.md')
  assert.equal(run('block.asFile().path', ctx), 'projects/Project.md')
  assert.equal(run('parent == link("Project")', ctx), true)
  assert.equal(run('link("[[Project#Goals]]").asFile().path', ctx), 'projects/Project.md')
  assert.equal(resolveNote(vault, 'Project#Goals')?.file.path, 'projects/Project.md')
  // The target keeps its subpath for display.
  assert.equal((run('parent', ctx) as LinkValue).target, 'Project#Goals')
})

// ---------------------------------------------------------------------------
// Inherited Object.prototype names are not properties or formulas
// ---------------------------------------------------------------------------

test('file.hasProperty and note[...] ignore inherited Object.prototype names', () => {
  const note = makeNote({ path: 'a.md', properties: { title: 'x' } })
  const ctx = ctxFor(note)
  assert.equal(run('file.hasProperty("title")', ctx), true)
  assert.equal(run('file.hasProperty("constructor")', ctx), false)
  assert.equal(run('file.hasProperty("toString")', ctx), false)
  assert.equal(run('note["__proto__"]', ctx), null)
})

test('formula.<inherited name> is an unknown-formula cell error, not a thrown crash', () => {
  const ctx = ctxFor(basicNote)
  for (const name of ['toString', 'constructor', 'valueOf']) {
    const result = evaluateSafe(parseExpression(`formula.${name}`), ctx)
    assert.ok(result instanceof ErrorValue, name)
    assert.match((result as ErrorValue).message, /Unknown formula/)
  }
})

test('string.matches resets lastIndex so a reused /g regex gives the same answer each time', () => {
  const ctx = ctxFor(basicNote)
  assert.deepEqual(run('[1].reduce(["a", "a"].map(value.matches(acc)), /a/g)', ctx), [true, true])
})
