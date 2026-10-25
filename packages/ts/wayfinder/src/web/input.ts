import type { Task } from '@osdlc/system-model/detect'
import type { Mode } from '@osdlc/system-model/match'

import { $, ALL, allTasks, OPEN, SHUT, SKILLS, state } from './state.ts'
import { splitArgs } from '../args.ts'
import type { Theme } from '../config-keys.ts'
import { parametersUnknownLabel } from '../vocabulary.ts'
import {
  escapeHtml,
  helpHtml,
  hideRunBar,
  listRows,
  measureChrome,
  openDialogAtTop,
  render,
  setFocusedRow,
  showHandoff,
  showRunBar,
  showRunnerInfo,
  showRunTaken,
  runnerOrder,
  setThemeButton,
  sortRunners,
  THEME_CYCLE,
} from './view.ts'
import type { SortKey } from './view.ts'
import {
  failureText,
  load,
  loadTools,
  readConfig,
  requestRun,
  setSetting,
  trustRepo,
  unsetSetting,
} from './api.ts'
import { handleSettingsClick, openSettings } from './settings.ts'

// ------------------------------------------------------------ preferences

function statusLine(html: string): void {
  $('status').innerHTML = html
}

/**
 * Use `order` as the runner order and save it as `runners.order` in the user
 * config, as `way config set runners.order <json> --user` does. A project
 * file's order wins over the user's, so the page says so when one is set.
 */
export async function saveRunnerOrder(order: string[]): Promise<void> {
  state.runnerOrder = order
  render()
  const result = await setSetting('runners.order', order, 'user')
  if (!result.ok) {
    statusLine(
      '<span class="err">' + escapeHtml('order not saved: ' + failureText(result)) + '</span>',
    )
    return
  }
  if (state.runnerOrderSource === 'project') {
    statusLine(
      '<span>' +
        escapeHtml(
          'Order saved to ' +
            result.doc.file +
            ". This project's config also sets runners.order, and it wins on the next start.",
        ) +
        '</span>',
    )
  } else {
    state.runnerOrderSource = 'user'
  }
}

/**
 * Save the theme as `theme` in the user config. `system` removes the
 * setting, so the browser decides again.
 */
async function saveTheme(choice: Theme): Promise<void> {
  const result =
    choice === 'system'
      ? await unsetSetting('theme', 'user')
      : await setSetting('theme', choice, 'user')
  // Unsetting a theme that was never set is not a failure worth showing.
  if (!result.ok && choice !== 'system') {
    statusLine(
      '<span class="err">' + escapeHtml('theme not saved: ' + failureText(result)) + '</span>',
    )
  }
}

// ------------------------------------------------------------------- run

/**
 * Ask for the terminal and handle every outcome.
 *
 * Shared by the row button and the run bar so the four outcomes are handled
 * in one place. `button`, when given, is disabled for the round trip.
 * Otherwise a double click would send a second POST that gets a 409, and the
 * user would be told "another run took the terminal" about their own click.
 */
async function handOff(
  id: string,
  args: readonly string[],
  button?: HTMLButtonElement,
): Promise<void> {
  if (button) button.disabled = true
  const result = await requestRun(id, args)
  if (result.outcome === 'handed-off') {
    // The server is stopping, so no fetch from this page can succeed now.
    // Polling stops before the view is replaced.
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
    // The connection closed, so this page has no server left to talk to.
    // Polling would only repeat the failure in the same line.
    stopPolling()
    $('status').innerHTML =
      '<span class="err">the terminal has already been handed off - this page is done.</span>'
  } else if (result.outcome === 'failed') {
    $('status').innerHTML = '<span class="err">run failed: ' + escapeHtml(result.detail) + '</span>'
  }
}

/**
 * Run a task the way the row's Run button does. A task that declares
 * parameters, or whose parameters could not be read, asks for its arguments
 * first: running it bare would hand over the terminal before anything could
 * say it needed some. A task that uses an editor variable is not run.
 */
function runTask(task: Task, button?: HTMLButtonElement): void {
  if (task.parametersUnknown === 'editor-variable') {
    statusLine(
      '<span class="err">' +
        escapeHtml(task.display + ': ' + parametersUnknownLabel('editor-variable')) +
        '</span>',
    )
    return
  }
  if (task.parameters.length > 0 || task.parametersUnknown !== undefined) {
    armRunBar(task.id, showRunBar(task))
    return
  }
  void handOff(task.id, [], button)
}

