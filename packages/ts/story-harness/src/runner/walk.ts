/**
 * The keyboard walk over one open page: press Tab from the start of the
 * document and record every stop (what took focus, where, whether it can be
 * seen, whether it shows a focus indicator), then Shift+Tab back to check the
 * order reverses, and check a modal dialog keeps focus. It records what
 * happened and judges nothing: a caller turns the record into findings, for
 * example with `@osdlc/story-harness/parley-capture`. Imports Playwright types
 * and node built-ins only, so it runs in the container.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

/** Stops per story before the walk gives up. */
export const DEFAULT_WALK_MAX = 40

/**
 * A box in CSS pixels from the viewport's top-left corner.
 *
 * @experimental
 */
export interface WalkBox {
  x: number
  y: number
  w: number
  h: number
}

/**
 * One element that took focus during the walk.
 *
 * @experimental
 */
export interface WalkStop {
  /** 1-based position in the tab order. */
  index: number
  role: string
  name: string
  /** `tag#id.class[data-testid="x"]` of the element and up to two ancestors, outermost first. */
  selector: string
  /**
   * In the viewport the screenshot shows. For a visually hidden native input
   * (opacity 0 or at most 1px) this is the box of its label or adjacent
   * control, which is what a user sees; see `proxy`.
   */
  box: WalkBox
  /**
   * Where the stop is on `start.png`, which is the page at scroll 0. A
   * `position: fixed` stop (or one inside a fixed ancestor) keeps its viewport
   * box. A stop that cannot be placed reliably (inside a container scrolled
   * away from 0, or `position: sticky` once the window has scrolled) has zero
   * width and height, so it is not on the map.
   */
  pageBox: WalkBox
  /** Rendered with a size, `visibility` visible and opacity above 0. */
  visible: boolean
  /** The box overlaps the viewport. */
  inViewport: boolean
  /** Another element is on top at the box's centre. */
  obscured: boolean
  /**
   * A style on the element, two ancestors, next sibling, first child or its
   * `::before`/`::after` changed when focus left it; `null` when that could not
   * be read, or when the walk ended on this stop (the stop that took focus out
   * of a modal dialog or into a frame).
   */
  indicator: boolean | null
  /** Which properties changed, for the report. */
  indicatorProps: string[]
  inDialog: boolean
  /** The label or adjacent control that `box`, `visible` and the indicator were judged on, when the focused input itself is visually hidden. */
  proxy?: string
  /** File name in the story's folder. */
  shot: string
}

/**
 * Why the walk stopped.
 *
 * @experimental
 */
export type WalkEnd =
  /** Focus returned to a stop already visited. */
  | 'cycled'
  /** Focus went to the document body or the browser. */
  | 'left-document'
  /** Focus went to an element outside the story. */
  | 'left-root'
  /** Focus went outside a modal dialog that was open. */
  | 'escaped'
  /** Focus went into an `<iframe>`, whose content the walk does not enter. */
  | 'iframe'
  /** The stop limit came first. */
  | 'max'

/**
 * The result of the Shift+Tab pass back through the stops.
 *
 * @experimental
 */
export interface WalkReverse {
  /** At least two stops, so there was an order to reverse. */
  checked: boolean
  /** Shift+Tab visited the stops in reverse. */
  ok: boolean
  /** The 1-based stop Shift+Tab should have reached and the one it did (0: none of them). */
  mismatch: { expected: number; got: number } | null
}

/**
 * What the walk found about a dialog on the page.
 *
 * @experimental
 */
export interface WalkDialog {
  /** A stop is inside a `[role=dialog]`, `[role=alertdialog]` or `dialog[open]`, or a modal one was open at the start. */
  present: boolean
  modal: boolean
  /** Focus left a modal dialog by Tab. */
  escaped: boolean
  /** After Escape from inside it the dialog was gone; `null` when not checked. */
  escapeCloses: boolean | null
  /** After Escape the dialog was still open and focus was still inside it; `null` when not checked or when the dialog closed. */
  focusStaysInside: boolean | null
  /**
   * The dialog closed on Escape and focus went back to the element that was
   * focused before the walk began (the opener). `false` when focus fell to the
   * body or anywhere but the opener. `null` when not checked, when the dialog
   * stayed open, or when no opener is known: a story that renders its dialog
   * open has no element to hand focus back to.
   */
  focusRestored: boolean | null
}

