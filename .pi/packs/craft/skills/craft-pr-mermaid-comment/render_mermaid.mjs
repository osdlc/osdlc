#!/usr/bin/env bun
// Render every ```mermaid block in a Markdown file the way GitHub's viewer
// does and report what came out. See pr-mermaid-comment.md, step 2.
//
//   render_mermaid.mjs <file.md> [--out <png>] [--github <owner/repo>] [--json]
//
// --github  runs the file through GitHub's Markdown API first so the blocks
//           are the ones GitHub's own Markdown produces (catches a fence
//           inside a list or a table that GitHub does not treat as mermaid).
//           Needs `gh` signed in.
// --out     full-page screenshot of the rendered comment. Default:
//           <file>.png beside the input.
// --json    machine-readable result instead of the table.
//
// Exit 0 when at least one block was found and every block rendered, 1 when
// any failed or the file holds no mermaid block (a nested fence GitHub does
// not treat as mermaid looks the same as no fence), 2 on a setup error.
// Mermaid comes from this repo's install (any package that depends on it,
// found through the bun store); Playwright from the repo root.

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  if (i === -1) return null
  const v = args[i + 1]
  args.splice(i, 2)
  return v ?? ''
}
const json = args.includes('--json')
if (json) args.splice(args.indexOf('--json'), 1)
const out = flag('--out')
const github = flag('--github')
const file = args[0]
if (!file) {
  console.error(
    'usage: render_mermaid.mjs <file.md> [--out <png>] [--github <owner/repo>] [--json]',
  )
  process.exit(2)
}

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

function resolvePkg(name) {
  for (const base of [process.cwd(), repoRoot]) {
    try {
      return dirname(createRequire(join(base, 'package.json')).resolve(`${name}/package.json`))
    } catch {}
  }
  const store = join(repoRoot, 'node_modules', '.bun')
  if (existsSync(store)) {
    const hit = readdirSync(store).find((d) => d.startsWith(`${name}@`))
    if (hit) return join(store, hit, 'node_modules', name)
  }
  console.error(`cannot resolve ${name}; run from a package that depends on it`)
  process.exit(2)
}

const mermaidDist = join(resolvePkg('mermaid'), 'dist')
const { chromium } = await import(join(resolvePkg('playwright'), 'index.mjs'))

const markdown = readFileSync(file, 'utf8')
let body
if (github) {
  // The Markdown goes in on stdin as a JSON body, not as an argv element, so a
  // large draft cannot hit the OS argument-size limit.
  body = execFileSync('gh', ['api', '/markdown', '--input', '-'], {
    encoding: 'utf8',
    input: JSON.stringify({ mode: 'gfm', context: github, text: markdown }),
    maxBuffer: 1 << 24,
  })
} else {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  body = markdown.replace(
    /```mermaid\n([\s\S]*?)```/g,
    (_, src) => `<pre lang="mermaid"><code>${esc(src)}</code></pre>`,
  )
}

const html =
  '<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;max-width:980px;margin:24px auto;padding:0 16px}pre{white-space:pre-wrap}</style>' +
  body +
  '<script type="module">import m from "/dist/mermaid.esm.min.mjs"; window.__mermaid = m;</script>'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()))
await page.route('http://local.test/**', (route) => {
  const p = new URL(route.request().url()).pathname
  if (p === '/') return route.fulfill({ contentType: 'text/html', body: html })
  const f = join(mermaidDist, p.replace(/^\/dist\//, ''))
  if (p.startsWith('/dist/') && existsSync(f))
    return route.fulfill({ contentType: 'text/javascript', body: readFileSync(f) })
  return route.fulfill({ status: 404, body: '' })
})
await page.goto('http://local.test/')
try {
  await page.waitForFunction(() => !!window.__mermaid, null, { timeout: 20000 })
} catch {
  console.error('mermaid did not load:', pageErrors.slice(0, 3).join('\n'))
  await browser.close()
  process.exit(2)
}

const results = await page.evaluate(async () => {
  for (const pre of document.querySelectorAll('pre[lang="mermaid"]')) {
    const d = document.createElement('pre')
    d.className = 'mermaid'
    d.textContent = pre.textContent
    pre.replaceWith(d)
  }
  // strict is Mermaid's default and what hosted viewers use: links render,
  // link targets and callbacks are dropped.
  window.__mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
  const out = []
  for (const [i, el] of [...document.querySelectorAll('pre.mermaid')].entries()) {
    const src = el.textContent
    try {
      await window.__mermaid.run({ nodes: [el] })
      const svg = el.querySelector('svg')
      const r = svg?.getBoundingClientRect()
      const ok = !!svg && !el.textContent.includes('Syntax error')
      out.push({
        block: i + 1,
        ok,
        type: src.trim().split(/\s/)[0],
        width: r ? Math.round(r.width) : 0,
        height: r ? Math.round(r.height) : 0,
        links: [...el.querySelectorAll('a')].map(
          (a) => a.getAttribute('href') ?? a.getAttribute('xlink:href'),
        ),
      })
    } catch (e) {
      out.push({
        block: i + 1,
        ok: false,
        type: src.trim().split(/\s/)[0],
        error: String(e?.message ?? e?.str ?? e)
          .split('\n')[0]
          .slice(0, 200),
      })
    }
  }
  return out
})

const shot = resolve(out ?? file.replace(/\.md$/, '') + '.png')
await page.screenshot({ path: shot, fullPage: true })
await browser.close()

const failed = results.filter((r) => !r.ok).length
const empty = results.length === 0
if (json) {
  console.log(JSON.stringify({ file, screenshot: shot, results, pageErrors }, null, 2))
} else {
  console.log(`block  ok   type        size        links`)
  for (const r of results) {
    const size = r.ok ? `${r.width}x${r.height}` : (r.error ?? 'render failed')
    console.log(
      `${String(r.block).padEnd(6)} ${r.ok ? 'yes' : 'NO '}  ${r.type.padEnd(11)} ${size.padEnd(11)} ${r.links?.length ?? 0}`,
    )
  }
  if (pageErrors.length) console.log(`page errors:\n  ${pageErrors.slice(0, 5).join('\n  ')}`)
  console.log(`${results.length} blocks, ${failed} failed. Screenshot: ${shot}`)
  if (empty) console.error('no mermaid blocks found: nothing was checked')
}
process.exit(failed || empty ? 1 : 0)
