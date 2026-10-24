import type { Mode } from '@osdlc/system-model/match'

import { $, ALL, OPEN, persistTheme, SHUT, state } from './state.ts'
import { splitArgs } from '../args.ts'
import {
  escapeHtml,
  HELP,
  hideRunBar,
  listRows,
  measureChrome,
  render,
  saveRunnerOrder,
  setFocusedRow,
  showHandoff,
  showRunBar,
  showRunnerInfo,
  showRunTaken,
  runnerOrder,
  sortRunners,
} from './view.ts'
import type { SortKey } from './view.ts'
import { getConfig, load, requestRun, trustRepo } from './api.ts'
import { handleSettingsClick, openSettings } from './settings.ts'

// ------------------------------------------------------------------- run

/**
 * Ask for the terminal and deal with every way that ends.
 *
 * Shared by the row button and the run bar so the four outcomes are handled
 * once. `button`, when given, is disabled for the round trip: a double click
 * would otherwise send a second POST the server can only answer 409 to, and
 * "another run took the terminal" is a confusing thing to be told about
 * yourself.
 */
async function handOff(
  id: string,
  args: readonly string[],
  button?: HTMLButtonElement,
): Promise<void> {
  if (button) button.disabled = true
  const result = await requestRun(id, args)
  if (result.outcome === 'handed-off') {
    // The server is on its way out; nothing this page could fetch now would
    // succeed, so the polling stops before the view is replaced.
    stopPolling()
    hideRunBar()
    showHandoff(result.command)
    return
  }
  if (button) button.disabled = false
  if (result.outcome === 'taken' && button) showRunTaken(button)
  else if (result.outcome === 'taken') {
    $('status').innerHTML = '<span class="err">another run already took the terminal.</span>'
  } else if (result.outcome === 'gone') {
    // The request died with the connection, so this page has no server left to
    // talk to either — polling would only repeat the failure in the same line.
    stopPolling()
    $('status').innerHTML =
      '<span class="err">the terminal has already been handed off - this page is done.</span>'
  } else if (result.outcome === 'failed') {
    $('status').innerHTML = '<span class="err">run failed: ' + escapeHtml(result.detail) + '</span>'
  }
}

/**
 * Keys for the run bar's field: Enter runs what is typed, Escape goes back.
 *
 * Bound to the field itself rather than the document, so it dies with the bar
 * and cannot outlive it — a stale document listener would send a run for a
 * task the user had already dismissed.
 */
function armRunBar(id: string, field: HTMLInputElement): void {
  field.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      hideRunBar()
      return
    }
    if (ev.key !== 'Enter') return
    ev.preventDefault()
    const args = splitArgs(field.value)
    hideRunBar()
    void handOff(id, args)
  })
}

// ---------------------------------------------------------------- events

/**
 * The refresh loop, and the flag that ends it.
 *
 * The flag is not redundant with clearing the interval: the focus listener is
 * a second way in, and one flag turns both off in one place.
 */
let pollTimer: ReturnType<typeof setInterval> | undefined
let polling = true

/** Stop refreshing for good. The server is exiting; there is nothing to poll. */
function stopPolling(): void {
  polling = false
  clearInterval(pollTimer)
}

