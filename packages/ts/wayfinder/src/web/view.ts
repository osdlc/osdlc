import { humanAge, humanMs } from '@osdlc/system-model/duration'
import { matchEntry, terms as splitTerms } from '@osdlc/system-model/match'
import type {
  Catalog,
  ChainSegment,
  RunnerBrand,
  RunnerCacheState,
  RunnerReport,
  Task,
} from '@osdlc/system-model/detect'
import { paramShape } from '@osdlc/system-model/params'

import { groupOf, groupRank, runnerLabel } from '../groups.ts'
import { terminalSafe } from '../terminal-text.ts'

import { $, ALL, OPEN, persistRunnerOrder, SEP, SHUT, state } from './state.ts'
import type { Row, TreeNode } from './state.ts'

// The matcher is system-model's, bundled into the page, so the page and the
// TUI rank a query identically.

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  )
}

/** The runner's optional visual identity, straight off its report. */
function brandOf(runner: string): RunnerBrand | null {
  return (state.catalog?.reports || []).find((r) => r.runner === runner)?.brand || null
}

/**
 * The runner's icon, inserted unescaped on purpose. It is inline SVG that the
 * server's own runners declare, which this page trusts as it trusts every
 * field it renders. Escaping it would print the markup as text instead of
 * drawing it.
 */
function iconHtml(runner: string): string {
  const icon = brandOf(runner)?.icon
  return icon ? '<span class="ricon" aria-hidden="true">' + icon + '</span>' : ''
}

/** Row tint attributes. The color is data passed to CSS, so it is escaped. */
function brandAttrs(runner: string): string {
  const color = brandOf(runner)?.color
  return color ? ' class="branded" style="--rb:' + escapeHtml(color) + '"' : ''
}

/**
 * The attributes every body row has: the brand tint, the task's stable id,
 * and a tabindex for roving focus.
 *
 * `data-id` is the task's own id, not its position. The list is used by
 * keyboard and render() replaces all of #out, so the focused row must be
 * found again by id after a rebuild reorders or drops rows.
 *
 * Every row starts at -1. markEnterTarget() sets exactly one to 0, so the
 * whole list is a single tab stop and the arrows move within it. This is the
 * same pattern rovingGroup() uses for the toolbar segments.
 */
function rowAttrs(e: Task): string {
  return brandAttrs(e.runner) + ' data-id="' + escapeHtml(e.id) + '" tabindex="-1"'
}

/** Wrap the matched character positions of `text` in <mark>. */
function highlight(text: string, idx: number[] | null): string {
  if (!idx || !idx.length) return escapeHtml(text)
  const set = new Set(idx)
  let out = '',
    open = false
  for (let i = 0; i < text.length; i++) {
    const on = set.has(i)
    if (on && !open) {
      out += '<mark>'
      open = true
    }
    if (!on && open) {
      out += '</mark>'
      open = false
    }
    out += escapeHtml(text[i]!)
  }
  return out + (open ? '</mark>' : '')
}

// ---------------------------------------------------------------- tree

/**
 * Rebuild the call-chain tree from whatever leaves survived the filter, so a
 * group header only appears while it still has something under it.
 */
function buildTree(rows: Row[]): TreeNode {
  const root: TreeNode = { kids: new Map(), leaves: [], count: 0 }
  for (const row of rows) {
    const chain = row.entry.path.slice(treeStart(), -1)
    let node = root
    node.count++
    for (const seg of chain) {
      if (!node.kids.has(seg)) node.kids.set(seg, { kids: new Map(), leaves: [], count: 0 })
      node = node.kids.get(seg)!
      node.count++
    }
    node.leaves.push(row)
  }
  return root
}

function renderNode(node: TreeNode, prefix: string[]): string {
  let html = ''
  // Alphabetical everywhere except the combined index's top level, which
  // follows the user's runner order so the tree matches the tab bar.
  const order = runnerOrder()
  const topLevel = treeStart() === 0 && prefix.length === 0
  const groups = [...node.kids.entries()].sort((a, b) =>
    topLevel ? order.indexOf(a[0]) - order.indexOf(b[0]) : a[0].localeCompare(b[0]),
  )
  for (const [seg, kid] of groups) {
    const key = prefix.concat(seg).join(' ')
    const collapsed = state.collapsed.has(key)
    // A header at tree depth d sits at path index d + treeStart(). In the
    // combined index the runner is the top node, so which chain to read
    // depends on the branch: at depth 0 the segment is the runner name.
    const depth = prefix.length
    const branchRunner = treeStart() === 0 ? (depth === 0 ? seg : prefix[0]!) : state.runner
    const meta = chainOf(branchRunner)[depth + treeStart()]
    // Only the combined index's top level is a runner. Deeper headers are
    // directories and projects, which have no icon.
    const icon = treeStart() === 0 && depth === 0 ? iconHtml(seg) : ''
    // Each level sticks one header height below the one above it, so an open
    // group keeps its parent headers visible at the top.
    const top = 'calc(var(--chrome-h) + ' + depth + ' * var(--head-h))'
    // Descending, with a minimum of 1 so even a very deep tree draws above
    // the unpositioned rows.
    const layer = Math.max(1, 20 - depth)
    html +=
      '<div class="node" data-collapsed="' +
      collapsed +
      '" data-key="' +
      escapeHtml(key) +
      '">' +
      '<div class="head" style="top:' +
      top +
      ';z-index:' +
      layer +
      '">' +
      '<span class="twisty">' +
      (collapsed ? SHUT : OPEN) +
      '</span>' +
      icon +
      '<span class="seg-name"' +
      (meta ? ' title="' + escapeHtml(meta.label + ' - ' + meta.hint) + '"' : '') +
      '>' +
      escapeHtml(seg) +
      '</span>' +
      (meta ? '<span class="seg-kind">' + escapeHtml(meta.label) + '</span>' : '') +
      '<span class="node-count">' +
      kid.count +
      '</span>' +
      '</div>' +
      '<div class="kids">' +
      renderNode(kid, prefix.concat(seg)) +
      '</div>' +
      '</div>'
  }
  if (node.leaves.length) {
    const sorted = node.leaves
      .slice()
      .sort((a, b) => b.score - a.score || a.entry.path.join().localeCompare(b.entry.path.join()))
    // Pull the table back out of the tree's indentation. Runners nest to
    // different depths (moon is four segments deep, just is three), so a
    // table left inside `.kids` would start further right in some branches,
    // and the command column would not line up across the combined view.
    // Headers keep their indent; rows align to one left edge.
    html +=
      '<table style="' +
      outdent(prefix.length) +
      '">' +
      colgroup(prefix.length) +
      '<tbody>' +
      sorted.map((r) => renderTreeRow(r, prefix.length)).join('') +
      '</tbody></table>'
  }
  return html
}

/**
 * The service icon, drawn here rather than taken from a runner's brand. Brand
 * icons identify runners, and this marks a property of the task. It has no
 * fixed size or colour: styles.css sizes the box and `currentColor` takes the
 * theme colour.
 */
function serviceIcon(declared: boolean): string {
  return declared
    ? '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5" fill="currentColor" /></svg>'
    : '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>'
}

/**
 * A directory in a form a shell will take. Quoted only when it needs to be,
 * so the common case stays readable.
 */