/**
 * Everything the walk recorded for one story; written as `walk.json`.
 *
 * @experimental
 */
export interface WalkRecord {
  id: string
  theme: 'light'
  viewport: { width: number; height: number }
  /** The page before the first Tab. */
  start: string
  max: number
  /** Focusable elements in the story root that are rendered. */
  interactive: number
  stops: WalkStop[]
  end: WalkEnd
  reverse: WalkReverse
  dialog: WalkDialog
}

/**
 * What `parameters.walk` can set on a story or its meta.
 *
 * @experimental
 */
export interface WalkParameters {
  /** Leave the story out of the walk; the string says why. */
  skip?: string
}

/** Where focus is after a Tab, before it is described. */
interface FocusState {
  kind: 'none' | 'stop'
  /** Index in the page's list of visited elements. */
  idx: number
  seen: boolean
  inRoot: boolean
  modalOutside: boolean
  inDialog: boolean
  iframe: boolean
}

interface FocusDescription {
  role: string
  name: string
  selector: string
}

interface FocusGeometry {
  box: WalkBox
  pageBox: WalkBox
  visible: boolean
  inViewport: boolean
  obscured: boolean
  proxy: string | null
}

/** Computed properties compared between the focused and the blurred element. */
const STYLE_PROPS = [
  'outline-style',
  'outline-width',
  'outline-color',
  'outline-offset',
  'box-shadow',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'background-color',
  'background-image',
  'color',
  'text-decoration-line',
  'text-decoration-color',
  'opacity',
  'filter',
  'transform',
  'accent-color',
]

const FOCUSABLE =
  'a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex^="-"]),[contenteditable=""],[contenteditable=true]'

export const DIALOG_SELECTOR = '[role=dialog],[role=alertdialog],dialog[open]'

const TAG_ROLES: Record<string, string> = {
  a: 'link',
  button: 'button',
  select: 'combobox',
  textarea: 'textbox',
  summary: 'button',
}

const INPUT_ROLES: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  button: 'button',
  submit: 'button',
  range: 'slider',
}

/** The first line of an `ariaSnapshot`: `- button "Save"`. */
export function parseAriaLine(snapshot: string): { role: string; name: string } | null {
  const m = /^\s*- ([a-z]+)(?: "((?:[^"\\]|\\.)*)")?/.exec(snapshot)
  if (!m) return null
  return { role: m[1]!, name: (m[2] ?? '').replace(/\\(.)/g, '$1') }
}

const TAB_SETTLE_MS = 60

/**
 * Puts the walk's in-page helpers on `window.__walk`, once, so each probe is a
 * short call. Everything it needs comes in as the argument: the function is
 * serialised into the page and closes over nothing here.
 */