/** Wire every listener the page needs. Called once, at boot. */
export function wireInput(): void {
  let debounce: ReturnType<typeof setTimeout> | undefined
  $('q').addEventListener('input', (e) => {
    state.query = (e.target as HTMLInputElement).value
    clearTimeout(debounce)
    debounce = setTimeout(render, 40)
  })
  // Focus reaching the SEARCH BOX is what returns the enter-target mark to the
  // top hit. Every route back to the field - Escape from a row, "/", a click -
  // lands here, so the marking is corrected in one place rather than at each of
  // them. Moving to a toolbar button instead leaves the row marked: Enter there
  // presses that button, so the mark is not claiming anything false.
  $('q').addEventListener('focus', () => {
    if (state.focusedId !== null) setFocusedRow(null)
  })

  $('q').addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent
    if (ev.key === 'Enter') {
      const row =
        document.querySelector('tbody tr.enter-target') ?? document.querySelector('tbody tr')
      if (!row) return
      copyRow(row as HTMLElement)
      // Enter both takes the top hit and hands the list over: from here the
      // arrows walk the results, which is the natural next move after seeing
      // that the top hit was not the one wanted.
      setFocusedRow((row as HTMLElement).dataset.id ?? null)
      ;(row as HTMLElement).focus()
    }
    if (ev.key === 'Escape') {
      state.query = ''
      ;($('q') as HTMLInputElement).value = ''
      render()
    }
  })

  $('mode').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-mode]') as HTMLButtonElement | null
    if (!b) return
    state.mode = b.dataset.mode as Mode
    for (const btn of $('mode').children) btn.setAttribute('aria-pressed', String(btn === b))
    render()
  })

  $('services').addEventListener('click', (e) => {
    state.servicesOnly = !state.servicesOnly
    ;(e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(state.servicesOnly))
    render()
  })

  // Delegated, because the tab row is rebuilt on every render.
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    // The settings dialog repaints its own body on every edit, so its controls
    // are as delegated as the tab row's. Asked first and given the whole
    // event: while it is open it owns the clicks inside it.
    if (target.closest('#settings') !== null && handleSettingsClick(target)) return
    const info = target.closest('[data-info-runner]') as HTMLElement | null
    if (info) {
      showRunnerInfo(info.dataset.infoRunner!)
      return
    }

    // Trusting a repository permits its code to run, so the click is not the
    // decision — the confirm is. Deliberately blocking and native: a bespoke
    // dialog here would be one more thing to dismiss by reflex.
    if (target.closest('[data-trust-repo]')) {
      if (
        confirm(
          'Trust this repository? Its runners will be read by running them, now and on every later visit, until you untrust it.',
        )
      ) {
        void trustRepo()
      }
      return
    }

    if (target.closest('#helpbtn')) {
      $('help-body').innerHTML = HELP
      ;($('help') as HTMLDialogElement).showModal()
      return
    }

    // The picker's pointer at the durable setting. Same handler as the gear,
    // so the two routes into the dialog cannot drift apart.
    if (target.closest('[data-open-settings]') || target.closest('#settingsbtn')) {
      // Opened first, filled second: the fetch is a round trip, and a dialog
      // that appears only once the server answers reads as a click that did
      // nothing.
      $('settings-body').innerHTML = '<p class="set-empty">Reading configuration…</p>'
      ;($('settings') as HTMLDialogElement).showModal()
      void getConfig().then((config) => {
        $('settings-body').innerHTML = openSettings(config, [...state.knownRunners])
      })
      return
    }

    const menu = document.getElementById('pickmenu')
    const openBtn = target.closest('#pickbtn')
    if (openBtn && menu) {
      const show = menu.hidden
      menu.hidden = !show
      openBtn.setAttribute('aria-expanded', String(show))
      return
    }

    const box = target.closest('input[data-toggle-runner]') as HTMLInputElement | null
    if (box) {
      const runner = box.dataset.toggleRunner!
      if (box.checked) state.enabled?.add(runner)
      else state.enabled?.delete(runner)
      // The click already toggled the checkbox, so state and the DOM agree
      // before the rebuild. render() puts the menu and the focus back.
      render()
      return
    }

    // Sorting is a REORDER, not a view of its own: it writes the same
    // persisted order the drag writes, so the tab bar follows immediately.
    const sort = target.closest('[data-sort-runners]') as HTMLElement | null
    if (sort) {
      sortRunners(sort.dataset.sortRunners as SortKey, Number(sort.dataset.sortDir) === -1 ? -1 : 1)
      return
    }

    if (target.closest('[data-pick-all]')) {
      state.enabled = new Set(state.knownRunners)
      render()
      return
    }
    if (target.closest('[data-pick-none]')) {
      state.enabled = new Set()
      render()
      return
    }

    // The folded-empties chip is a shortcut into the picker, not a menu of
    // its own: everything it would say (0 tasks, not trusted, failed) is
    // already on each picker row. It only ever OPENS. Synthesising a click on
    // #pickbtn would land on that button's toggle branch, so clicking the chip
    // with the menu already open would close it — the opposite of what the
    // chip's own label promises. Focus follows to the picker button, so the
    // menu the chip just opened is where the keyboard already is.
    if (target.closest('[data-open-picker]')) {
      const btn = document.getElementById('pickbtn')
      if (menu) menu.hidden = false
      btn?.setAttribute('aria-expanded', 'true')
      btn?.focus()
      return
    }

    // A click anywhere else closes it.
    if (menu && !target.closest('.picker')) menu.hidden = true
  })

  /**
   * Drag-to-reorder, shared by the tab bar and the picker: both mark their
   * draggables with a runner id, so one pair of handlers serves the two
   * surfaces.
   *
   * The drag PREVIEWS itself. A solid clone carries the pointer in place of
   * the browser's near-transparent default ghost, and the real elements move
   * as the pointer passes their midpoints - the dragged one among them, faded,
   * marking the slot it would land in. So the list shows the order the drop
   * will produce rather than only revealing it afterwards.
   *
   * The DOM is only the preview. State stays the source of truth: the drop
   * commits through saveRunnerOrder, and a drag abandoned without one
   * re-renders from the persisted order, which snaps everything back.
   */
  let dragging: string | null = null
  let dragEl: HTMLElement | null = null
  let ghost: HTMLElement | null = null
  /**
   * The arrangement the user has actually SEEN, refreshed once per animation
   * frame. Chromium delivers a last `dragover` in the same task as the `drop`,
   * so the move that dragover makes is committed without ever being painted -
   * and what persisted was one position off from what was on screen.
   * Committing this snapshot instead makes what lands what was last shown.
   */
  let painted: string[] = []
  let paintQueued = false

  /** The runners the drag's own surface shows, in the order it shows them. */
  const shownOrder = (surface: HTMLElement): string[] =>
    [...surface.children]
      .map((c) => runnerOf(c as HTMLElement))
      .filter((r): r is string => r !== null && r !== ALL)

  /** Record the arrangement the frame about to be drawn will show. */
  function snapshotPainted(surface: HTMLElement): void {
    if (paintQueued) return
    paintQueued = true
    requestAnimationFrame(() => {
      paintQueued = false
      if (dragEl) painted = shownOrder(surface)
    })
  }

  /**
   * Put the page back the way a drag found it. Idempotent, and called from BOTH
   * ends: `drop` runs it before committing, because the commit re-renders the
   * tab strip and the picker, which detaches the drag source - and Chromium
   * fires no `dragend` for a source that is no longer in the document. Cleanup
   * left to that event alone simply never ran, so every committed drag leaked
   * its ghost and left the drag state armed.
   *
   * Returns whether there was a drag to end, which is what tells `dragend` it
   * is the cancel path rather than the tail of a commit.
   */
  function endDrag(): boolean {
    if (!dragEl) return false
    ghost?.remove()
    dragEl.classList.remove('dragging')
    ghost = null
    dragEl = null
    dragging = null
    painted = []
    return true
  }

  document.addEventListener('dragstart', (e) => {
    const el = (e.target as HTMLElement).closest(
      '[data-runner][draggable], [data-drag-runner]',
    ) as HTMLElement | null
    const dt = (e as DragEvent).dataTransfer
    const runner = el ? (el.dataset.dragRunner ?? el.dataset.runner ?? null) : null
    if (!el || !dt || runner === null) return
    // A tab's own `i` button rides beside it inside `.tab`, so the whole span
    // is what moves; a picker row is already the whole thing.
    dragEl = (el.closest('.tab') as HTMLElement | null) ?? el
    dragging = runner
    dt.effectAllowed = 'move'
    // Some engines need data set for the drag to begin at all.
    dt.setData('text/plain', runner)
    ghost = makeDragGhost(dragEl, e as DragEvent, dt)
    dragEl.classList.add('dragging')
    const surface = dragEl.parentElement
    painted = surface ? shownOrder(surface) : []
  })

  document.addEventListener('dragover', (e) => {
    if (!dragEl) return
    const ev = e as DragEvent
    const surface = dragEl.parentElement
    // The whole SURFACE takes the drop - the tab strip, or the picker menu -
    // not only a sibling the pointer could be slid past. The preview has
    // already settled the order, so a release anywhere inside it commits what
    // is shown. Refusing the gaps, the `all` tab and the folded chip threw the
    // whole drag away on a release over one of them, and the preview's own
    // reflow can slide such a spot under a pointer that never moved.
    if (!surface || !surface.contains(ev.target as Node)) return
    ev.preventDefault() // required, or drop never fires
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
    // Landing ON something is still what MOVES anything. The `all` tab is an
    // aggregate and the folded-empties chip is a shortcut, not a runner:
    // neither is a position, so neither displaces the dragged element.
    const over = (ev.target as HTMLElement).closest(
      '.tabs .tab, [data-drag-runner]',
    ) as HTMLElement | null
    if (!over || over === dragEl || over.parentElement !== surface) return
    if (runnerOf(over) === null || runnerOf(over) === ALL) return
    slideInto(surface, dragEl, isAfter(ev, over) ? over.nextSibling : over)
    snapshotPainted(surface)
  })

  document.addEventListener('drop', (e) => {
    if (!dragEl || dragging === null) return
    e.preventDefault()
    const moved = dragging
    const shown = painted
    // Cleanup FIRST: the commit re-renders and takes the drag source with it.
    endDrag()
    commitDragOrder(shown, moved)
  })

  document.addEventListener('dragend', () => {
    // The cancel path. A committed drop has already cleaned up, so this is a
    // no-op there. The preview moved real elements, so a drag that ended
    // nowhere has to be put back - and the persisted order is the only thing
    // that knows where.
    if (endDrag()) render()
  })

  // One button cycling System - Light - Dark, rather than three showing the
  // choices. It reports the scheme in force and its title names the next one.
  $('theme').addEventListener('click', () => {
    const choice = THEME_CYCLE[$('theme').dataset.themeChoice ?? 'system'] ?? 'light'
    // Absent means "follow the system", which is what the media query already
    // does; an explicit value overrides it in either direction.
    if (choice === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', choice)
    setThemeButton(choice)
    persistTheme(choice)
  })

  $('depth').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-depth]') as HTMLButtonElement | null
    if (!b) return
    state.depth = Number(b.dataset.depth)
    for (const btn of $('depth').children) btn.setAttribute('aria-pressed', String(btn === b))
    render()
  })

  $('declared').addEventListener('click', (e) => {
    state.declaredOnly = !state.declaredOnly
    ;(e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(state.declaredOnly))
    render()
  })

  $('expand').addEventListener('click', (e) => {
    state.allCollapsed = !state.allCollapsed
    if (state.allCollapsed) {
      for (const n of document.querySelectorAll<HTMLElement>('.node'))
        state.collapsed.add(n.dataset.key!)
    } else {
      state.collapsed.clear()
    }
    ;(e.currentTarget as HTMLElement).textContent = state.allCollapsed ? 'Expand' : 'Collapse'
    render()
  })

  $('refresh').addEventListener('click', () => load(true))

  $('tabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-runner]') as HTMLButtonElement | null
    if (!b) return
    state.runner = b.dataset.runner!
    render()
  })

  $('out').addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const copy = target.closest('.copy') as HTMLElement | null
    if (copy) {
      await copyCommand(copy)
      return
    }
    const run = target.closest('.runbtn') as HTMLButtonElement | null
    if (run) {
      const id = run.dataset.runId ?? ''
      // A recipe that declares parameters cannot be run from the row: `argv`
      // omits them, so the click would spawn `just deploy` with no environment
      // and the terminal would be gone before anyone could say so. The bar
      // collects the tail first; the run happens from there.
      const task = (state.catalog?.reports ?? []).flatMap((r) => r.tasks).find((t) => t.id === id)
      if (task && task.parameters.length > 0) {
        armRunBar(task.id, showRunBar(task))
        return
      }
      await handOff(id, [], run)
      return
    }
    const head = target.closest('.head') as HTMLElement | null
    if (!head) return
    const node = head.parentElement as HTMLElement
    const key = node.dataset.key!
    if (state.collapsed.has(key)) state.collapsed.delete(key)
    else state.collapsed.add(key)
    node.dataset.collapsed = String(state.collapsed.has(key))
    node.querySelector('.twisty')!.textContent = state.collapsed.has(key) ? SHUT : OPEN
  })

  /**
   * The results list as one keyboard surface. Rows are <tr> spread across a
   * table per tree group, so "next row" is the next row in DOCUMENT order
   * across all of #out rather than within one table.
   */
  $('out').addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent
    const row = (ev.target as HTMLElement).closest('tbody tr') as HTMLElement | null
    if (!row) return

    if (ev.key === 'Escape') {
      // Focus returns to the search box; the query is left alone. Clearing it
      // is the search box's OWN Escape, and losing a query just to get back to
      // the field would be a surprise.
      ev.preventDefault()
      ;($('q') as HTMLInputElement).focus()
      return
    }

    // Arrows and Enter belong to the row itself. Once Tab has moved into the
    // row's copy button the keys are the button's, so an Enter or a Space
    // there presses it rather than being intercepted here.
    if (ev.target !== row) return

    if (ev.key === 'Enter') {
      ev.preventDefault()
      copyRow(row)
      return
    }

    const step = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    ev.preventDefault()
    const rows = listRows()
    const at = rows.indexOf(row)
    // Clamped, not wrapped: at the last row ArrowDown stays put. A list this
    // long has no visible seam between its end and its start, so a wrap would
    // read as the page having jumped rather than as the cursor having moved.
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + step))]
    if (!next || next === row) return
    setFocusedRow(next.dataset.id ?? null)
    next.focus()
    next.scrollIntoView({ block: 'nearest' })
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('q')) {
      e.preventDefault()
      ;($('q') as HTMLInputElement).focus()
      ;($('q') as HTMLInputElement).select()
      return
    }
    // Escape dismisses the picker and hands focus back to the button that
    // opened it, or the menu would close under a focus that has nowhere to go.
    // Scoped to a focus already inside the picker: Escape in the search box
    // belongs to the query, and one key must not mean two things at once.
    if (e.key !== 'Escape') return
    const menu = document.getElementById('pickmenu')
    const picker = document.getElementById('pickerhost')
    if (!menu || menu.hidden || !picker?.contains(document.activeElement)) return
    e.preventDefault()
    menu.hidden = true
    const btn = document.getElementById('pickbtn')
    btn?.setAttribute('aria-expanded', 'false')
    btn?.focus()
  })

  // A resize changes the pixel column widths, so this re-renders rather than
  // only re-measuring the chrome.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  window.addEventListener('resize', () => {
    measureChrome()
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(render, 60)
  })

  // Stay current without being asked: on window focus, and on a slow poll.
  // Both stop for good once the terminal has been handed off — see stopPolling.
  window.addEventListener('focus', () => {
    if (polling) load(false)
  })
  pollTimer = setInterval(() => {
    if (polling && !document.hidden) load(false)
  }, 15000)

  // The authored placeholder is a sentence, and at 1100px it truncated
  // mid-word inside a field the toolbar has already taken its share of. The
  // short form fits every width; the sentence moves to the field's own title,
  // and the help modal says it at length.
  const q = $('q') as HTMLInputElement
  q.title = q.placeholder
  // A placeholder names a field only while the field is empty, so typing one
  // character left this input nameless. The authored sentence becomes the name
  // proper, which the short placeholder then no longer has to carry.
  q.setAttribute('aria-label', q.placeholder)
  q.placeholder = 'Search commands'

  for (const id of ['mode', 'depth']) rovingGroup($(id))
  rovingGroup($('tabs'), 'button[data-runner]')
}

