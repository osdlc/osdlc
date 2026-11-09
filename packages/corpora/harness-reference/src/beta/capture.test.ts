import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { validateCorpus } from '@osdlc/corpus-schema'

import {
  capture,
  type CaptureDeps,
  type CaptureOptions,
  findExcerpt,
  htmlToText,
} from './capture.ts'

const beta = resolve(import.meta.dirname, '../../corpora/beta')

const PAGE = `<!doctype html><html><head><title>Fixture &amp; page</title>
<style>p { color: red }</style></head><body>
<header>Site header</header><nav>Nav links</nav><aside>Sidebar</aside>
<p>Docs\u200b home</p>
<script>var hidden = "Claude Code starts as claude"</script>
<p>Install it, then run   <code>claude</code>
in your project.</p><p>Claude Code starts as <strong>claude</strong> in a terminal&nbsp;and more text follows here.</p>
<footer>Site footer</footer>
</body></html>`

let dir: string
let fetched: string[]
let signals: (AbortSignal | null | undefined)[]
const deps = (body = PAGE, status = 200, type = 'text/html; charset=utf-8'): CaptureDeps => ({
  fetch: async (url, init) => {
    fetched.push(url)
    signals.push(init?.signal)
    return new Response(body, { status, headers: { 'content-type': type } })
  },
  today: () => '2026-11-08',
})
const opts = (over: Partial<CaptureOptions> = {}): CaptureOptions => ({
  corpus: dir,
  harness: 'Claude Code',
  reference: 'references/Anthropic/Claude Code overview.md',
  kind: 'docs',
  excerpt: 'Claude Code starts as claude\n  in a terminal',
  observedBy: 'person: test',
  ...over,
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-reference-capture-'))
  cpSync(beta, dir, { recursive: true })
  rmSync(join(dir, 'evidence'), { recursive: true })
  cpSync(join(beta, 'evidence/evidence.schema.md'), join(dir, 'evidence/evidence.schema.md'))
  fetched = []
  signals = []
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('htmlToText', () => {
  test('keeps visible text, joins inline tags, spaces block tags and decodes entities', () => {
    const text = htmlToText(PAGE)
    assert.ok(!text.includes('hidden') && !text.includes('color') && !text.includes('Fixture'))
    for (const chrome of ['header', 'Nav links', 'Sidebar', 'footer'])
      assert.ok(!text.includes(chrome), chrome)
    assert.ok(text.includes('Docs home Install it, then run claude in your project. Claude Code'))
    assert.ok(text.includes('starts as claude in a terminal and more'))
  })
})

// A lone surrogate does not survive UTF-8.
const roundTrips = (s: string): boolean => Buffer.from(s).toString() === s

describe('findExcerpt', () => {
  test('context never splits a surrogate pair', () => {
    const text = `😀${'a'.repeat(30)} quote ${'b'.repeat(30)}😀`
    const found = findExcerpt(text, 'quote')
    assert.ok(found !== undefined && roundTrips(found.prefix) && roundTrips(found.suffix))
    assert.equal([...found.prefix].length, 32)
    assert.equal([...found.suffix].length, 32)
    assert.ok(text.includes(found.prefix + found.exact + found.suffix))
  })
})

describe('capture', () => {
  test('writes an evidence record for an existing reference, with the quote and its context', async () => {
    const result = await capture(opts({ locator: 'Get started', version: '2.1.318' }), deps())
    assert.deepEqual(result, {
      evidence: 'evidence/Claude Code/2026-11-08 Claude Code overview.md',
      reference: 'references/Anthropic/Claude Code overview.md',
      createdReference: false,
    })
    assert.deepEqual(fetched, ['https://code.claude.com/docs/en/overview'])
    assert.ok(signals[0] instanceof AbortSignal)
    const text = readFileSync(join(dir, result.evidence), 'utf8')
    assert.equal(
      text,
      `---
kind: docs
reference: "[Claude Code overview](../../references/Anthropic/Claude%20Code%20overview.md)"
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
version: 2.1.318
version_basis: inferred
observed: 2026-11-08
locator: Get started
excerpt:
  exact: Claude Code starts as claude in a terminal
  prefix: "hen run claude in your project. "
  suffix: " and more text follows here."
observed_by: "person: test"
---

> Claude Code starts as claude in a terminal
`,
    )
    const report = validateCorpus(dir)
    assert.deepEqual(report.errors, [])
    assert.equal(report.records.get('evidence')?.size, 1)
  })

  test('adds a reference record for a URL that has none', async () => {
    const url = 'https://code.claude.com/docs/en/new-page'
    const result = await capture(opts({ reference: url }), deps())
    assert.equal(result.createdReference, true)
    assert.equal(result.reference, 'references/Anthropic/Fixture & page.md')
    assert.equal(
      readFileSync(join(dir, result.reference), 'utf8'),
      `---\nurl: ${url}\ntitle: Fixture & page\npublisher: Anthropic\nurl_status: live\n---\n`,
    )
    assert.equal(result.evidence, 'evidence/Claude Code/2026-11-08 Fixture & page.md')
    assert.deepEqual(validateCorpus(dir).errors, [])
  })

  test('reuses the reference record for a URL it already has', async () => {
    const result = await capture(
      opts({ reference: 'https://code.claude.com/docs/en/overview' }),
      deps(),
    )
    assert.equal(result.createdReference, false)
    assert.equal(result.reference, 'references/Anthropic/Claude Code overview.md')
  })

  test('refuses an excerpt the page does not hold, and writes nothing', async () => {
    await assert.rejects(
      capture(opts({ reference: 'https://example.com/x', excerpt: 'hidden' }), deps()),
      /excerpt not found/,
    )
    assert.ok(!existsSync(join(dir, 'references/Anthropic/Fixture & page.md')))
    assert.ok(!existsSync(join(dir, 'evidence/Claude Code')))
  })

  test('refuses a failed fetch, an unknown harness, a kind that is not a page and a bad name', async () => {
    await assert.rejects(capture(opts(), deps('gone', 404)), /HTTP 404/)
    await assert.rejects(capture(opts({ harness: 'Nope' }), deps()), /no harness record/)
    await assert.rejects(capture(opts({ kind: 'run' as 'docs' }), deps()), /pages only/)
    await assert.rejects(capture(opts({ name: 'a/b' }), deps()), /holds "\/"/)
    assert.deepEqual(fetched, [
      'https://code.claude.com/docs/en/overview',
      'https://code.claude.com/docs/en/overview',
    ])
    assert.ok(!existsSync(join(dir, 'evidence/Claude Code')))
  })

  test('refuses a bad reference: plain http, a non-record path and a Windows path', async () => {
    await assert.rejects(
      capture(opts({ reference: 'http://example.com/x' }), deps()),
      /must use https/,
    )
    await assert.rejects(
      capture(opts({ reference: 'harnesses/Claude Code.md' }), deps()),
      /not a reference record/,
    )
    await assert.rejects(
      capture(opts({ reference: 'C:\\corpus\\references\\x.md' }), deps()),
      /not a reference record/,
    )
    assert.deepEqual(fetched, [])
  })

  test('refuses a reference name the validator would reject, or that clashes after folding', async () => {
    const url = 'https://example.com/new'
    await assert.rejects(
      capture(opts({ reference: url, referenceName: 'Codex CLI | ChatGPT Learn' }), deps()),
      /reference name .* holds "\|"/,
    )
    await assert.rejects(
      capture(opts({ reference: url, referenceName: 'CLAUDE CODE OVERVIEW' }), deps()),
      /already exists for another URL/,
    )
    await assert.rejects(
      capture(opts({ reference: url, publisher: 'a/b' }), deps()),
      /publisher .* holds a slash/,
    )
    assert.ok(!existsSync(join(dir, 'evidence/Claude Code')))
  })

  test('needs a title when the page has none', async () => {
    const bare = '<html><body><p>Claude Code starts as claude in a terminal</p></body></html>'
    const url = 'https://example.com/untitled'
    const excerpt = 'Claude Code starts as claude'
    await assert.rejects(capture(opts({ reference: url, excerpt }), deps(bare)), /no title/)
    const ok = await capture(opts({ reference: url, excerpt, title: 'Untitled page' }), deps(bare))
    assert.equal(ok.reference, 'references/Anthropic/Untitled page.md')
  })

  test('reads a plain-text or Markdown response as it is', async () => {
    const markdown = '# Notes\n\nClaude Code  starts\nas claude here.\n'
    const result = await capture(
      opts({
        reference: 'https://example.com/notes.md',
        title: 'Notes',
        excerpt: 'Claude Code starts as claude',
      }),
      deps(markdown, 200, 'text/markdown'),
    )
    const text = readFileSync(join(dir, result.evidence), 'utf8')
    assert.ok(text.includes('prefix: "# Notes "'))
    assert.deepEqual(validateCorpus(dir).errors, [])
  })

  test('fetches the raw file for a github.com blob URL and keeps the URL in the reference', async () => {
    const url = 'https://github.com/acme/tool/blob/0123abc/LICENSE.md'
    const result = await capture(
      opts({
        reference: url,
        title: 'acme/tool LICENSE',
        referenceName: 'acme tool LICENSE',
        excerpt: 'starts as claude',
      }),
      deps('Claude Code starts as claude in a terminal', 200, 'text/plain'),
    )
    assert.deepEqual(fetched, ['https://raw.githubusercontent.com/acme/tool/0123abc/LICENSE.md'])
    assert.ok(readFileSync(join(dir, result.reference), 'utf8').includes(`url: ${url}\n`))
  })

  test('reads a github.com repository URL as its README source', async () => {
    const url = 'https://github.com/acme/tool'
    await capture(
      opts({ reference: url, title: 'acme tool README', excerpt: 'starts as claude' }),
      deps('Claude Code starts as claude in a terminal', 200, 'text/markdown'),
    )
    assert.deepEqual(fetched, ['https://api.github.com/repos/acme/tool/readme'])
  })

  test('removes what it wrote when the corpus no longer validates', async () => {
    await assert.rejects(
      capture(
        opts({ reference: 'https://example.com/new', publisher: 'New Pub', observedBy: '' }),
        deps(),
      ),
      /do not validate/,
    )
    assert.ok(!existsSync(join(dir, 'references/New Pub')))
    assert.ok(!existsSync(join(dir, 'evidence/Claude Code')))
    assert.ok(existsSync(join(dir, 'evidence/evidence.schema.md')))
    assert.deepEqual(validateCorpus(dir).errors, [])
  })

  test('never overwrites a record: a second look the same day needs its own name', async () => {
    await capture(opts(), deps())
    await assert.rejects(capture(opts(), deps()), /append-only/)
    const second = await capture(opts({ name: 'overview again' }), deps())
    assert.equal(second.evidence, 'evidence/Claude Code/2026-11-08 overview again.md')
  })
})