async function installHelpers(page: Page): Promise<void> {
  await page.evaluate(
    ({ props, dialogSel, tagRoles, inputRoles }) => {
      const W = window as any
      /** Visited elements, and the style snapshot taken while each held focus. */
      const els: Element[] = (W.__walkEls = [])
      const snaps: Array<{ els: Array<Element | null>; vals: string[] }> = []

      const rootEl = (): Element => document.getElementById('storybook-root') ?? document.body
      const parentOf = (n: Node): Node | null => n.parentNode ?? (n as ShadowRoot).host ?? null
      const within = (outer: Node, inner: Node): boolean => {
        for (let n: Node | null = inner; n; n = parentOf(n)) if (n === outer) return true
        return false
      }
      const isModal = (d: Element): boolean => {
        try {
          return d.getAttribute('aria-modal') === 'true' || d.matches(':modal')
        } catch {
          return d.getAttribute('aria-modal') === 'true'
        }
      }
      const openModal = (): Element | undefined =>
        Array.from(document.querySelectorAll(dialogSel)).find(
          (d) => isModal(d) && d.getClientRects().length > 0,
        )
      const activeEl = (): Element | null => {
        let el: Element | null = document.activeElement
        while (el && (el as HTMLElement).shadowRoot?.activeElement)
          el = (el as HTMLElement).shadowRoot!.activeElement
        return el
      }

      /** What a user sees for a native input hidden by opacity or size: its label or the neighbouring custom control. */
      const proxyOf = (el: Element): Element | null => {
        if (el.tagName !== 'INPUT') return null
        const r = el.getBoundingClientRect()
        if (Number(getComputedStyle(el).opacity) > 0.01 && r.width > 1 && r.height > 1) return null
        const candidates = [
          ...Array.from((el as HTMLInputElement).labels ?? []),
          el.closest('label'),
          el.nextElementSibling,
          el.previousElementSibling,
        ]
        return (
          candidates.find((c) => {
            if (!c || c === el) return false
            const cr = c.getBoundingClientRect()
            const cs = getComputedStyle(c)
            return (
              cr.width > 1 &&
              cr.height > 1 &&
              cs.visibility === 'visible' &&
              Number(cs.opacity) > 0.01
            )
          }) ?? null
        )
      }

      /**
       * Where a ring may be drawn: the element, two ancestors (`:focus-within`
       * wrappers), its next sibling and first child (`input:focus + .box`), its
       * pseudo-elements, and a proxy with its first child. A ring drawn anywhere
       * else is missed.
       */
      const targets = (el: Element) => {
        const list: Array<{
          el: Element | null
          pseudo: string | null
          label: string
          neighbour?: boolean
        }> = []
        const levels = ['', 'parent ', 'grandparent ']
        let cur: Element | null = el
        for (let i = 0; i < 3 && cur && cur !== rootEl(); i++, cur = cur.parentElement)
          list.push({ el: cur, pseudo: null, label: levels[i]! })
        list.push({
          el: el.nextElementSibling,
          pseudo: null,
          label: 'next sibling ',
          neighbour: true,
        })
        list.push({
          el: el.firstElementChild,
          pseudo: null,
          label: 'first child ',
          neighbour: true,
        })
        list.push({ el, pseudo: '::before', label: '::before ' })
        list.push({ el, pseudo: '::after', label: '::after ' })
        const proxy = proxyOf(el)
        if (proxy) {
          list.push({ el: proxy, pseudo: null, label: 'label ', neighbour: true })
          list.push({
            el: proxy.firstElementChild,
            pseudo: null,
            label: 'label child ',
            neighbour: true,
          })
        }
        return list
      }
      const snapshot = (el: Element) => {
        const list = targets(el)
        return {
          els: list.map((t) => t.el),
          labels: list.map((t) => t.label),
          neighbours: list.map((t) => !!t.neighbour),
          vals: list.map((t) => {
            if (!t.el) return ''
            const cs = getComputedStyle(t.el, t.pseudo)
            return props.map((p) => cs.getPropertyValue(p)).join('|')
          }),
        }
      }

      /** Properties that differ from the focused snapshot, or `null` when the element is gone or cannot be unfocused. */
      const blurredDiff = (idx: number): string[] | null => {
        const prev = els[idx]!
        if (!prev.isConnected) return null
        const before = snaps[idx]!
        // Tab can come straight back to the same element (a dialog with one control),
        // so it would be compared with itself: blur it for the reading, then give focus back.
        const stillFocused = activeEl() === prev
        if (stillFocused) {
          ;(prev as HTMLElement).blur()
          if (activeEl() === prev) return null
        }
        const after = snapshot(prev)
        if (stillFocused) (prev as HTMLElement).focus()
        const changed = new Set<string>()
        before.vals.forEach((b, i) => {
          // A different element in the slot (the DOM changed) says nothing about focus.
          if (before.els[i] !== after.els[i]) return
          // A neighbour that holds focus now is the next stop, whose own focus style says nothing about this one.
          if (after.neighbours[i] && after.els[i]?.matches(':focus-within')) return
          const a = b.split('|')
          const z = after.vals[i]!.split('|')
          props.forEach((p, k) => {
            if (a[k] !== z[k]) changed.add(`${after.labels[i]}${p}`)
          })
        })
        return Array.from(changed)
      }

      /** The element holding focus, recorded as visited the first time. */
      const focusState = () => {
        const el = activeEl()
        if (
          !el ||
          el === document.body ||
          el === document.documentElement ||
          el.hasAttribute('data-walk-sentinel')
        )
          return {
            kind: 'none' as const,
            idx: -1,
            seen: false,
            inRoot: false,
            modalOutside: false,
            inDialog: false,
            iframe: false,
          }
        let idx = els.indexOf(el)
        const seen = idx >= 0
        if (!seen) {
          els.push(el)
          idx = els.length - 1
          snaps[idx] = snapshot(el)
        }
        const modal = openModal()
        return {
          kind: 'stop' as const,
          idx,
          seen,
          inRoot: within(rootEl(), el),
          modalOutside: !!modal && !within(modal, el),
          inDialog: !!el.closest(dialogSel),
          iframe: el.tagName === 'IFRAME' || el.tagName === 'FRAME',
        }
      }

      const describe = (e: Element): string => {
        const classes = Array.from(e.classList)
          .slice(0, 2)
          .map((c) => '.' + c)
          .join('')
        const testid = e.getAttribute('data-testid')
        return (
          e.tagName.toLowerCase() +
          (e.id ? '#' + e.id : '') +
          classes +
          (testid ? `[data-testid="${testid}"]` : '')
        )
      }
      const chain = (el: Element): string => {
        const out: string[] = []
        for (let cur: Element | null = el, i = 0; cur && i < 3; cur = cur.parentElement, i++)
          out.unshift(describe(cur))
        return out.join(' > ')
      }

      const describeFocus = (idx: number) => {
        const el = els[idx]!
        const input = el as HTMLInputElement
        const tag = el.tagName.toLowerCase()
        const role =
          el.getAttribute('role') ??
          (tag === 'input' ? (inputRoles[input.type] ?? 'textbox') : (tagRoles[tag] ?? tag))
        const labelledby = el.getAttribute('aria-labelledby')
        const name = (
          el.getAttribute('aria-label') ??
          (labelledby ? document.getElementById(labelledby)?.textContent : null) ??
          input.labels?.[0]?.textContent ??
          el.textContent ??
          el.getAttribute('title') ??
          ''
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80)
        return { role, name, selector: chain(el) }
      }

      /**
       * Where `t` is on `start.png` (the page at scroll 0). A fixed element
       * keeps its viewport box. One inside a container scrolled away from 0, or
       * a sticky one once the window has scrolled, cannot be placed reliably:
       * an empty box, which is off the map. Anything else is offset by the
       * window's scroll. A transform on a fixed element's ancestor is not looked for.
       */
      const pageBoxOf = (t: Element, r: DOMRect) => {
        for (
          let cur: Element | null = t;
          cur && cur !== document.documentElement;
          cur = cur.parentElement
        ) {
          const position = getComputedStyle(cur).position
          if (position === 'fixed') return { x: r.left, y: r.top, w: r.width, h: r.height }
          if (position === 'sticky' && (window.scrollX || window.scrollY))
            return { x: 0, y: 0, w: 0, h: 0 }
          if (cur !== document.body && (cur.scrollTop || cur.scrollLeft))
            return { x: 0, y: 0, w: 0, h: 0 }
        }
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }
      }

      const geometry = (idx: number) => {
        const el = els[idx]!
        const proxy = proxyOf(el)
        const t = proxy ?? el
        const r = t.getBoundingClientRect()
        const cs = getComputedStyle(t)
        const vw = window.innerWidth
        const vh = window.innerHeight
        const inViewport = r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh
        const visible =
          r.width > 0 && r.height > 0 && cs.visibility === 'visible' && Number(cs.opacity) > 0
        let obscured = false
        if (visible && inViewport) {
          const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1)
          const cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1)
          const top = document.elementFromPoint(cx, cy)
          // A hidden input is often laid over its own custom control.
          obscured = !!top && top !== el && !within(t, top) && !within(top, t)
        }
        return {
          box: { x: r.left, y: r.top, w: r.width, h: r.height },
          pageBox: pageBoxOf(t, r),
          visible,
          inViewport,
          obscured,
          proxy: proxy ? chain(proxy) : null,
        }
      }

      W.__walk = { isModal, openModal, activeEl, blurredDiff, focusState, describeFocus, geometry }
    },
    {
      props: STYLE_PROPS,
      dialogSel: DIALOG_SELECTOR,
      tagRoles: TAG_ROLES,
      inputRoles: INPUT_ROLES,
    },
  )
}