/**
 * Put a row's command on the clipboard and say what happened.
 *
 * The button is the ONLY evidence anyone has that the paste buffer changed, so
 * a refused write — a permissions policy, a page that is not the active
 * document — must not be reported as a copy. Returns whether it landed.
 */
async function copyCommand(copy: HTMLElement): Promise<boolean> {
  let ok = true
  try {
    await navigator.clipboard.writeText(copy.dataset.run ?? '')
  } catch {
    ok = false
  }
  copy.textContent = ok ? 'copied' : 'blocked'
  if (ok) copy.classList.add('done')
  setTimeout(() => {
    copy.textContent = 'copy'
    copy.classList.remove('done')
  }, 1200)
  return ok
}

/**
 * Copy a row's command and say so on the row.
 *
 * The confirmation is on the ROW, not just the button, because both paths that
 * reach here act at a distance: from the search box the button is off to the
 * right of where the eye is, and from a focused row the keypress named the row
 * rather than the button. One helper, so the two paths cannot drift.
 */
function copyRow(row: HTMLElement): void {
  const button = row.querySelector('.copy') as HTMLElement | null
  if (button === null) return
  // What a real click on that button did on the way past: the document's click
  // handler closes the picker on any click outside it. `copyCommand` is called
  // rather than clicked — the flash below needs its answer, and a click cannot
  // be awaited — so the close is done here rather than quietly lost.
  const menu = document.getElementById('pickmenu')
  if (menu) menu.hidden = true
  // The flash is a second claim that the command was copied, so it waits on
  // the same answer the button does.
  void copyCommand(button).then((ok) => {
    if (!ok) return
    row.classList.remove('copied')
    // Reading offsetWidth restarts the animation when Enter is pressed again
    // before the previous flash has finished.
    void row.offsetWidth
    row.classList.add('copied')
    setTimeout(() => row.classList.remove('copied'), 700)
  })
}

