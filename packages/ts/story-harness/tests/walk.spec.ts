// The keyboard walk over blank pages on host Chromium, no Storybook.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { parseAriaLine, walkPage } from '../src/runner/walk.ts'

const html = (body: string) =>
  `data:text/html,<!doctype html><body style="margin:0">${encodeURIComponent(body)}`
let dir: string
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'walk-'))
})
test.afterEach(() => rmSync(dir, { recursive: true, force: true }))

test('parseAriaLine reads the role and name', () => {
  expect(parseAriaLine('- button "Save \\"it\\""')).toEqual({ role: 'button', name: 'Save "it"' })
  expect(parseAriaLine('- link "Home":\n  - /url: /')).toEqual({ role: 'link', name: 'Home' })
  expect(parseAriaLine('- textbox')).toEqual({ role: 'textbox', name: '' })
})

test('walks the tab order and reads the focus indicator from the style change', async ({
  page,
}) => {
  await page.goto(
    html(`<style>.bare{outline:none}</style>
      <button>First</button><button class="bare">Bare</button><a href="#x">Link</a>`),
  )
  const walk = await walkPage(page, { id: 'a', outDir: dir, max: 10 })
  expect(walk.stops.map((s) => [s.role, s.name])).toEqual([
    ['button', 'First'],
    ['button', 'Bare'],
    ['link', 'Link'],
  ])
  expect(walk.stops.map((s) => s.indicator)).toEqual([true, false, true])
  expect(walk.end).toBe('left-document')
  expect(walk.stops.every((s) => s.visible && s.inViewport && !s.obscured)).toBe(true)
  expect(walk.reverse).toEqual({ checked: true, ok: true, mismatch: null })
  expect(JSON.parse(readFileSync(join(dir, 'walk.json'), 'utf8')).stops).toHaveLength(3)
})

test('stops at the limit', async ({ page }) => {
  await page.goto(html(`<button>A</button><button>B</button><button>C</button>`))
  expect((await walkPage(page, { id: 'a', outDir: dir, max: 2 })).end).toBe('max')
})

test('a modal dialog that lets Tab out is an escape', async ({ page }) => {
  await page.goto(
    html(`<div role="dialog" aria-modal="true"><button>In</button></div><button>Outside</button>`),
  )
  const walk = await walkPage(page, { id: 'a', outDir: dir, max: 10 })
  expect(walk.end).toBe('escaped')
  expect(walk.stops.map((s) => s.inDialog)).toEqual([true, false])
  expect(walk.dialog).toMatchObject({
    present: true,
    modal: true,
    escaped: true,
    escapeCloses: false,
  })
})

test('a dialog that closes on Escape is not an issue', async ({ page }) => {
  await page.goto(
    html(`<div id="d" role="dialog" aria-modal="true"><button>In</button></div>
      <script>addEventListener('keydown', (e) => e.key === 'Escape' && document.getElementById('d').remove())</script>`),
  )
  const walk = await walkPage(page, { id: 'a', outDir: dir, max: 10 })
  expect(walk.dialog).toMatchObject({
    present: true,
    modal: true,
    escaped: false,
    escapeCloses: true,
  })
})

test('a ring drawn on a sibling, a pseudo-element or a first child counts as an indicator', async ({
  page,
}) => {
  await page.goto(
    html(`<style>
      input{opacity:0;position:absolute}
      .box{display:inline-block;width:20px;height:20px;border:2px solid #ccc}
      input:focus + .box{box-shadow:0 0 0 3px blue}
      .pseudo{outline:none}
      .pseudo::after{content:'';display:block;width:10px;height:2px}
      .pseudo:focus::after{background:red}
      .parent{outline:none}.parent span{display:block}
      .parent:focus span{filter:invert(1)}
    </style>
    <label><input type="checkbox"><span class="box"></span> Tick</label>
    <button class="pseudo">Pseudo</button>
    <button class="parent"><span>Child</span></button>`),
  )
  const walk = await walkPage(page, { id: 'a', outDir: dir, max: 10 })
  expect(walk.stops.map((s) => s.indicator)).toEqual([true, true, true])
})