const blurredDiff = (page: Page, idx: number): Promise<string[] | null> =>
  page.evaluate((i) => (window as any).__walk.blurredDiff(i), idx)

const focusState = (page: Page): Promise<FocusState> =>
  page.evaluate(() => (window as any).__walk.focusState())

const describeFocus = (page: Page, idx: number): Promise<FocusDescription> =>
  page.evaluate((i) => (window as any).__walk.describeFocus(i), idx)

const focusGeometry = (page: Page, idx: number): Promise<FocusGeometry> =>
  page.evaluate((i) => (window as any).__walk.geometry(i), idx)

/**
 * What {@link walkPage} needs.
 *
 * @experimental
 */
export interface WalkOptions {
  id: string
  /** Folder for the screenshots and `walk.json`; created. */
  outDir: string
  /** Stops before giving up. */
  max?: number
}

/**
 * Tab through the open page from the start of the document, then Shift+Tab
 * back, writing a screenshot per stop and `walk.json` to `outDir`. Records
 * what happened and judges nothing. The page must be a story that has been
 * opened and settled.
 *
 * @experimental
 */
export async function walkPage(page: Page, options: WalkOptions): Promise<WalkRecord> {
  const max = options.max ?? DEFAULT_WALK_MAX
  mkdirSync(options.outDir, { recursive: true })
  const viewport = page.viewportSize() ?? { width: 0, height: 0 }

  // A transition would leave the blurred element mid-fade and look like no change.
  await page.addStyleTag({
    content:
      '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}',
  })
  await installHelpers(page)
  const interactive = await page.evaluate((selector) => {
    const root = document.getElementById('storybook-root') ?? document.body
    return Array.from(root.querySelectorAll(selector)).filter(
      (el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
    ).length
  }, FOCUSABLE)

  // Focus the document's start: a zero-size tabindex=-1 marker first in the body,
  // so the first Tab goes to the first focusable element whatever the story's
  // `play` left focused. What `play` left focused, outside a dialog, is taken as
  // the opener that closing a dialog should return focus to: a story that opens
  // its dialog from a control leaves focus there. A story that renders its dialog
  // open and leaves focus on the body has no opener, and is not judged.
  await page.evaluate((dialogSel) => {
    const active = document.activeElement
    ;(window as any).__walkOpener =
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      !active.closest(dialogSel)
        ? active
        : null
    ;(active as HTMLElement | null)?.blur?.()
    window.scrollTo(0, 0)
    const s = document.createElement('div')
    s.setAttribute('data-walk-sentinel', '')
    s.tabIndex = -1
    s.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden'
    document.body.prepend(s)
    s.focus()
  }, DIALOG_SELECTOR)
  await page.screenshot({ path: join(options.outDir, 'start.png') })

  const modalOpen = await page.evaluate(() => (window as any).__walk.openModal() !== undefined)

  const stops: WalkStop[] = []
  let end: WalkEnd = 'max'
  let escaped = false
  let prevIdx = -1

  for (let n = 0; n < max + 1; n++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(TAB_SETTLE_MS)
    // The previous stop is blurred now: did anything about it change?
    const previous = stops[stops.length - 1]
    if (previous && prevIdx >= 0) {
      const diff = await blurredDiff(page, prevIdx)
      previous.indicator = diff === null ? null : diff.length > 0
      previous.indicatorProps = diff ?? []
    }
    const state = await focusState(page)
    if (state.kind === 'none') {
      end = 'left-document'
      break
    }
    if (state.seen) {
      end = 'cycled'
      break
    }
    if (stops.length >= max) {
      end = 'max'
      break
    }
    if (!state.inRoot && !state.inDialog && !state.modalOutside) {
      end = 'left-root'
      break
    }
    const index = stops.length + 1
    const described = await describeFocus(page, state.idx)
    const geometry = await focusGeometry(page, state.idx)
    const aria = await page
      .locator(':focus')
      .first()
      .ariaSnapshot({ timeout: 2000 })
      .then(parseAriaLine)
      .catch(() => null)
    const shot = `${String(index).padStart(2, '0')}.png`
    await page.screenshot({ path: join(options.outDir, shot) })
    const ariaUsable = aria && aria.role !== 'generic' && aria.role !== 'text'
    stops.push({
      index,
      role: ariaUsable ? aria.role : described.role,
      name: ariaUsable ? aria.name : described.name,
      selector: described.selector,
      box: geometry.box,
      pageBox: geometry.pageBox,
      visible: geometry.visible,
      inViewport: geometry.inViewport,
      obscured: geometry.obscured,
      indicator: null,
      indicatorProps: [],
      inDialog: state.inDialog,
      ...(geometry.proxy ? { proxy: geometry.proxy } : {}),
      shot,
    })
    prevIdx = state.idx
    if (state.modalOutside) {
      escaped = true
      end = 'escaped'
      break
    }
    // Another Tab would go into the frame, where the frame stays the active element.
    if (state.iframe) {
      end = 'iframe'
      break
    }
  }

  // The frame is a stop with nothing after it to retrace.
  const reverse = await checkReverse(page, end === 'iframe' ? stops.length - 1 : stops.length)
  const dialog = await checkDialog(page, stops, escaped, modalOpen)

  const record: WalkRecord = {
    id: options.id,
    theme: 'light',
    viewport,
    start: 'start.png',
    max,
    interactive,
    stops,
    end,
    reverse,
    dialog,
  }
  writeFileSync(join(options.outDir, 'walk.json'), JSON.stringify(record, null, 2))
  return record
}

/** From the last stop, Shift+Tab should reach each earlier stop in turn. */
async function checkReverse(page: Page, count: number): Promise<WalkReverse> {
  if (count < 2) return { checked: false, ok: true, mismatch: null }
  const focused = await page.evaluate((i) => {
    const el = (window as any).__walkEls[i] as HTMLElement
    el.focus()
    return document.activeElement === el
  }, count - 1)
  if (!focused) return { checked: false, ok: true, mismatch: null }
  for (let k = count - 1; k >= 1; k--) {
    await page.keyboard.press('Shift+Tab')
    await page.waitForTimeout(TAB_SETTLE_MS)
    const got = await page.evaluate(() => {
      const W = window as any
      return W.__walkEls.indexOf(W.__walk.activeEl()) + 1
    })
    if (got !== k) return { checked: true, ok: false, mismatch: { expected: k, got } }
  }
  return { checked: true, ok: true, mismatch: null }
}

/**
 * Escape from inside the first stop that is in a dialog: it closes, or focus
 * stays in it. When it closes, focus should go back to the opener.
 */
async function checkDialog(
  page: Page,
  stops: WalkStop[],
  escaped: boolean,
  modalOpen: boolean,
): Promise<WalkDialog> {
  const first = stops.find((s) => s.inDialog)
  if (!first)
    return {
      present: modalOpen,
      modal: modalOpen,
      escaped,
      escapeCloses: null,
      focusStaysInside: null,
      focusRestored: null,
    }
  const modal = await page.evaluate(
    ({ i, dialogSel }) => {
      const W = window as any
      const el = W.__walkEls[i] as HTMLElement
      el.focus()
      return W.__walk.isModal(el.closest(dialogSel)!)
    },
    { i: first.index - 1, dialogSel: DIALOG_SELECTOR },
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  const after = await page.evaluate(
    ({ i, dialogSel }) => {
      const W = window as any
      const el = W.__walkEls[i] as HTMLElement
      const dialog = el.closest(dialogSel)
      const open = !!dialog && dialog.isConnected && dialog.getClientRects().length > 0
      const active = W.__walk.activeEl() as Element | null
      const opener = (W.__walkOpener as Element | null)?.isConnected
        ? (W.__walkOpener as Element)
        : null
      const fellToBody = !active || active === document.body || active === document.documentElement
      return {
        open,
        inside: open && dialog!.contains(document.activeElement),
        focusRestored: open || !opener ? null : fellToBody ? false : active === opener,
      }
    },
    { i: first.index - 1, dialogSel: DIALOG_SELECTOR },
  )
  return {
    present: true,
    modal,
    escaped,
    escapeCloses: !after.open,
    focusStaysInside: after.open ? after.inside : null,
    focusRestored: after.focusRestored,
  }
}