/** The task a row stands for. */
function taskOfRow(row: HTMLElement): Task | undefined {
  return allTasks().find((t) => t.id === row.dataset.id)
}

/**
 * Keys for the run bar's field: Enter runs what is typed, Escape goes back.
 *
 * Bound to the field rather than the document, so it goes away with the bar.
 * A leftover document listener could send a run for a task the user had
 * already dismissed.
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
 * The flag is needed as well as clearing the interval, because the focus
 * listener also loads. One flag turns both off in one place.
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
  // Focus on the search box moves the enter-target mark back to the top hit.
  // Every way back to the field (Escape from a row, "/", a click) ends here, so
  // the mark is reset in one place. Moving to a toolbar button leaves the row
  // marked. Enter there presses that button, so the mark is still accurate.
  $('q').addEventListener('focus', () => {
    if (state.focusedId !== null) setFocusedRow(null)
  })

  $('q').addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent
    if (ev.key === 'Enter') {
      const row =
        document.querySelector('tbody tr.enter-target') ?? document.querySelector('tbody tr')
      if (!row) return
      // Shift+Enter runs the top hit through the same steps as its Run button.
      if (ev.shiftKey) {
        ev.preventDefault()
        const task = taskOfRow(row as HTMLElement)
        if (task) runTask(task, row.querySelector<HTMLButtonElement>('.runbtn') ?? undefined)
        // A skill row has no task: Run on it copies `/<name>`.
        else copyRow(row as HTMLElement)
        return
      }
      copyRow(row as HTMLElement)
      // Enter copies the top hit and moves focus to the list. From there the
      // arrows move through the results, which helps when the top hit was not
      // the one wanted.
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

    // The settings dialog repaints its body on every edit, so its controls are
    // handled here too, like the tab row's. It is checked first, and handles
    // every click inside it while it is open.
    if (target.closest('#settings') !== null && handleSettingsClick(target)) return
    const info = target.closest('[data-info-runner]') as HTMLElement | null
    if (info) {
      showRunnerInfo(info.dataset.infoRunner!)
      return
    }

    // Trusting a repository lets its code run, so the confirm, not the click,
    // is the decision. The server answers the first request with a nonce and
    // runs the grant only when the person has said yes (see `trustRepo`).
    if (target.closest('[data-trust-repo]')) {
      void trustRepo()
      return
    }

    if (target.closest('#helpbtn')) {
      openHelp()
      return
    }

    if (target.closest('#filtersbtn')) {
      setFiltersOpen($('filtersbtn').getAttribute('aria-expanded') !== 'true')
      return
    }

    // The picker's link to the saved setting. It shares the gear's handler, so
    // both ways into the dialog behave the same.
    if (target.closest('[data-open-settings]') || target.closest('#settingsbtn')) {
      // Open first, fill second. The fetch is a round trip, and a dialog that
      // appears only once the server answers looks like a click that did
      // nothing.
      $('settings-body').innerHTML = '<p class="set-empty">Reading configuration…</p>'
      openDialogAtTop('settings')
      // The tool info is read at startup; read again if that failed.
      void Promise.all([readConfig(), state.tools.length === 0 ? loadTools() : null]).then(
        ([config]) => {
          $('settings-body').innerHTML = openSettings(config, [...state.knownRunners])
          openDialogAtTop('settings')
        },
      )
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

    // Sorting reorders, rather than being a separate view. It writes the same
    // saved order a drag writes, so the tab bar updates at once.
    const sort = target.closest('[data-sort-runners]') as HTMLElement | null
    if (sort) {
      const dir = Number(sort.dataset.sortDir) === -1 ? -1 : 1
      void saveRunnerOrder(sortRunners(sort.dataset.sortRunners as SortKey, dir))
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

    // The chip for folded empty runners is a shortcut into the picker, not a
    // menu of its own: what it would say (0 tasks, not trusted, failed) is
    // already on each picker row. It only opens the menu. A synthetic click
    // on #pickbtn would toggle, so clicking the chip with the menu open would
    // close it, the opposite of what its label says. Focus moves to the
    // picker button, so the keyboard is at the menu the chip opened.
    if (target.closest('[data-open-picker]')) {
      const btn = document.getElementById('pickbtn')
      if (menu) menu.hidden = false
      btn?.setAttribute('aria-expanded', 'true')
      btn?.focus()
      return
    }

    // A click anywhere else closes it, and the Filters menu too.
    if (menu && !target.closest('.picker')) menu.hidden = true
    if (!target.closest('#filters')) setFiltersOpen(false)
  })

  /**
   * Drag to reorder, shared by the tab bar and the picker. Both mark their
   * draggable elements with a runner id, so one set of handlers serves both.
   *
   * The drag shows a preview. A solid clone follows the pointer instead of the
   * browser's faint default drag image, and the real elements move as the
   * pointer passes their midpoints. The dragged element moves with them,
   * faded, to mark where it would land. So the list shows the order the drop
   * will produce before the drop.
   *
   * The DOM is only the preview. State is the source of truth: the drop saves
   * through saveRunnerOrder, and a drag cancelled without a drop re-renders
   * from the saved order, which puts everything back.
   */
  let dragging: string | null = null
  let dragEl: HTMLElement | null = null
  let ghost: HTMLElement | null = null
  /**
   * The order the user has actually seen, updated once per animation frame.
   * Chromium sends a last `dragover` in the same task as the `drop`, so the
   * move that dragover makes is never painted. Saving the live DOM order would
   * then be one position off from what was on screen. Saving this snapshot
   * saves what was last shown.
   */
  let painted: string[] = []
  let paintQueued = false

  /** The runners the drag's own surface shows, in the order it shows them. */
  const shownOrder = (surface: HTMLElement): string[] =>
    [...surface.children]
      .map((c) => runnerOf(c as HTMLElement))
      .filter((r): r is string => r !== null && r !== ALL && r !== SKILLS)

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
   * Put the page back as it was before the drag. Idempotent, and called from
   * both `drop` and `dragend`. `drop` runs it before saving, because saving
   * re-renders the tab strip and the picker, which removes the drag source, and
   * Chromium fires no `dragend` for a source no longer in the document. If
   * only `dragend` cleaned up, every saved drag would leave its drag image and
   * drag state behind.
   *
   * Returns whether there was a drag to end, which tells `dragend` whether it
   * is the cancel path or the end of a saved drag.
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
    // A tab's `i` button sits beside it inside `.tab`, so the whole span
    // moves. A picker row is already a single element.
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
    // The whole surface (the tab strip, or the picker menu) accepts the drop,
    // not only the siblings. The preview has already set the order, so a
    // release anywhere inside it saves what is shown. A gap, the `all` tab or
    // the folded chip must accept it too: the preview's reflow can move one of
    // them under a pointer that did not move, and refusing would drop the
    // whole drag.
    if (!surface || !surface.contains(ev.target as Node)) return
    ev.preventDefault() // required, or drop never fires
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
    // Only passing over a runner moves anything. The `all` tab and the chip
    // for folded empty runners are not runners, so neither is a position and
    // neither moves the dragged element.
    const over = (ev.target as HTMLElement).closest(
      '.tabs .tab, [data-drag-runner]',
    ) as HTMLElement | null
    if (!over || over === dragEl || over.parentElement !== surface) return
    if (runnerOf(over) === null || runnerOf(over) === ALL || runnerOf(over) === SKILLS) return
    slideInto(surface, dragEl, isAfter(ev, over) ? over.nextSibling : over)
    snapshotPainted(surface)
  })

  document.addEventListener('drop', (e) => {
    if (!dragEl || dragging === null) return
    e.preventDefault()
    const moved = dragging
    const shown = painted
    // Clean up first, because saving re-renders and removes the drag source.
    endDrag()
    commitDragOrder(shown, moved)
  })

  document.addEventListener('dragend', () => {
    // The cancel path. After a saved drop, cleanup has already run and this
    // does nothing. The preview moved real elements, so a cancelled drag must
    // be put back, and only the saved order knows where.
    if (endDrag()) render()
  })

  // One button that cycles System, Light, Dark, rather than three buttons. It
  // shows the scheme in use and its title names the next one.
  $('theme').addEventListener('click', () => {
    const choice = (THEME_CYCLE[$('theme').dataset.themeChoice ?? 'system'] ?? 'light') as Theme
    // Absent means "follow the system", which is what the media query already
    // does; an explicit value overrides it in either direction.
    if (choice === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', choice)
    setThemeButton(choice)
    void saveTheme(choice)
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

  $('refresh').addEventListener('click', () => void load())

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
      const task = allTasks().find((t) => t.id === run.dataset.runId)
      if (task) runTask(task, run)
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
   * Keyboard handling for the whole results list. Rows are <tr> elements in
   * one table per tree group, so "next row" is the next row in document order
   * across all of #out, not within one table.
   */
  $('out').addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent
    const row = (ev.target as HTMLElement).closest('tbody tr') as HTMLElement | null
    if (!row) return

    if (ev.key === 'Escape') {
      // Focus returns to the search box and the query is kept. Escape in the
      // search box clears it. Losing the query just to get back to the field
      // would be a surprise.
      ev.preventDefault()
      ;($('q') as HTMLInputElement).focus()
      return
    }

    // Arrows and Enter act on the row itself. Once Tab has moved to the row's
    // copy button, Enter or Space there presses the button and is not handled
    // here.
    if (ev.target !== row) return

    if (ev.key === 'Enter') {
      ev.preventDefault()
      const task = ev.shiftKey ? taskOfRow(row) : undefined
      if (task) runTask(task, row.querySelector<HTMLButtonElement>('.runbtn') ?? undefined)
      else copyRow(row)
      return
    }

    const step = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    ev.preventDefault()
    const rows = listRows()
    const at = rows.indexOf(row)
    // Clamped, not wrapped: at the last row ArrowDown stays put. In a long
    // list a wrap would look like the page jumped, not like the cursor moved.
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + step))]
    if (!next || next === row) return
    setFocusedRow(next.dataset.id ?? null)
    next.focus()
    next.scrollIntoView({ block: 'nearest' })
  })

  document.addEventListener('keydown', (e) => {
    const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea') != null
    if (e.key === '/' && document.activeElement !== $('q')) {
      e.preventDefault()
      ;($('q') as HTMLInputElement).focus()
      ;($('q') as HTMLInputElement).select()
      return
    }
    if (e.key === '?' && !typing && !($('help') as HTMLDialogElement).open) {
      e.preventDefault()
      openHelp()
      return
    }
    // Escape closes the Filters menu and returns focus to its button.
    if (e.key === 'Escape' && $('filtersbtn').getAttribute('aria-expanded') === 'true') {
      e.preventDefault()
      setFiltersOpen(false)
      $('filtersbtn').focus()
      return
    }
    // Escape closes the picker and returns focus to the button that opened it,
    // so focus is not left on a closed menu. Only when focus is inside the
    // picker: Escape in the search box acts on the query, and one key must not
    // do two things.
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

  // Stay current on window focus and on a slow poll. Both stop for good once
  // the terminal has been handed off (see stopPolling).
  window.addEventListener('focus', () => {
    if (polling) void load()
  })
  pollTimer = setInterval(() => {
    if (polling && !document.hidden) void load()
  }, 15000)

  // The placeholder in the markup is a sentence, which is cut off mid-word at
  // narrow widths such as 1100px. The short form fits every width. The
  // sentence moves to the field's title, and the help modal explains it fully.
  const q = $('q') as HTMLInputElement
  q.title = q.placeholder
  // A placeholder names a field only while the field is empty. The sentence
  // becomes the field's accessible name, so the input keeps a name while the
  // user types.
  q.setAttribute('aria-label', q.placeholder)
  q.placeholder = 'Search tasks'

  for (const id of ['mode', 'depth']) rovingGroup($(id))
  rovingGroup($('tabs'), 'button[data-runner]')
}

/**
 * Put a row's command on the clipboard and say what happened.
 *
 * The button is the only sign that the clipboard changed, so a refused write
 * (a permissions policy, or a page that is not the active document) must not
 * be reported as a copy. Returns whether the write succeeded.
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
 * The confirmation shows on the row, not just the button, because neither
 * caller is looking at the button. From the search box the button is far to
 * the right, and from a focused row the keypress was on the row. One helper,
 * so both callers behave the same.
 */
function copyRow(row: HTMLElement): void {
  const button = row.querySelector('.copy') as HTMLElement | null
  if (button === null) return
  // A real click on the button would also close the picker, through the
  // document's click handler. `copyCommand` is called directly instead of
  // clicking, because the flash below needs its result and a click cannot be
  // awaited. So the picker is closed here.
  const menu = document.getElementById('pickmenu')
  if (menu) menu.hidden = true
  // The flash also says the command was copied, so it waits for the same
  // result the button does.
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
 * setDragImage only takes a rendered element, so the clone is added to the
 * document and placed off-screen by its class. It is removed at the end of
 * the drag, not on the next tick, because the browser may not have taken its
 * snapshot yet.
 */
function makeDragGhost(el: HTMLElement, e: DragEvent, dt: DataTransfer): HTMLElement {
  const box = el.getBoundingClientRect()
  const clone = el.cloneNode(true) as HTMLElement
  clone.classList.add('dragghost')
  clone.setAttribute('data-drag-ghost', '')
  clone.removeAttribute('draggable')
  // A copy is not a control. Every attribute the page uses to find a runner is
  // removed from it, or a query for that runner would find the copy and count
  // it twice.
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
  // Height is copied from the source; width is not. The source's width
  // includes children the copy does not show (the info button, the grip), so
  // copying it would leave blank space on the right. The copy sizes itself to
  // its own content.
  clone.style.height = box.height + 'px'
  document.body.appendChild(clone)
  // The grab point is measured on the source, so it can fall past the narrower
  // copy's right edge. It is clamped so the pointer stays over the copy.
  const width = clone.getBoundingClientRect().width
  dt.setDragImage(clone, Math.min(e.clientX - box.left, width), e.clientY - box.top)
  return clone
}

/**
 * Move `moving` before `before` and let the displaced siblings slide there.
 *
 * insertBefore is instant, so without this the siblings would jump. Each
 * sibling's old position is measured, it is offset back there, and then the
 * offset is released (the FLIP technique: first, last, invert, play). With
 * reduced motion set, the siblings jump, which is what that setting asks for.
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
 * The dragged surface shows only some of the runners (the tab bar folds the
 * empty ones and hides the disabled ones), so the preview cannot become the
 * order as it is. A drag only decides where the moved runner sits among the
 * runners on screen, and the hidden runners must keep their neighbours. So
 * the moved runner is placed before its new visible successor, or after its
 * visible predecessor when it was dropped last. A drop at the start means
 * "before the first visible runner", not "at the front of the full list",
 * which would move it past folded and disabled runners the user never saw.
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
  void saveRunnerOrder(order)
}

/**
 * Make a group of buttons one tab stop, with arrow keys moving inside it.
 *
 * Without this, two segmented controls and eight runner tabs add a dozen Tab
 * stops between the search box and anything else. Tab would move to the next
 * button instead of the next control, which is not what a keyboard user
 * expects. Only the active button is reachable by Tab. The rest are reached
 * with the arrows, as in a radio group or tab list.
 */
function rovingGroup(container: HTMLElement | null, selector = 'button'): void {
  if (!container) return
  // Limited by selector because the tab row also holds each tab's `i` button.
  // Matching every `button` would add those to the group and take away their
  // own tab stop.
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
    // The click can rebuild the whole group (the tab strip is re-rendered on
    // every render). That removes the button just focused and moves focus to
    // <body>, so the next arrow press would do nothing. Focus is restored by
    // position, not by element: a click in the group selects and never adds or
    // removes buttons. If the group did change length, focus is left alone.
    const rebuilt = buttons()[index]
    if (rebuilt !== undefined && rebuilt !== document.activeElement) rebuilt.focus()
  })
}

/** Open the help at its top, with the page's own text. */
function openHelp(): void {
  $('help-body').innerHTML = helpHtml()
  openDialogAtTop('help')
}

/** Open or close the Filters menu, which holds the filters at phone width. */
function setFiltersOpen(open: boolean): void {
  $('filtersbtn').setAttribute('aria-expanded', String(open))
  $('filters').classList.toggle('open', open)
  measureChrome()
}