/** Whether the pointer is past the target's midpoint (x for tabs, y for picker rows). */
function isAfter(e: DragEvent, el: HTMLElement): boolean {
  const box = el.getBoundingClientRect()
  return el.hasAttribute('data-drag-runner')
    ? e.clientY > box.top + box.height / 2
    : e.clientX > box.left + box.width / 2
}

/** The runner a reorderable element stands for, or null when it stands for none. */
function runnerOf(el: HTMLElement): string | null {
  return (
    el.dataset.dragRunner ?? el.querySelector<HTMLElement>('[data-runner]')?.dataset.runner ?? null
  )
}

/**
 * The drag image: a solid, elevated copy of what is being dragged.
 *
 * setDragImage only takes an element that is rendered, so the clone is put in
 * the document and parked off-screen by its own class. It is removed at
 * dragend rather than on the next tick, because a snapshot the engine has not
 * taken yet cannot be removed early.
 */
function makeDragGhost(el: HTMLElement, e: DragEvent, dt: DataTransfer): HTMLElement {
  const box = el.getBoundingClientRect()
  const clone = el.cloneNode(true) as HTMLElement
  clone.classList.add('dragghost')
  clone.setAttribute('data-drag-ghost', '')
  clone.removeAttribute('draggable')
  // A copy is not a control. Every attribute the page identifies a runner by
  // is stripped from it, or the ghost would answer a query for the runner it
  // depicts and be counted as a second one.
  for (const node of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    node.removeAttribute('id')
    for (const attr of [
      'data-drag-runner',
      'data-runner',
      'data-toggle-runner',
      'data-info-runner',
    ]) {
      node.removeAttribute(attr)
    }
  }
  // Height carries over from the source; WIDTH does not. The source's width
  // counts children the ghost drops (the info button, the grip), so copying it
  // would leave a card of blank space to the right of everything drawn in it.
  // Letting the copy size itself makes the card exactly its own content.
  clone.style.height = box.height + 'px'
  document.body.appendChild(clone)
  // The grab point is measured on the source, so it can land past the narrower
  // copy's right edge; held there it would drag by a corner it is not under.
  const width = clone.getBoundingClientRect().width
  dt.setDragImage(clone, Math.min(e.clientX - box.left, width), e.clientY - box.top)
  return clone
}