function quoteDir(dir: string): string {
  return /^[\w.\-/@+]+$/.test(dir) ? dir : "'" + dir.replace(/'/g, "'\\''") + "'"
}

/**
 * What Copy hands over, which is not always what the Command column shows.
 *
 * Most tasks are written to run from the repository root and are copied as
 * they are. A task bound to its own directory gets the `cd` it needs, since
 * without it the copied command would fail. `argv` is unchanged either way,
 * because anything that spawns a task already uses the directory.
 */
export function copyText(task: Task): string {
  // Control characters replaced, so none can reach the paste.
  return terminalSafe(
    task.cwd === '.' ? task.display : 'cd ' + quoteDir(task.cwd) + ' && ' + task.display,
  )
}

/** What Run does, stated up front: the page ends and the task takes the terminal. */
function runTip(task: Task): string {
  return (
    'Run ' +
    task.display +
    ' in the terminal wayfinder is serving from. ' +
    'The server exits and this page is finished.'
  )
}

/** Why a row's Copy is longer than its Command, said only when it is. */
function copyTip(task: Task): string {
  return task.cwd === '.'
    ? 'Copy the command to the clipboard.'
    : // The same quoting copyText uses. An unquoted directory here would not
      // match what is copied, and one with a space or a backtick would read as
      // something else entirely.
      'Copy — includes cd ' + quoteDir(task.cwd) + ' because this task must run from there.'
}

/**
 * The columns, in the order the colgroup declares them, plus the depth spacer
 * between the first two below the root. Five of them, or four once Runs is
 * dropped at a narrow width (see `showRuns`). The indicator has its own column
 * rather than sitting before the name, because a prefix would push each marked
 * row's chain out of line with its neighbours.
 */
function cells(e: Task, nameHtml: string, depth = 0): string {
  // The runner saying a task is a service and this page guessing from its name
  // are different claims. A guess is drawn as the hollow icon and says so on
  // hover.
  const p = e.persistent
  // The name is in the DOM as visually hidden text, not only in the `title`. A
  // bare span is not focusable, and `title` alone gives assistive tech nothing
  // to read.
  const service = p.value
    ? '<span class="ind-svc' +
      (p.declared ? '' : ' inferred') +
      '" title="' +
      escapeHtml(
        p.declared
          ? 'Service: the runner declares this one persistent. It runs until you stop it.'
          : "Service, inferred from the task's name — the runner did not say so.",
      ) +
      '">' +
      serviceIcon(p.declared) +
      '<span class="sr">' +
      (p.declared ? 'Service' : 'Service, inferred') +
      '</span></span>'
    : ''
  // The leading column is for row indicators in general, not only services.
  // Service is the first. A second indicator would join the same centred row.
  return (
    '<td class="ind"><span class="inds">' +
    service +
    '</span></td>' +
    spacerCell(depth) +
    '<td class="name" title="' +
    escapeHtml(e.path.join(SEP)) +
    '">' +
    nameHtml +
    '</td>' +
    '<td class="run" title="' +
    escapeHtml(e.display) +
    '">' +
    escapeHtml(e.display) +
    '</td>' +
    // Left out, not emptied: an empty cell would still take a column, and the
    // row would no longer match the table's colgroup.
    (showRuns()
      ? '<td class="doc">' +
        escapeHtml(e.doc || '') +
        (e.detail && e.detail !== e.display
          ? '<span class="detail" title="' +
            escapeHtml(e.detail) +
            '">' +
            escapeHtml(e.detail) +
            '</span>'
          : '') +
        '</td>'
      : '') +
    // The action column holds run, then copy. Keyboard navigation treats a
    // row's actions as a group that Tab moves into. Run hands the task to the
    // server's terminal. Copy's title says when it copies more than the
    // Command column shows, so the extra `cd` is not a surprise.
    '<td class="act">' +
    '<button class="runbtn" data-run-id="' +
    escapeHtml(e.id) +
    '" title="' +
    escapeHtml(runTip(e)) +
    '" aria-label="' +
    escapeHtml('Run ' + e.display + ' in the terminal') +
    '">run</button>' +
    '<button class="copy" title="' +
    escapeHtml(copyTip(e)) +
    '" data-run="' +
    escapeHtml(copyText(e)) +
    '">copy</button>' +
    '</td>'
  )
}

/** Each `.kids` level costs 14px margin + 11px padding. */
const INDENT_PER_LEVEL = 25

function outdent(depth: number): string {
  if (depth === 0) return ''
  const px = depth * INDENT_PER_LEVEL
  return 'margin-left:-' + px + 'px;width:calc(100% + ' + px + 'px)'
}

/**
 * The action column. Wide enough for `run` beside the enter-target row's
 * `↵ copy`, the widest the column gets. The plain `copy` on other rows leaves
 * 14px more. Measured in Chromium at 1700px and 1100px, which agree: `run`
 * 35.23 + a 4px gap + `↵ copy` 57.89 + the cell's 8px right padding is 105.12.
 *
 * 112 rather than 106, because 106 leaves only 0.88px. A fallback font or one
 * more pixel of button padding would then clip, and silently: the row's
 * actions would lose their right edge. The 6.88px is spare room.
 */
const ACT_W = 112
/** The indicator gutter: one icon wide, with room to centre a second later. */
const IND_W = 30
/**
 * Below this the Runs column is dropped. Runs is cut off too much to be useful
 * below a 1100px viewport. `main` pads 16px on each side, so that is about
 * 1068px of table width. The number is in the same units as `availWidth()`:
 * the width of the table area (`main` minus its padding), not of the window.
 */
const RUNS_MIN_W = 1068

/** The width every table's columns are measured against. */
function availWidth(): number {
  return Math.max(320, state.mainWidth || 1000)
}

/**
 * Whether the Runs column is shown right now. `colgroup`, `cells` and
 * `renderColHeads` all call this, because if a table's colgroup, head row and
 * body rows disagree on the number of columns, every column after the first
 * is misaligned.
 */
function showRuns(): boolean {
  return availWidth() >= RUNS_MIN_W
}

/**
 * The columns, named once. `tip` is the hover text. The help modal has the
 * longer version of anything a tooltip cannot hold. This is the full list;
 * `renderColHeads` drops Runs when the width does.
 */
export const COLUMNS = [
  {
    label: '',
    tip: "Row indicators. A filled dot marks a service — a task that runs until you stop it, such as a dev server, a watcher or a preview. An outlined dot means that was inferred from the task's name rather than declared by the runner.",
  },
  {
    label: 'Task',
    tip: "What to run, as its call chain: the runner, where it lives, and the task's own name. The middle segments are grouping this page adds; they are not part of the command.",
  },
  {
    label: 'Command',
    tip: 'The exact command. Nearly every one is written to run from the repository root; where a task must run from its own directory, Copy adds the cd for you.',
  },
  {
    label: 'Runs',
    tip: 'What the task actually executes, or the summary its runner documents where there is one.',
  },
  {
    label: '',
    tip: 'Row actions. Run hands the task to the terminal wayfinder is serving from, and ends this page. Copy puts the command on the clipboard, with the cd that a task bound to its own directory needs; on the row Enter would take it reads \u21b5 copy.',
  },
]

/**
 * Column widths, in pixels rather than percentages, because the tables have
 * different widths. Each is outdented by its depth (see `outdent`) so their
 * left edges agree, so a percentage would be a different number of pixels at
 * each level.
 *
 * A leading spacer column as wide as the outdent puts the content back under
 * its group header, and the name column gives up the same amount. So the
 * command column starts at the same x at every depth, and no row text lands
 * in the strip left of the headers. Text there would show through beside a
 * header as rows scroll under it, because a header's background stops at its
 * own indented box.
 *
 * Which columns exist depends on the width: under RUNS_MIN_W the Runs column
 * is dropped and its space goes to Task and Command. That has to happen here
 * rather than in a media query, because the widths are computed pixels. A
 * media query can hide cells but cannot recompute the other widths.
 */
function colgroup(depth: number): string {
  const indent = depth * INDENT_PER_LEVEL
  const avail = availWidth()
  const wide = showRuns()
  // When wide, Runs is the one flexible column and takes whatever the sized
  // columns leave. When narrow, Runs is gone and nothing is flexible, so the
  // sized columns must add up to `avail` exactly. `table-layout: fixed`
  // spreads any leftover across the columns in proportion, which would move
  // the command column at every depth. So the space left after the two fixed
  // columns is split explicitly, keeping the wide layout's 0.4 : 0.34 ratio,
  // rescaled to 0.54 : 0.46.
  const rest = avail - IND_W - ACT_W
  const name = wide
    ? Math.max(80, Math.round(avail * 0.4) - indent)
    : Math.max(80, Math.round(rest * 0.54) - indent)
  const run = wide ? Math.round(avail * 0.34) : rest - indent - name
  return (
    '<colgroup>' +
    // The indicator column comes first and is fixed, so an icon sits at the
    // same x in every row. The depth spacer comes after it and indents only
    // the Task text. A spacer before it would move the icons right as the
    // tree got deeper.
    '<col style="width:' +
    IND_W +
    'px" />' +
    (indent > 0 ? '<col style="width:' + indent + 'px" />' : '') +
    '<col style="width:' +
    name +
    'px" />' +
    '<col style="width:' +
    run +
    'px" />' +
    (wide ? '<col />' : '') +
    '<col style="width:' +
    ACT_W +
    'px" />' +
    '</colgroup>'
  )
}

/** The empty leading cell the spacer column needs, when there is one. */
function spacerCell(depth: number): string {
  return depth > 0 ? '<td class="spacer"></td>' : ''
}

/** Under a group header the parent chain is already on screen; show the leaf. */
function renderTreeRow(row: Row, depth: number): string {
  const e = row.entry
  // The part of the chain the group headers above do not show. At full depth
  // that is just the leaf. At a shallower setting the row shows the rest of
  // its chain, so nothing is lost by grouping less.
  const covered = treeStart() + depth
  const rest = e.path.slice(covered)
  const shown = rest.join(SEP)
  // labelHits index into path.join(" "); shift them onto the shown remainder,
  // accounting for SEP being wider than the single space they were built on.
  const skipped = covered > 0 ? e.path.slice(0, covered).join(' ').length + 1 : 0
  const marks = new Set(row.labelHits || [])
  let html = ''
  let at = skipped
  for (let i = 0; i < rest.length; i++) {
    html += highlight(
      rest[i]!,
      [...marks].map((m) => m - at).filter((m) => m >= 0 && m < rest[i]!.length),
    )
    at += rest[i]!.length + 1
    if (i < rest.length - 1) html += '<span class="chain">' + SEP + '</span>'
  }
  return '<tr' + rowAttrs(e) + '>' + cells(e, html || escapeHtml(shown), depth) + '</tr>'
}

/** A ranked search hit stands alone, so it carries its whole chain. */
function renderSearchRow(row: Row): string {
  const e = row.entry
  const chain = chainOf(e.runner)
  const idx = new Set(row.labelHits || [])
  let out = '',
    cursor = 0,
    open = false
  for (let p = 0; p < e.path.length; p++) {
    // Each segment has a tooltip saying what its position means, so the chain
    // explains itself on hover.
    const seg = chain[p]
    out += seg
      ? '<span class="seg-hit" title="' + escapeHtml(seg.label + ' - ' + seg.hint) + '">'
      : '<span>'
    for (const ch of e.path[p]!) {
      const on = idx.has(cursor)
      if (on && !open) {
        out += '<mark>'
        open = true
      }
      if (!on && open) {
        out += '</mark>'
        open = false
      }
      out += escapeHtml(ch)
      cursor++
    }
    if (open) {
      out += '</mark>'
      open = false
    }
    out += '</span>'
    if (p < e.path.length - 1) {
      out += '<span class="chain">' + SEP + '</span>'
      cursor++ // the " " the label was joined on
    }
  }
  return '<tr' + rowAttrs(e) + '>' + cells(e, out) + '</tr>'
}

// ---------------------------------------------------------------- render

/**
 * How deep in the repository a task is declared: the number of directories
 * above its source file. `justfile` and `moon.yml` at the root are 0;
 * `apps/web/client/moon.yml` is 3.
 *
 * This is where a task is declared, not how the tree draws it. The Depth
 * control filters on it, so "Root" is the few commands the repository itself
 * declares, not the ones its packages do.
 */
function sourceDepth(task: Task): number {
  const at = task.source.lastIndexOf('/')
  return at === -1 ? 0 : task.source.slice(0, at).split('/').length
}

/**
 * The one runner order, used by the tabs, the picker and the tree's top level.
 * All three must agree, or the tab bar no longer matches the page below it.
 *
 * Grouped first (tasks, dependencies, tools, git hooks), then alphabetical
 * within a group. An order the user dragged (on either surface) is kept in
 * localStorage and wins within its group. A runner not in the saved order is
 * placed alphabetically after it rather than left out.
 */
export function runnerOrder(): string[] {
  const present = (state.catalog?.reports || []).map((r) => r.runner)
  const saved = state.runnerOrder.filter((r) => present.includes(r))
  const unsaved = present.filter((r) => !saved.includes(r)).sort()
  return [...saved, ...unsaved].sort((a, b) => groupRank(a) - groupRank(b))
}

export function saveRunnerOrder(order: string[]): void {
  state.runnerOrder = order
  persistRunnerOrder(order)
  render()
}

/** The three keys the picker's header can sort the runner order by. */
export type SortKey = 'name' | 'count' | 'shown'

/** The runner order re-sorted by one key, ties broken alphabetically. */
function sortedRunnerOrder(key: SortKey, dir: 1 | -1): string[] {
  const reports = state.catalog?.reports || []
  const count = (r: string) => reports.find((s) => s.runner === r)?.tasks.length ?? 0
  // `shown` is two buckets rather than a scale, so ties are the common case
  // and the alphabetical tiebreak below does most of the ordering work.
  const shown = (r: string) => (state.enabled?.has(r) === true ? 1 : 0)
  const rank = (a: string, b: string) =>
    key === 'name'
      ? a.localeCompare(b)
      : key === 'count'
        ? count(a) - count(b)
        : shown(a) - shown(b)
  return runnerOrder()
    .slice()
    .sort((a, b) => {
      const by = rank(a, b)
      return by !== 0 ? dir * by : a.localeCompare(b)
    })
}

/**
 * The sort the user last asked for. It does not say what order is on screen.
 * activeSort checks it against the live order before the header shows
 * anything, so a drag clears the arrow. It only decides which column gets the
 * arrow when an order matches two sorts, as every order does when all the
 * counts are equal.
 */
let requestedSort: { key: SortKey; dir: 1 | -1 } | null = null

/**
 * Which sort the current order already matches, if any, found by comparing.
 * A stored "sorted by name" flag would stay set after a drag rearranged the
 * list, and the header would then be wrong about what is on screen.
 *
 * The last requested sort is tried first, because two sorts can match one
 * order and only one of them is the one the user pressed.
 */
function activeSort(): { key: SortKey; dir: 1 | -1 } | null {
  const now = runnerOrder().join('\u0000')
  const matches = (s: { key: SortKey; dir: 1 | -1 }) =>
    sortedRunnerOrder(s.key, s.dir).join('\u0000') === now
  if (requestedSort && matches(requestedSort)) return requestedSort
  for (const key of ['name', 'count', 'shown'] as SortKey[]) {
    for (const dir of [1, -1] as const) {
      if (matches({ key, dir })) return { key, dir }
    }
  }
  return null
}

/** Sorting reorders the one saved order, so the tab bar updates at once. */
export function sortRunners(key: SortKey, dir: 1 | -1): void {
  requestedSort = { key, dir }
  saveRunnerOrder(sortedRunnerOrder(key, dir))
}

export function scopedReports(): RunnerReport[] {
  const all = (state.catalog?.reports || []).filter(
    (s) => !state.enabled || state.enabled.has(s.runner),
  )
  return state.runner === ALL ? all : all.filter((s) => s.runner === state.runner)
}

/** What each position of a given runner's chain means. */
function chainOf(runner: string): ChainSegment[] {
  return (state.catalog?.reports || []).find((s) => s.runner === runner)?.chain || []
}

/**
 * Where the tree starts inside `entry.path`. A single-runner tab already
 * names its runner, so the tree begins one segment in; the combined index
 * uses the runner itself as its top node.
 */
function treeStart(): number {
  return state.runner === ALL ? 0 : 1
}

/**
 * Why a runner reports nothing when execution is off. Defined once because
 * three places show it: the tab's tooltip, the picker's note and the
 * per-runner modal.
 *
 * Two sentences, for two reasons. Either way, reading this runner means
 * running it. Whether the page can fix that depends on whether trust is what
 * is missing, which only the server knows (see `state.trustable`).
 */
const EXEC_NOTE_OFF =
  'This runner can only be read by running it, and execution is off for this session.'
const EXEC_NOTE_UNTRUSTED =
  'This runner can only be read by running it, and this repository is not trusted yet.'

function execNote(): string {
  return state.trustable ? EXEC_NOTE_UNTRUSTED : EXEC_NOTE_OFF
}

/**
 * The trust grant button. Offered wherever the withheld runners are explained:
 * the trust bar, the per-runner modal and the picker. A badge and a tooltip
 * alone would leave someone who opens neither menu uninformed. It asks for
 * confirmation before it POSTs (see input.ts).
 */
const TRUST_BUTTON =
  '<button class="toolbtn" data-trust-repo="1" title="Record that this repository may run subprocesses to be read. Remembered per repository.">Trust this repository</button>'

/**
 * One chip in place of the tabs of all folded runners. It shows how many, and
 * its title says which and why. It is not a menu of its own. The runner
 * picker already lists each one with its count and its (failed),
 * (needs --exec) or (not trusted) note, so this only opens the picker (see
 * input.ts).
 */
function foldedChip(reports: RunnerReport[]): string {
  if (reports.length === 0) return ''
  const names = reports.map((s) => s.runner)
  const label = names.length + (names.length === 1 ? ' empty runner' : ' empty runners')
  const list =
    names.length === 1
      ? names[0]!
      : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
  const pronoun = names.length === 1 ? 'it' : 'them'
  const title =
    list +
    ' found no tasks in this repository. Open the runner picker to see ' +
    pronoun +
    ' or turn ' +
    pronoun +
    ' off.'
  // No `aria-label`: it would replace the visible text as the chip's name, and
  // voice control users say the visible label. The long sentence stays in the
  // `title`.
  return (
    '<button class="tab-folded" data-open-picker="1" title="' +
    escapeHtml(title) +
    '">' +
    label +
    '</button>'
  )
}

export function render(): void {
  const cat = state.catalog
  if (!cat) {
    $('out').innerHTML = '<div class="empty">Loading...</div>'
    return
  }
  // Column widths are computed from this, so it must be measured before the
  // tables are built, or the first view is wrong. clientWidth includes
  // `main`'s horizontal padding, which the tables cannot use, so it is
  // subtracted. The columns must add up to the table's real width, or a
  // layout with no flexible column overflows the page by that padding.
  const main = $('out')
  const pad = getComputedStyle(main)
  state.mainWidth = Math.round(
    main.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight),
  )

  // Every runner is on for the first catalog. After that the picker controls
  // it, and a runner that appears later (a runner added to the library) is
  // turned on rather than silently hidden.
  state.enabled ??= new Set(cat.reports.map((s) => s.runner))
  const enabled = state.enabled
  for (const s of cat.reports)
    if (!state.knownRunners.has(s.runner)) {
      state.knownRunners.add(s.runner)
      enabled.add(s.runner)
    }
  // A disabled runner cannot stay selected, or the view is empty with no
  // visible reason why.
  if (state.runner !== ALL && !enabled.has(state.runner)) state.runner = ALL

  const byOrder = runnerOrder()
  const on = byOrder
    .map((id) => cat.reports.find((s) => s.runner === id))
    .filter((s): s is RunnerReport => s !== undefined && enabled.has(s.runner))
  const total = on.reduce((n, s) => n + s.tasks.length, 0)
  const anyError = on.some((s) => s.status === 'error')
  // A runner with nothing to show gets no tab of its own, but only when it is
  // simply empty. A runner that failed to probe, was withheld because
  // execution is off, or has a warning banner still reports something.
  // Folding it would look like "all clear" while its banner says otherwise.
  // The selected runner is never folded, or no tab would be pressed. This is
  // recomputed every render, so a runner that gains tasks on a refresh gets
  // its tab back.
  const foldable = on.filter(
    (s) =>
      s.tasks.length === 0 &&
      s.status !== 'error' &&
      !s.skippedForExec &&
      !(s.diagnostics || []).some((d) => d.severity === 'warning') &&
      s.runner !== state.runner,
  )
  const shown = on.filter((s) => !foldable.includes(s))
  const tabs = [{ runner: ALL, count: total, error: anyError, exec: false }].concat(
    shown.map((s) => ({
      runner: s.runner,
      count: s.tasks.length,
      error: s.status === 'error',
      exec: s.skippedForExec,
    })),
  )
  const chainOfRunner = (id: string): ChainSegment[] =>
    cat.reports.find((r) => r.runner === id)?.chain ?? []
  $('tabs').innerHTML =
    tabs
      .map((t, i) => {
        // A labelled break where one group ends and the next begins.
        const prev = tabs[i - 1]
        const group = groupOf(t.runner)
        const header =
          t.runner !== ALL &&
          prev !== undefined &&
          prev.runner !== ALL &&
          groupOf(prev.runner) !== group
            ? '<span class="tabgroup">' + escapeHtml(group.title) + '</span>'
            : ''
        const chain = chainOfRunner(t.runner)
        const shape = chain.map((c, i) => (i === 0 ? t.runner : c.label)).join(' › ')
        // The `all` tab is an aggregate, pinned first, and not draggable.
        const draggable = t.runner !== ALL ? ' draggable="true"' : ''
        // A runner withheld for exec keeps its tab so it can say so, through
        // the badge and the tooltip. The badge looks like a count, not the
        // error `!`, because nothing failed.
        const tip = t.exec ? (shape ? shape + '. ' + execNote() : execNote()) : shape
        const btn =
          '<button data-runner="' +
          t.runner +
          '" aria-pressed="' +
          (t.runner === state.runner) +
          '"' +
          draggable +
          (tip ? ' title="' + escapeHtml(tip) + '"' : '') +
          '>' +
          iconHtml(t.runner) +
          escapeHtml(t.runner === ALL ? ALL : runnerLabel(t.runner)) +
          '<span class="count">' +
          t.count +
          (t.error ? ' !' : '') +
          '</span>' +
          (t.exec ? '<span class="count exec">exec</span>' : '') +
          '</button>'
        // The info button sits beside the tab, not inside it. A button cannot
        // be inside a button, and the tab must stay one click target that
        // selects.
        const info = chain.length
          ? '<button class="tabinfo" data-info-runner="' +
            escapeHtml(t.runner) +
            '" title="What ' +
            escapeHtml(t.runner) +
            '\'s path segments mean" aria-label="About ' +
            escapeHtml(t.runner) +
            '">i</button>'
          : ''
        return header + '<span class="tab">' + btn + info + '</span>'
      })
      .join('') + foldedChip(foldable)
  // The picker is a toolbar control, not a tab, so it renders into the Scope
  // cluster in the search row rather than at the end of the tab strip.
  //
  // Rewriting its markup replaces the focused element, so the focused control
  // is recorded before the rebuild and found again after it, as the results
  // list does with the task id.
  //
  // The markup always comes back closed, so an open menu is reopened here
  // before focus is restored: focus() on an element inside a `hidden` subtree
  // does nothing, and toggling a checkbox rebuilds the menu it lives in.
  const host = $('pickerhost')
  const wasOpen = document.getElementById('pickmenu')?.hidden === false
  const refocus = host.contains(document.activeElement)
    ? pickerFocusSelector(document.activeElement as HTMLElement)
    : null
  host.innerHTML = renderRunnerPicker(cat)
  if (wasOpen) {
    host.querySelector('#pickmenu')?.removeAttribute('hidden')
    host.querySelector('#pickbtn')?.setAttribute('aria-expanded', 'true')
  }
  if (refocus) host.querySelector<HTMLElement>(refocus)?.focus()

  const scope = scopedReports()
  const inScope = scope.reduce((n, s) => n + s.tasks.length, 0)
  const terms = splitTerms(state.query)
  const rows: Row[] = []
  for (const sec of scope) {
    for (const entry of sec.tasks) {
      if (state.servicesOnly && !entry.persistent.value) continue
      // `synthesized` tasks are inferred from a convention rather than
      // written down: `cargo test` for every Cargo.toml, `ruff check .` for
      // every configured ruff. They are useful but many, so they can be
      // hidden.
      if (state.declaredOnly && entry.origin !== 'declared') continue
      if (sourceDepth(entry) > state.depth) continue
      if (terms.length === 0) {
        rows.push({ entry, score: 0, labelHits: null })
        continue
      }
      const m = matchEntry(entry, terms, state.mode)
      if (m) rows.push({ entry, score: m.score, labelHits: m.labelHits })
    }
  }

  let html = ''
  for (const sec of scope) {
    // Severity decides how a diagnostic is shown. An error is a banner, a
    // warning is a note, and info such as "moon was skipped because execution
    // is off" is not shown, since the tab already says it.
    for (const d of sec.diagnostics || []) {
      if (d.severity === 'info') continue
      const label = d.severity === 'error' ? 'banner' : 'banner warn'
      html +=
        '<div class="' +
        label +
        '">' +
        escapeHtml(sec.runner) +
        ': ' +
        escapeHtml(d.message) +
        (d.source ? '\n' + escapeHtml(d.source) : '') +
        '</div>'
    }
  }
  if (rows.length === 0) {
    html +=
      '<div class="empty">' + (inScope ? 'No command matches.' : 'Nothing collected.') + '</div>'
  } else if (terms.length) {
    // Searching ranks results, so the tree gives way to a flat best-first list.
    rows.sort((a, b) => b.score - a.score)
    html +=
      '<table>' +
      colgroup(0) +
      '<tbody>' +
      rows.slice(0, 400).map(renderSearchRow).join('') +
      '</tbody></table>'
  } else {
    html += renderNode(buildTree(rows), [])
  }
  // Whether focus is in the list must be read before the html is replaced,
  // because replacing it moves focus to <body>. Focus is restored only if it
  // was in the list. Restoring it always would take focus from the search box
  // on every 15s poll.
  const focusWasInList = $('out').contains(document.activeElement)
  $('out').innerHTML = html
  markEnterTarget()
  if (focusWasInList) restoreListFocus()
  renderColHeads()
  renderStatus(rows.length, inScope)
  renderTrustBar()
  measureChrome()
}