test('a visually hidden checkbox is judged on its label, not flagged as unseen', async ({
  page,
}) => {
  await page.goto(
    html(`<style>
      input{opacity:0;position:absolute;width:1px;height:1px}
      .box{display:inline-block;width:20px;height:20px;border:2px solid #ccc}
      input:focus + .box{outline:3px solid blue}
    </style>
    <input id="c" type="checkbox"><span class="box"></span> <label for="c">Remember me</label>`),
  )
  const walk = await walkPage(page, { id: 'a', outDir: dir, max: 10 })
  expect(walk.stops).toHaveLength(1)
  const stop = walk.stops[0]!
  expect(stop).toMatchObject({ visible: true, inViewport: true, obscured: false, indicator: true })
  expect(stop.proxy).toContain('label')
  expect(stop.box.w).toBeGreaterThan(1)
})

test('an iframe ends the walk on its own reason', async ({ page }) => {
  await page.goto(
    html(
      `<button>Before</button><iframe src="about:blank" title="frame" tabindex="0"></iframe><button>After</button>`,
    ),
  )
  const walk = await walkPage(page, { id: 'a', outDir: dir, max: 10 })
  expect(walk.end).toBe('iframe')
  expect(walk.stops.map((s) => s.role)).toEqual(['button', 'iframe'])
})

test('fixed stops keep the viewport box; stops in a scrolled container are off the map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 400 })
  await page.goto(
    html(`<div style="height:1200px"></div>
      <button style="position:fixed;top:50px;left:60px;width:80px;height:30px">Fixed</button>
      <div id="s" style="height:60px;overflow:auto;position:absolute;top:100px;left:10px;width:200px">
        <div style="height:300px"></div><button id="deep">Deep</button>
      </div>
      <script>document.getElementById('s').scrollTop = 250</script>`),
  )
  const walk = await walkPage(page, { id: 'a', outDir: dir, max: 10 })
  const fixed = walk.stops.find((s) => s.name === 'Fixed')!
  expect(fixed.pageBox).toEqual(fixed.box)
  expect(fixed.pageBox.y).toBe(50)
  const deep = walk.stops.find((s) => s.name === 'Deep')!
  expect(deep.pageBox).toEqual({ x: 0, y: 0, w: 0, h: 0 })
})

test('a modal with one button that has a focus ring is not flagged as lacking one', async ({
  page,
}) => {
  await page.goto(
    html(`<style>button:focus-visible{outline:3px solid blue}</style>
      <div role="dialog" aria-modal="true"><button>Close</button></div>
      <script>addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); document.querySelector('button').focus() } })</script>`),
  )
  const walk = await walkPage(page, { id: 'a', outDir: dir, max: 10 })
  expect(walk.stops).toHaveLength(1)
  expect(walk.stops[0]!.indicator).toBe(true)
  expect(walk.end).toBe('cycled')
})

test('focus that falls to the body after Escape closes the dialog is not restored; the opener is', async ({
  page,
}) => {
  const dialog = (restore: string) =>
    html(`<div id="d" role="dialog" aria-modal="true"><button>In</button></div>
      <button id="o">Open</button>
      <script>addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.getElementById('d').remove(); ${restore} } })</script>`)
  await page.goto(dialog(''))
  await page.focus('#o')
  const lost = await walkPage(page, { id: 'a', outDir: dir, max: 10 })
  expect(lost.dialog).toMatchObject({ escapeCloses: true, focusRestored: false })

  await page.goto(dialog("document.getElementById('o').focus()"))
  await page.focus('#o')
  const kept = await walkPage(page, { id: 'b', outDir: dir, max: 10 })
  expect(kept.dialog).toMatchObject({ escapeCloses: true, focusRestored: true })
})

test('a dialog rendered open, with no opener, is not judged on where focus goes after Escape', async ({
  page,
}) => {
  await page.goto(
    html(`<div id="d" role="dialog" aria-modal="true"><button>In</button></div>
      <script>addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('d').remove() })</script>`),
  )
  const walk = await walkPage(page, { id: 'c', outDir: dir, max: 10 })
  expect(walk.dialog).toMatchObject({ escapeCloses: true, focusRestored: null })
})