/**
 * Move `moving` before `before` and let the displaced siblings slide there.
 *
 * insertBefore is instant, so the shift would otherwise be a jump with nothing
 * connecting the two arrangements. Each sibling's old position is measured,
 * then it is offset back to it and released - the standard
 * first/last/invert/play. Reduced motion keeps the jump, which is the setting
 * asking for exactly that.
 */
function slideInto(parent: HTMLElement, moving: HTMLElement, before: Node | null): void {
  if (moving.nextSibling === before && before !== null) return
  const kids = [...parent.children] as HTMLElement[]
  const was = new Map(kids.map((k) => [k, k.getBoundingClientRect()]))
  parent.insertBefore(moving, before)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const k of kids) {
    if (k === moving) continue
    const from = was.get(k)!
    const to = k.getBoundingClientRect()
    const dx = from.left - to.left,
      dy = from.top - to.top
    if (!dx && !dy) continue
    k.style.transition = 'none'
    k.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)'
    requestAnimationFrame(() => {
      k.style.transition = ''
      k.style.transform = ''
    })
  }
}

/**
 * Commit a previewed arrangement to the persisted order.
 *
 * The surface being dragged shows a SUBSET of the runners - the tab bar folds
 * the empty ones and hides the disabled ones - so the preview cannot simply
 * become the order. All a drag settles is where the moved runner sits AMONG THE
 * ONES ON SCREEN, and the runners it never showed must keep the neighbours they
 * have. So the moved runner is anchored to its new visible SUCCESSOR, or to its
 * visible predecessor when it was dropped last: a drop at the head means
 * "before the first VISIBLE runner", not "at the front of the full list", which
 * would hoist it past folded and disabled runners the user never saw.
 */