/**
 * Put keyboard focus back in the rebuilt list.
 *
 * The focused row is found by task id. When that task is gone (a filter, the
 * 15s poll or a resize dropped it), focus would fall to <body> and the arrows
 * would stop working with no sign why. So the first remaining row takes
 * focus, and with no rows left focus goes back to the search box.
 */
function restoreListFocus(): void {
  const rows = listRows()
  const row =
    (state.focusedId !== null ? rows.find((r) => r.dataset.id === state.focusedId) : undefined) ??
    rows[0]
  if (row) {
    setFocusedRow(row.dataset.id ?? null)
    row.focus()
    return
  }
  ;($('q') as HTMLInputElement).focus()
}

/**
 * A selector naming one picker control, stable across a rebuild.
 *
 * The picker's markup is regenerated in full, so an element reference is no
 * use afterwards. Every control in it has a runner id or a fixed attribute,
 * which stays the same.
 */
function pickerFocusSelector(el: HTMLElement): string | null {
  if (el.closest('#pickbtn')) return '#pickbtn'
  const toggled = (el.closest('[data-toggle-runner]') as HTMLElement | null)?.dataset.toggleRunner
  if (toggled) return 'input[data-toggle-runner="' + CSS.escape(toggled) + '"]'
  const info = (el.closest('[data-info-runner]') as HTMLElement | null)?.dataset.infoRunner
  if (info) return 'button[data-info-runner="' + CSS.escape(info) + '"]'
  const sorted = (el.closest('[data-sort-runners]') as HTMLElement | null)?.dataset.sortRunners
  if (sorted) return '[data-sort-runners="' + CSS.escape(sorted) + '"]'
  if (el.closest('[data-pick-all]')) return '[data-pick-all]'
  if (el.closest('[data-pick-none]')) return '[data-pick-none]'
  return null
}