function commitDragOrder(shown: string[], moved: string): void {
  const order = runnerOrder().filter((r) => r !== moved)
  const at = shown.indexOf(moved)
  if (at === -1) return
  const after = shown.slice(at + 1).find((r) => order.includes(r))
  const before = shown
    .slice(0, at)
    .reverse()
    .find((r) => order.includes(r))
  const to =
    after !== undefined
      ? order.indexOf(after)
      : before !== undefined
        ? order.indexOf(before) + 1
        : 0
  order.splice(to, 0, moved)
  saveRunnerOrder(order)
}

/**
 * Make a group of buttons ONE tab stop, moved within by arrow keys.
 *
 * Without this, two segmented controls and eight runner tabs are a dozen
 * stops between the search box and anything else — Tab stops meaning "next
 * control" and starts meaning "next button", which is the opposite of what
 * a keyboard user expects. Only the active button stays reachable by Tab;
 * the rest are reached with the arrows, as a radio group or tablist is.
 */
function rovingGroup(container: HTMLElement | null, selector = 'button'): void {
  if (!container) return
  // Scoped by selector because the tab row also hosts each tab's `i` button: a
  // bare `button` sweep would fold those into the roving group and cost them
  // their own tab stop.
  const buttons = () => [...container.querySelectorAll<HTMLElement>(selector)]

  const sync = () => {
    const all = buttons()
    const active = all.find((b) => b.getAttribute('aria-pressed') === 'true') ?? all[0]
    for (const b of all) b.tabIndex = b === active ? 0 : -1
  }
  sync()
  // The tab row is rebuilt on every render, so re-derive after each one.
  new MutationObserver(sync).observe(container, { childList: true, subtree: true })

  container.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent
    const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const all = buttons()
    const at = all.indexOf(document.activeElement as HTMLElement)
    const index = (Math.max(0, at) + step + all.length) % all.length
    const next = all[index]
    if (!next) return
    next.focus()
    next.click()
    // The click can rebuild the group wholesale — the tab strip is re-rendered
    // on every render — which detaches the button just focused and drops focus
    // to <body>, leaving the next arrow press with nothing to act on. Focus is
    // taken back by POSITION rather than by identity: a click inside a roving
    // group selects, it never adds or removes members, and a group that did
    // change length simply leaves focus where it is rather than guessing.
    const rebuilt = buttons()[index]
    if (rebuilt !== undefined && rebuilt !== document.activeElement) rebuilt.focus()
  })
}