/**
 * The longer explanation, for what a tooltip is too small to hold. Mainly the
 * two points that surprise people: part of a task's chain is grouping this
 * page adds, and a task can be declared by a runner or only implied by a
 * convention.
 */
export const HELP = [
  '<h3>What this is</h3>',
  '<p>Every task this repository can run, from every runner it uses, in one searchable list. ',
  'The runners answer only for themselves — <code>just --list</code> knows nothing about moon — so this asks each of them and merges the answers.</p>',

  '<h3>The columns</h3>',
  '<dl>',
  "<dt>Task</dt><dd>The call chain. The first segment is the runner, the last is the task's own name. ",
  'The middle is <strong>grouping this page adds</strong> so hundreds of names stay scannable — it is not part of any command. ',
  'Hover a segment to see what that position means for its runner.</dd>',
  '<dt>Command</dt><dd>Exactly what to type. Nearly every command is written to run <strong>from the repository root</strong>, which is why you see flags like ',
  '<code>--cwd</code>, <code>-C</code> and <code>--justfile</code>. Where a task can only run from its own directory, Copy prefixes the <code>cd</code> for you.</dd>',
  '<dt>Runs</dt><dd>What the task actually executes, or the summary its runner documents where there is one. ',
  'It is dropped on a narrow window, where it has too little room to say anything useful.</dd>',
  '<dt>Service</dt><dd>The leftmost column carries row indicators. A filled green dot marks a service: a task that runs until you stop it — a dev server, a watcher. An outlined dot means that was inferred from the name rather than declared by the runner.</dd>',
  '</dl>',

  '<h3>The controls</h3>',
  '<dl>',
  '<dt>Depth</dt><dd>How far into the repository to look, by <strong>where a task is declared</strong>. ',
  '<em>Root</em> is the handful the repository declares itself — its own justfile, package.json and moon project. Everything else belongs to one of its packages.</dd>',
  '<dt>Services</dt><dd>Only services — tasks that run until you stop them: dev servers, watchers, previews. Marked with a dot in the leftmost column.</dd>',
  '<dt>Declared</dt><dd>Drops tasks no file declares. <code>cargo test</code> and <code>ruff check .</code> are written down nowhere — they are what a crate, or a ruff-configured project, runs by convention.</dd>',
  '<dt>Collapse</dt><dd>Folds the groups. Presentation only; it changes nothing about which tasks exist.</dd>',
  '<dt>Runners</dt><dd>Which runners this page shows. Unchecking one drops it from the search and from every tab; it is still collected, so its count is current the moment you turn it back on.</dd>',
  "<dt>Fuzzy / Exact</dt><dd>Terms are ANDed, so <code>photo dev</code> narrows to a photo app's dev server. A leading quote forces one term to match exactly, even in fuzzy mode.</dd>",
  '</dl>',

  '<h3>Why a runner might show nothing</h3>',
  "<p>Some runners can only be read by running them — <code>moon query tasks</code> evaluates this repository's own toolchain configuration. ",
  'Those keep their tab, marked <code>exec</code> beside the count, so a runner held back that way says so rather than pretending to be absent.</p>',
  "<p>Reading them therefore needs your consent, remembered once per repository. Open a held-back runner's <code>i</code> button, or the Runners picker, for a button that records it. ",
  'A repository cannot grant itself that: <code>allowExec</code> in <code>wayfinder.config.json</code> cannot raise the gate.</p>',

  '<h3>Staying current</h3>',
  '<p>The page refreshes when you focus it and on a slow poll, and <b>Refresh</b> always re-reads every runner for real \u2014 an explicit refresh that could be answered from a stored listing is not a refresh.</p>',
  '<p>The very first paint may come from a stored listing so the page appears at once on a repository whose slowest runner takes seconds. When it does, the status bar names those runners after <code>cached:</code> and marks their tabs with <code>~</code>, and a fresh read is already running behind the page. Rows never come from a store without saying so.</p>',
].join('')

/**
 * The header for the selection column: a checkbox mark, sized to match the
 * row checkboxes below it. Visual only. The accessible name comes from the
 * button's aria-label, so a screen reader says "Shown", not a shape.
 */
const CHECK_GLYPH =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">' +
  '<rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<path d="M4.5 8.4l2.4 2.4 4.6-5" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * The picker's sort header: three columns that reorder the one saved order.
 *
 * The columns are in the same order as in each row: shown, name, count. A
 * header must sit above the column it sorts, or it looks like it belongs to
 * whatever is nearest.
 *
 * The row's leading drag handle is repeated here, hidden, instead of a fixed
 * width. It is the same element and character, so the columns start where the
 * row's content starts even if the handle changes.
 *
 * Real buttons, so the header is reachable by Tab and by voice. The arrow
 * shows only while the current order matches that sort. After a drag, neither
 * column shows one. Count uses the live task counts, so it follows a refresh.
 */
export function renderSortHead(): string {
  const active = activeSort()
  const col = (key: SortKey, label: string, glyph?: string) => {
    const on = active?.key === key
    // A newly chosen column starts with its most useful direction: names
    // ascending, counts largest first, shown runners first.
    const next: 1 | -1 = on ? (active!.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1
    // "shown" is yes or no, so ascending or descending means little. The title
    // names which end goes on top instead.
    const way =
      key === 'shown'
        ? next === -1
          ? 'shown first'
          : 'hidden first'
        : key === 'count'
          ? next === -1
            ? 'most tasks first'
            : 'fewest tasks first'
          : next === 1
            ? 'A to Z'
            : 'Z to A'
    return (
      '<button class="picksort" data-sort-runners="' +
      key +
      '" data-sort-dir="' +
      next +
      '" aria-pressed="' +
      on +
      '" aria-label="' +
      label +
      '" title="Order the runners ' +
      way +
      '">' +
      (glyph ?? label) +
      '<span class="sortdir" aria-hidden="true">' +
      (on ? (active!.dir === 1 ? '▲' : '▼') : '') +
      '</span></button>'
    )
  }
  return (
    '<div class="pickhead">' +
    '<span class="grip" aria-hidden="true">⠿</span>' +
    col('shown', 'Shown', CHECK_GLYPH) +
    col('name', 'Name') +
    col('count', 'Count') +
    '</div>'
  )
}

/**
 * The runner picker, a control in the toolbar's Scope cluster.
 *
 * A runner turned off here is still collected and only hidden. That keeps the
 * toggle instant, and its counts are current when you turn it back on. A
 * runner that failed to probe is still listed with its error, so unchecking
 * it hides a broken runner.
 */
function renderRunnerPicker(cat: Catalog): string {
  // Guaranteed non-null: `render()` seeds `state.enabled` before this runs,
  // and nothing else calls this function.
  const enabled = state.enabled!
  const items = runnerOrder()
    .map((id) => cat.reports.find((r) => r.runner === id))
    .filter((s): s is RunnerReport => s !== undefined)
    .map((s) => {
      const on = enabled.has(s.runner)
      const note =
        s.status === 'error'
          ? ' (failed)'
          : s.skippedForExec
            ? state.trustable
              ? ' (not trusted)'
              : ' (needs --exec)'
            : ''
      // The button sits next to the note, where the problem is named. One
      // button per withheld row is fine: they all grant the same thing, and
      // the click is confirmed before anything happens.
      const grant = s.skippedForExec && state.trustable ? TRUST_BUTTON : ''
      // A folded runner has no tab, and so no tab `i` button. The picker row
      // is the one place every runner is always listed, so it has the same
      // info button. A <label> passes a click to its checkbox, so the button
      // sits outside the label, or clicking it would also turn the runner
      // off.
      const info = s.chain.length
        ? '<button class="tabinfo" data-info-runner="' +
          escapeHtml(s.runner) +
          '" title="What ' +
          escapeHtml(s.runner) +
          '\'s path segments mean" aria-label="About ' +
          escapeHtml(s.runner) +
          '">i</button>'
        : ''
      return (
        '<div class="pick" draggable="true" data-drag-runner="' +
        escapeHtml(s.runner) +
        '">' +
        '<span class="grip" title="Drag to reorder">⠿</span>' +
        '<label class="pick-label">' +
        '<input type="checkbox" data-toggle-runner="' +
        escapeHtml(s.runner) +
        '"' +
        (on ? ' checked' : '') +
        ' /> ' +
        iconHtml(s.runner) +
        escapeHtml(s.runner) +
        '<span class="count">' +
        s.tasks.length +
        escapeHtml(note) +
        '</span></label>' +
        grant +
        info +
        '</div>'
      )
    })
    .join('')
  const off = cat.reports.length - enabled.size
  return (
    '<div class="picker">' +
    '<button class="toolbtn" id="pickbtn" aria-expanded="false" title="Choose which runners to search and display">' +
    'Runners' +
    (off > 0 ? ' <span class="count">' + off + ' off</span>' : '') +
    '</button>' +
    '<div class="pickmenu" id="pickmenu" hidden>' +
    renderSortHead() +
    items +
    '<div class="pickactions"><button data-pick-all="1">All</button><button data-pick-none="1">None</button></div>' +
    // The checkbox above looks permanent but is not. It filters this session
    // only and is lost when the tab closes. The saved choice (which runners
    // this project collects) is in Settings.
    '<p class="picknote">Filters this session only. ' +
    '<button class="linkish" data-open-settings="1">Settings</button>' +
    ' turns a runner off for the project.</p>' +
    '</div></div>'
  )
}

/** Every body row in #out, in document order across all of the group tables. */
export function listRows(): HTMLElement[] {
  return [...$('out').querySelectorAll<HTMLElement>('tbody tr')]
}

/**
 * Which row Enter takes, and where the single tab stop into the list sits.
 *
 * It depends on whether a row is focused. While `focusedId` names a row, the
 * mark follows it: Enter there copies that row. The mark goes back to the top
 * hit when `focusedId` is cleared, which the search box's focus handler does
 * (see input.ts). Moving to a toolbar button leaves the row marked, because
 * Enter there presses that button, not the list. The top hit is marked only
 * while a query is active. With no query there is no top hit, and a marked
 * first row would misstate what Enter does.
 *
 * A focused row whose task no longer exists (a filter dropped it) clears
 * `focusedId` rather than leaving the list marked with a row that is gone.
 */
export function markEnterTarget(): void {
  const rows = listRows()
  for (const r of rows) {
    r.classList.remove('enter-target')
    r.tabIndex = -1
  }

  let target: HTMLElement | null = null
  if (state.focusedId !== null) {
    target = rows.find((r) => r.dataset.id === state.focusedId) ?? null
    if (!target) state.focusedId = null
  }
  if (!target && splitTerms(state.query).length > 0) target = rows[0] ?? null
  if (target) target.classList.add('enter-target')

  // The tab stop falls back to the first row, so Tab can always reach the
  // list, even with no query and nothing marked.
  const roving = target ?? rows[0]
  if (roving) roving.tabIndex = 0
}

/**
 * Move the list's keyboard focus to `id`, or off the list entirely with null.
 *
 * Updates the mark rather than re-rendering. The rows have not changed, and a
 * full render() on every arrow key would rebuild the whole table to move one
 * class.
 */
export function setFocusedRow(id: string | null): void {
  state.focusedId = id
  markEnterTarget()
}

/**
 * One runner's explanation: what each position of its path selects, how it
 * is read, and whether reading it means running anything.
 */
export function showRunnerInfo(runner: string): void {
  const report = (state.catalog?.reports || []).find((r) => r.runner === runner)
  if (!report) return
  const shape = report.chain.map((c, i) => (i === 0 ? runner : c.label)).join(' › ')
  const rows = report.chain
    .map(
      (c, i) =>
        '<dt>' +
        escapeHtml(i === 0 ? runner : c.label) +
        '</dt><dd>' +
        escapeHtml(c.hint) +
        '</dd>',
    )
    .join('')
  const notes: string[] = []
  if (report.skippedForExec) {
    notes.push('<p>Not collected right now. ' + execNote() + '</p>')
    if (state.trustable) notes.push('<p>' + TRUST_BUTTON + '</p>')
  }
  if (report.status === 'error') {
    notes.push('<p>This runner failed to probe. Its diagnostic is shown above the list.</p>')
  }
  for (const d of report.diagnostics) {
    if (d.severity !== 'info') continue
    notes.push('<p>' + escapeHtml(d.message) + '</p>')
  }
  $('help-body').innerHTML =
    '<h3>' +
    escapeHtml(runner) +
    '</h3>' +
    '<p>A task from this runner reads <code>' +
    escapeHtml(shape) +
    '</code>.</p>' +
    '<dl>' +
    rows +
    '</dl>' +
    notes.join('') +
    '<p>' +
    escapeHtml(String(report.tasks.length)) +
    ' task(s) found.</p>'
  ;($('help') as HTMLDialogElement).showModal()
}

/**
 * The column headers, drawn as their own depth-0 table in the sticky header.
 * A `thead` in each group's table would repeat the row down the whole page.
 * This one stays in place and still lines up, because every table's command
 * column starts at the same x at every depth.
 */
function renderColHeads(): void {
  // A column with no label still needs a box to hover, so an empty label
  // renders a nonbreaking space and keeps its tooltip reachable.
  const cells = COLUMNS.filter((c) => c.label !== 'Runs' || showRuns())
    .map(
      (c) => '<th title="' + escapeHtml(c.tip) + '">' + (escapeHtml(c.label) || '&#160;') + '</th>',
    )
    .join('')
  $('colheads').innerHTML =
    '<table>' + colgroup(0) + '<thead><tr>' + cells + '</tr></thead></table>'
}

/**
 * The cache's three states, as one status span, the same three the TUI shows.
 *
 * Fresh returns "": there is nothing to report, and a span that is always
 * shown is a span nobody reads. Stale and slow is kept apart from ordinary
 * stale because it is the case the cache exists for. A runner measured at
 * seconds is why the page has rows instead of a spinner, so it gets the more
 * prominent class. Slowness is measured, never assumed.
 */
export function cacheSpan(rows: readonly RunnerCacheState[]): string {
  const stale = rows.filter((r) => r.state === 'stale')
  if (stale.length === 0) return ''
  const slow = stale.filter((r) => r.slow)
  const cost = (r: RunnerCacheState): string =>
    r.estimateMs === null ? 'never timed here' : '~' + humanMs(r.estimateMs)
  if (slow.length > 0) {
    return (
      '<span class="err">cached: ' +
      escapeHtml(
        slow.map((r) => r.runner + ' (' + humanAge(r.ageMs) + ', ' + cost(r) + ')').join(', '),
      ) +
      ' - slow to probe here, so re-reading takes a moment</span>'
    )
  }
  return (
    '<span>cached: ' +
    escapeHtml(stale.map((r) => r.runner + ' ' + humanAge(r.ageMs)).join(', ')) +
    ' - re-probing</span>'
  )
}

/**
 * Runners withheld because execution is off, shown in the page's own bar
 * above everything. It matches the CLI's "N runners not collected" line.
 *
 * Without it, the page would mention withheld runners only on the tab badge,
 * in its tooltip, in the per-runner modal and in the picker, all behind a
 * hover or a click. Someone would see a shorter catalog with nothing saying
 * that anything was missing, which this tool must never do quietly.
 *
 * It is its own bar rather than a span in the status strip. The status strip
 * reports numbers about what you are looking at, and this asks for a decision
 * about what you are not. A button in a row of counts looks like one more
 * control.
 *
 * It names the runners rather than only counting them, so the reader does not
 * have to ask which. The trust button is included only when trust is what is
 * missing. Otherwise execution is off for the session and trusting the
 * repository would change nothing.
 */
export function withheldBar(reports: readonly RunnerReport[]): string {
  const held = reports.filter((s) => s.skippedForExec)
  if (held.length === 0) return ''
  const names = held.map((s) => s.runner).join(', ')
  // The count and the names come first, because they are the news. The
  // explanation is a separate sentence, which keeps singular and plural
  // agreement simple.
  const one = held.length === 1
  const lead = held.length + (one ? ' runner was' : ' runners were') + ' not read: '
  const why = one
    ? 'It can only be read by running it, and '
    : 'They can only be read by running them, and '
  const gate = state.trustable
    ? 'this repository is not trusted yet.'
    : 'execution is off for this session.'
  return (
    '<span>' +
    lead +
    '<span class="who">' +
    escapeHtml(names) +
    '</span>. ' +
    why +
    gate +
    '</span>' +
    (state.trustable ? TRUST_BUTTON : '')
  )
}

/** Paint the trust bar, and hide it entirely when there is nothing to say. */
export function renderTrustBar(): void {
  const host = $('trustbar')
  const html = withheldBar(state.catalog?.reports || [])
  host.innerHTML = html
  host.hidden = html === ''
}

/**
 * Kept separate from the table so an unchanged poll can update the clock
 * without touching the table. Otherwise Refresh on an unchanged repo would
 * look like nothing happened, and the timestamp would show data as older than
 * it is.
 */
export function renderStatus(shown: number, total: number): void {
  const errs = (state.catalog?.reports || [])
    .filter((s) => s.status === 'error')
    .map((s) => s.runner)
  $('status').innerHTML =
    '<span>' +
    shown +
    ' of ' +
    total +
    ' ' +
    (state.runner === ALL ? 'commands, all runners' : state.runner + ' commands') +
    '</span>' +
    '<span>checked ' +
    new Date(state.checkedAt).toLocaleTimeString() +
    (state.loading ? ' - refreshing' : '') +
    '</span>' +
    cacheSpan(state.cache) +
    (errs.length ? '<span class="err">probe failed: ' + errs.join(', ') + '</span>' : '') +
    '<span><kbd>/</kbd> search &middot; <kbd>Enter</kbd> copy top hit &middot; ' +
    '<kbd>&uarr;</kbd><kbd>&darr;</kbd> move &middot; ' +
    '<kbd>Esc</kbd> back to search, again to clear it</span>'
}

/**
 * The run bar: enter a task's arguments before handing over the terminal.
 *
 * The command prefix is static text, not part of the field. The server adds
 * what this sends to the argv it looked up itself and ignores anything else,
 * so an editable `just` would mislead: editing it would change nothing. Only
 * the trailing arguments can be typed, and the bar shows exactly that.
 *
 * A bar rather than a modal: it needs no click to dismiss, and the row that
 * opened it stays on screen behind it.
 */
export function showRunBar(task: Task): HTMLInputElement {
  hideRunBar()
  const el = document.createElement('div')
  el.id = 'runbar'
  el.setAttribute('role', 'group')
  el.setAttribute('aria-label', 'Arguments for ' + task.display)
  const shape = paramShape(task.parameters)
  el.innerHTML =
    '<div class="runbar-line">' +
    '<span class="runbar-sigil" aria-hidden="true">$</span>' +
    '<span class="runbar-cmd">' +
    escapeHtml(task.argv.join(' ')) +
    '</span>' +
    '<input class="runbar-args" type="text" autocomplete="off" spellcheck="false"' +
    ' aria-label="Arguments" />' +
    '</div>' +
    '<div class="runbar-foot">' +
    '<span class="runbar-shape">takes ' +
    escapeHtml(shape) +
    '</span>' +
    '<span class="runbar-keys"><kbd>Enter</kbd> run &middot; <kbd>Esc</kbd> back</span>' +
    '</div>'
  document.body.append(el)
  const field = el.querySelector<HTMLInputElement>('.runbar-args')!
  field.focus()
  return field
}

/** Remove the run bar. Idempotent: `esc`, a run and a re-open all call it. */
export function hideRunBar(): void {
  document.getElementById('runbar')?.remove()
}

/**
 * The end of the page: the task now has the terminal and this server is gone.
 *
 * It replaces the view rather than sitting beside it, because nothing on
 * screen works any more. The catalog cannot be refreshed, the buttons cannot
 * act, and a poll would only show a failed fetch. So the page says the tab
 * is finished.
 */
export function showHandoff(command: string): void {
  const el = document.createElement('div')
  el.id = 'handoff'
  el.setAttribute('data-handoff', '')
  el.setAttribute('role', 'status')
  el.innerHTML =
    '<h2>Handed off to the terminal</h2>' +
    '<pre class="handoff-cmd">' +
    escapeHtml(command) +
    '</pre>' +
    '<p>It is running in the shell wayfinder was started from. This page is done — you can close it.</p>'
  document.body.append(el)
  el.tabIndex = -1
  el.focus()
}

/** Shown on the row that asked, when another run got the terminal first. */
export function showRunTaken(button: HTMLElement): void {
  const cell = button.closest('td.act')
  if (!cell || cell.querySelector('.runerr')) return
  const note = document.createElement('span')
  note.className = 'runerr'
  note.setAttribute('role', 'status')
  note.textContent = 'another run already took the terminal'
  cell.append(note)
  setTimeout(() => note.remove(), 4000)
}

/**
 * Set the sticky header's real height as a CSS variable. It is measured
 * rather than hard-coded because the search row and the status line wrap at
 * narrow widths. A wrong number would hide the first group header behind the
 * sticky header or leave a gap under it.
 */
export function measureChrome(): void {
  document.documentElement.style.setProperty(
    '--chrome-h',
    Math.round($('chrome').getBoundingClientRect().height) + 'px',
  )
}