/** The colour-scheme cycle: what a click on the theme button moves to. */
const THEME_CYCLE: Record<string, string> = { system: 'light', light: 'dark', dark: 'system' }

/** How each scheme presents itself once it is the one in force. */
const THEME_FACE: Record<string, { glyph: string; name: string; note: string }> = {
  system: { glyph: '◐', name: 'System', note: ' (follows your OS)' },
  light: { glyph: '☀', name: 'Light', note: '' },
  dark: { glyph: '☾', name: 'Dark', note: '' },
}

/**
 * Paint the theme button for the choice now in force.
 *
 * The button shows the CURRENT scheme, so both the title and the accessible
 * name have to carry two facts: what is on, and what a click does next. A
 * single cycling control has no other place to say the second one, and a name
 * carrying only the first would leave a screen-reader user guessing what the
 * press does. Boot calls this too, so the button and the restored preference
 * agree from the first frame.
 */
export function setThemeButton(choice: string): void {
  const btn = $('theme')
  const face = THEME_FACE[choice] ?? THEME_FACE['system']!
  const next = THEME_FACE[THEME_CYCLE[choice] ?? 'light']!
  btn.dataset.themeChoice = choice
  btn.textContent = face.glyph
  btn.title = 'Colour scheme: ' + face.name + face.note + '. Click for ' + next.name + '.'
  btn.setAttribute('aria-label', 'Colour scheme: ' + face.name + '. Click for ' + next.name + '.')
}
