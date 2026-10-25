import { humanAge, humanMs } from '@osdlc/system-model/duration'
import { terms as splitTerms } from '@osdlc/system-model/match'
import type {
  Catalog,
  ChainSegment,
  RunnerBrand,
  RunnerCacheState,
  RunnerReport,
  Task,
} from '@osdlc/system-model/detect'
import { paramShape } from '@osdlc/system-model/params'

import { filterTasks, type TaskFilter } from '../core/filter.ts'
import { filterSkills, skillLine, type SkillHit, type SkillRow } from '../core/skills.ts'
import { SKILLS_GROUP, groupOf, groupRank } from '../groups.ts'
import { keysFor } from '../keys.ts'
import { terminalSafe } from '../terminal-text.ts'
import {
  APP,
  BIN,
  TASK_NOUN,
  SKILL_NOUN,
  WITHHELD,
  countRunners,
  countSkills,
  countTasks,
  parametersUnknownLabel,
  runnerLabel,
  staleLabel,
  withheldLabel,
} from '../vocabulary.ts'

import { $, ALL, OPEN, SEP, SHUT, SKILLS, state, toolInfo } from './state.ts'
import type { Row, ToolInfo, TreeNode } from './state.ts'

// The search is the core's `filterTasks`, bundled into the page, so the page,
// the terminal UI and `way query` keep and rank the same tasks.

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

/**
 * A tool's homepage as a link, or '' when it is not http or https. The core
 * already drops other schemes; this checks again because the page renders it.
 */
export function homepageLink(url: string | null, text = url ?? ''): string {
  if (url === null || !/^https?:\/\//i.test(url)) return ''
  return (
    '<a href="' +
    escapeHtml(url) +
    '" target="_blank" rel="noopener noreferrer">' +
    escapeHtml(text) +
    '</a>'
  )
}

/** A tool's language, with its ecosystem id when that says more: `JavaScript (node)`. */
export function languageText(tool: ToolInfo): string {
  return tool.ecosystem !== null && tool.ecosystem.toLowerCase() !== tool.language.toLowerCase()
    ? tool.language + ' (' + tool.ecosystem + ')'
    : tool.language
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
      escapeHtml(treeStart() === 0 && depth === 0 ? runnerLabel(seg) : seg) +
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
  if (task.parametersUnknown === 'editor-variable') {
    return task.display + ': ' + parametersUnknownLabel('editor-variable') + '.'
  }
  return (
    'Run ' +
    task.display +
    ' in the terminal ' +
    APP +
    ' is serving from. ' +
    'The server exits and this page is finished.'
  )
}

/**
 * The marker for a task whose parameters could not be read, with the one
 * label every surface shows for it. Run asks for arguments before such a
 * task runs, since it may need some.
 */
function paramsMark(task: Task): string {
  const reason = task.parametersUnknown
  if (reason === undefined) return ''
  const label = parametersUnknownLabel(reason)
  return (
    '<span class="ind-params" title="' +
    escapeHtml(label) +
    '">?<span class="sr">' +
    escapeHtml(label) +
    '</span></span>'
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
    paramsMark(e) +
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
    // Each button is named for its task, so a list of them reads as a list
    // of different actions, not "copy, copy, copy".
    '<td class="act">' +
    '<button class="runbtn" data-run-id="' +
    escapeHtml(e.id) +
    '" title="' +
    escapeHtml(runTip(e)) +
    '" aria-label="' +
    escapeHtml('Run ' + e.display + ' in the terminal') +
    '"' +
    (e.parametersUnknown === 'editor-variable' ? ' disabled' : '') +
    '>run</button>' +
    '<button class="copy" title="' +
    escapeHtml(copyTip(e)) +
    '" aria-label="' +
    escapeHtml('Copy ' + copyText(e)) +
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
 * `↵ copy`, the widest the column gets, with a few pixels to spare so a
 * fallback font does not clip the buttons.
 */
const ACT_W = 112
/** The action column at phone width, where the buttons are smaller. */
const ACT_W_NARROW = 96
/** The indicator gutter: room for the service dot and the parameters mark. */
const IND_W = 30
/** Below this table width the page is laid out for a phone. */
const NARROW_W = 600
/**
 * Below this the Runs column is dropped. Runs is cut off too much to be useful
 * below a 1100px viewport. `main` pads 16px on each side, so that is about
 * 1068px of table width. The number is in the same units as `availWidth()`:
 * the width of the table area (`main` minus its padding), not of the window.
 */
const RUNS_MIN_W = 1068

/**
 * Sizes measured from the rows of the last render: whether any row has
 * text for the Runs column, and how wide the Task column must be for the
 * longest name, indent included. null when it could not be measured.
 */
let measured: { runsHaveText: boolean; nameW: number | null } = {
  runsHaveText: true,
  nameW: null,
}

/** The width every table's columns are measured against. */
function availWidth(): number {
  return Math.max(300, state.mainWidth || 1000)
}

function actWidth(): number {
  return availWidth() < NARROW_W ? ACT_W_NARROW : ACT_W
}

/**
 * Whether the Runs column is shown right now: the table is wide enough, and
 * some row has something to put in it. `colgroup`, `cells` and
 * `renderColHeads` all call this, because if a table's colgroup, head row and
 * body rows disagree on the number of columns, every column after the first
 * is misaligned.
 */
function showRuns(): boolean {
  return availWidth() >= RUNS_MIN_W && measured.runsHaveText
}

/** The width of `text` in the Task column's font, or null without a canvas. */
let measureCtx: CanvasRenderingContext2D | null | undefined
function textWidth(text: string): number | null {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d')
    } catch {
      measureCtx = null
    }
    if (measureCtx) {
      const mono = getComputedStyle(document.documentElement).getPropertyValue('--wf-font-mono')
      measureCtx.font = '600 13px ' + (mono.trim() || 'monospace')
    }
  }
  return measureCtx ? measureCtx.measureText(text).width : null
}

/** Measure the rows a render is about to draw. See {@link measured}. */
function measureRows(rows: readonly Row[], flat: boolean, skills: readonly SkillHit[] = []): void {
  let nameW: number | null = 0
  // A skill row sits one level down in the combined tree, else at the root.
  const skillDepth = !flat && state.runner === ALL ? 1 : 0
  for (const hit of skills) {
    const w = textWidth(skillLine(hit.skill))
    if (w === null) {
      nameW = null
      break
    }
    nameW = Math.max(nameW ?? 0, w + skillDepth * INDENT_PER_LEVEL)
  }
  for (const row of nameW === null ? [] : rows) {
    const e = row.entry
    // A search hit shows its whole chain at depth 0. A tree row shows the
    // part below its group headers, indented once per header.
    const depth = flat ? 0 : Math.max(0, e.path.length - 1 - treeStart())
    const text = flat ? e.path.join(SEP) : (e.path.at(-1) ?? '')
    const w = textWidth(text)
    if (w === null) {
      nameW = null
      break
    }
    nameW = Math.max(nameW ?? 0, w + depth * INDENT_PER_LEVEL)
  }
  measured = {
    runsHaveText:
      skills.length > 0 ||
      rows.some((r) => (r.entry.doc ?? '') !== '' || (r.entry.detail ?? '') !== ''),
    nameW,
  }
}

/**
 * The columns, named once. `tip` is the hover text. The help modal has the
 * longer version of anything a tooltip cannot hold. This is the full list;
 * `renderColHeads` drops Runs when the width does.
 */
export const COLUMNS = [
  {
    label: '',
    tip: "Row indicators. A filled dot marks a service — a task that runs until you stop it, such as a dev server, a watcher or a preview. An outlined dot means that was inferred from the task's name rather than declared by the runner. A ? means its parameters could not be read, so Run asks for arguments.",
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
    tip:
      'Row actions. Run hands the task to the terminal ' +
      APP +
      ' is serving from, and ends this page. Copy puts the command on the clipboard, with the cd that a task bound to its own directory needs; on the row Enter would take it reads \u21b5 copy.',
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
 * in the strip left of the headers.
 *
 * Task is sized to its longest name, up to a share of the width; Command
 * takes what is left, shared with Runs when Runs is shown. The sized columns
 * add up to the table's width exactly, because `table-layout: fixed` would
 * spread any leftover across the columns and move the command column at
 * every depth.
 */
function colgroup(depth: number): string {
  const indent = depth * INDENT_PER_LEVEL
  const avail = availWidth()
  const act = actWidth()
  const wide = showRuns()
  const rest = avail - IND_W - act
  // Room for the cell's right padding and a bold glyph's overhang.
  const content = measured.nameW === null ? null : Math.ceil(measured.nameW) + 16
  const cap = Math.round(rest * (wide ? 0.4 : 0.5))
  const nameTotal = Math.max(90, Math.min(cap, content ?? Math.round(rest * 0.45)))
  const name = Math.max(40, nameTotal - indent)
  const left = rest - nameTotal
  const run = wide ? Math.round(left * 0.55) : left
  return (
    '<colgroup>' +
    // The indicator column comes first and is fixed, so an icon sits at the
    // same x in every row. The depth spacer comes after it and indents only
    // the Task text.
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
    act +
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

// ---------------------------------------------------------------- skills

/** What Copy and Run hand over for a skill: `/<name>`, control characters replaced. */
export function skillCopyText(skill: SkillRow): string {
  return terminalSafe(skill.invoke)
}

/**
 * One skill row, in the same columns as a task: the `/<name>` line, the
 * harnesses and description, the origin and file, and Copy. A skill has no
 * command line, so it has no Run button; Run on it (Shift+Enter) copies too
 * (see input.ts). Nothing is sent to the server.
 */
function renderSkillRow(hit: SkillHit, depth = 0): string {
  const s = hit.skill
  const line = skillLine(s)
  // labelHits index into the name; the line starts with the invoke's `/`.
  const shift = s.invoke.endsWith(s.name) ? s.invoke.length - s.name.length : 0
  const name = highlight(line, hit.labelHits === null ? null : hit.labelHits.map((i) => i + shift))
  const description = s.description ?? ''
  const copy = skillCopyText(s)
  return (
    '<tr data-skill="1" data-id="' +
    escapeHtml(s.id) +
    '" tabindex="-1">' +
    '<td class="ind"><span class="inds"></span></td>' +
    spacerCell(depth) +
    '<td class="name" title="' +
    escapeHtml(line) +
    '">' +
    name +
    '</td>' +
    '<td class="run skill-about" title="' +
    escapeHtml(description) +
    '">' +
    s.harnesses.map((h) => '<span class="skill-for">' + escapeHtml(h) + '</span>').join('') +
    escapeHtml(description) +
    '</td>' +
    (showRuns()
      ? '<td class="doc">' +
        escapeHtml(s.origin) +
        '<span class="detail" title="' +
        escapeHtml(s.path) +
        '">' +
        escapeHtml(s.path) +
        '</span></td>'
      : '') +
    '<td class="act">' +
    '<button class="copy" title="' +
    escapeHtml('Copy ' + copy + ' to type to ' + (s.harnesses.join(', ') || 'an agent') + '.') +
    '" aria-label="' +
    escapeHtml('Copy ' + copy) +
    '" data-run="' +
    escapeHtml(copy) +
    '">copy</button>' +
    '</td></tr>'
  )
}

/** The skills table at `depth`. */
function skillTable(hits: readonly SkillHit[], depth: number): string {
  return (
    '<table style="' +
    outdent(depth) +
    '">' +
    colgroup(depth) +
    '<tbody>' +
    hits.map((h) => renderSkillRow(h, depth)).join('') +
    '</tbody></table>'
  )
}

/** The Skills group in the combined tree: one header like a runner's, then its rows. */
function skillsNode(hits: readonly SkillHit[]): string {
  const key = SKILLS
  const collapsed = state.collapsed.has(key)
  return (
    '<div class="node" data-collapsed="' +
    collapsed +
    '" data-key="' +
    escapeHtml(key) +
    '">' +
    '<div class="head" style="top:calc(var(--chrome-h) + 0 * var(--head-h));z-index:20">' +
    '<span class="twisty">' +
    (collapsed ? SHUT : OPEN) +
    '</span>' +
    '<span class="seg-name">' +
    escapeHtml(SKILLS_GROUP.title) +
    '</span>' +
    '<span class="node-count">' +
    hits.length +
    '</span>' +
    '</div>' +
    '<div class="kids">' +
    skillTable(hits, 1) +
    '</div>' +
    '</div>'
  )
}

/**
 * The skills the current view shows: on the combined and Skills tabs, kept
 * by the same filter as the tasks. A runner's tab shows none, and so does
 * Services (see `filterSkills`).
 */
function skillHits(filter: TaskFilter): SkillHit[] {
  if (state.runner !== ALL && state.runner !== SKILLS) return []
  return filterSkills(state.catalog?.skills ?? [], filter)
}

/** Counts the status line shows for skills, set by the last render. */
let skillCounts = { shown: 0, total: 0 }

// ---------------------------------------------------------------- render

/**
 * The one runner order, used by the tabs, the picker and the tree's top level.
 * All three must agree, or the tab bar no longer matches the page below it.
 *
 * Grouped first (tasks, dependencies, tools, git hooks), then by
 * `runners.order` within a group. A drag writes `runners.order` to the user
 * config. The server sends the catalog in the configured order, so a runner
 * not in the order keeps its catalog place after the ones that are.
 */
export function runnerOrder(): string[] {
  const present = (state.catalog?.reports || []).map((r) => r.runner)
  const saved = state.runnerOrder.filter((r) => present.includes(r))
  // The catalog is already in the configured order, so the rest keep it.
  const unsaved = present.filter((r) => !saved.includes(r))
  return [...saved, ...unsaved].sort((a, b) => groupRank(a) - groupRank(b))
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

/** The runner order sorted by `key`, remembered as the sort last asked for. */
export function sortRunners(key: SortKey, dir: 1 | -1): string[] {
  requestedSort = { key, dir }
  return sortedRunnerOrder(key, dir)
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
 * A withheld runner's label, from the catalog's unknowns: `withheld: mise is
 * not trusted` when a tool it runs is what is missing.
 */
export function withheldNote(runner: string): string {
  const held = state.unknowns.find((u) => u.kind === 'withheld' && u.runner === runner)
  return held?.label ?? withheldLabel(state.trustable ? 'untrusted' : 'exec-off')
}

/**
 * Why a runner reports nothing when execution is off, in the words every
 * surface uses. Three places show it: the tab's tooltip, the picker's note
 * and the per-runner modal.
 */
function execNote(runner: string): string {
  return 'This runner can only be read by running it. ' + withheldNote(runner) + '.'
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

/**
 * The Skills tab, after the runners' tabs under its own group label. It is
 * not a runner: it is not dragged, has no info button and is not in the
 * picker.
 */
function skillsTab(total: number, labelled: boolean): string {
  if (total === 0) return ''
  return (
    (labelled ? '<span class="tabgroup">' + escapeHtml(SKILLS_GROUP.title) + '</span>' : '') +
    '<span class="tab"><button data-runner="' +
    SKILLS +
    '" aria-pressed="' +
    (state.runner === SKILLS) +
    '" title="Agent skills: copy /name to type to an agent">' +
    escapeHtml(SKILLS_GROUP.title) +
    '<span class="count">' +
    total +
    '</span></button></span>'
  )
}

/** Whether a runner has an info button: path segments to explain, or tool info. */
function hasInfo(runner: string): boolean {
  return chainOf(runner).length > 0 || toolInfo(runner) !== undefined
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
  const skillsTotal = cat.skills?.length ?? 0
  if (
    state.runner === SKILLS ? skillsTotal === 0 : state.runner !== ALL && !enabled.has(state.runner)
  )
    state.runner = ALL

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
        const tip = t.exec
          ? shape
            ? shape + '. ' + execNote(t.runner)
            : execNote(t.runner)
          : shape
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
          (t.exec ? '<span class="count exec">' + WITHHELD + '</span>' : '') +
          '</button>'
        // The info button sits beside the tab, not inside it. A button cannot
        // be inside a button, and the tab must stay one click target that
        // selects.
        const info = hasInfo(t.runner)
          ? '<button class="tabinfo" data-info-runner="' +
            escapeHtml(t.runner) +
            '" title="About ' +
            escapeHtml(t.runner) +
            ': the tool and its path segments" aria-label="About ' +
            escapeHtml(t.runner) +
            '">i</button>'
          : ''
        return header + '<span class="tab">' + btn + info + '</span>'
      })
      .join('') +
    skillsTab(skillsTotal, shown.length > 0) +
    foldedChip(foldable)
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
  // The same filter `way list` and `way query` apply: Services is
  // --services, Declared is --declared and Scope is --depth.
  const filter: TaskFilter = {
    query: state.query,
    mode: state.mode,
    servicesOnly: state.servicesOnly,
    declaredOnly: state.declaredOnly,
    ...(state.depth < 99 ? { maxDepth: state.depth } : {}),
  }
  const rows: Row[] = filterTasks(scope, filter).map((hit) => ({
    entry: hit.task,
    score: hit.score,
    labelHits: hit.labelHits,
  }))
  const skills = skillHits(filter)
  skillCounts = {
    shown: skills.length,
    total: state.runner === ALL || state.runner === SKILLS ? skillsTotal : 0,
  }
  measureRows(rows, terms.length > 0, skills)

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
  const onSkills = state.runner === SKILLS
  if (rows.length === 0 && skills.length === 0) {
    const noun = onSkills ? SKILL_NOUN.one : TASK_NOUN.one
    html +=
      '<div class="empty">' +
      (inScope || skillCounts.total ? 'No ' + noun + ' matches.' : 'Nothing collected.') +
      '</div>'
  } else if (terms.length) {
    // Searching ranks results, best first, so the tree gives way to a flat
    // list. Tasks and skills are scored by the same matcher, so they merge.
    const hits: { score: number; html: () => string }[] = [
      ...rows.map((r) => ({ score: r.score, html: () => renderSearchRow(r) })),
      ...skills.map((h) => ({ score: h.score, html: () => renderSkillRow(h) })),
    ]
    hits.sort((a, b) => b.score - a.score)
    html +=
      '<table>' +
      colgroup(0) +
      '<tbody>' +
      hits
        .slice(0, 400)
        .map((h) => h.html())
        .join('') +
      '</tbody></table>'
  } else if (onSkills) {
    html += skillTable(skills, 0)
  } else {
    html += renderNode(buildTree(rows), []) + (skills.length > 0 ? skillsNode(skills) : '')
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

/** The web view's list keys as help rows, from the table in `keys.ts`. */
function keyRows(): string {
  return keysFor('web', 'list')
    .map(
      (k) =>
        '<dt>' +
        k.keys.map((key) => '<kbd>' + escapeHtml(key) + '</kbd>').join(' ') +
        '</dt><dd>' +
        escapeHtml(k.action) +
        '</dd>',
    )
    .join('')
}

/**
 * The help: what each part of the page is, named as the page names it, with
 * the command each action is. The two points that surprise people come
 * first: part of a task's chain is grouping this page adds, and a task can be
 * declared by a runner or only implied by a convention.
 */
export function helpHtml(): string {
  return [
    '<h3 id="help-title">What this is</h3>',
    '<p>Every ' +
      TASK_NOUN.one +
      ' this repository can run, from every runner it uses, in one searchable list. ',
    'The runners answer only for themselves — <code>just --list</code> knows nothing about moon — so ' +
      APP +
      ' asks each of them and merges the answers. ',
    'The page and <code>' +
      BIN +
      '</code> on the command line do the same things: each action below names its command.</p>',

    '<h3>Keys</h3>',
    '<dl class="keys">' + keyRows() + '</dl>',

    '<h3>The columns</h3>',
    '<dl>',
    "<dt>Task</dt><dd>The call chain. The first segment is the runner, the last is the task's own name. ",
    'The middle is <strong>grouping this page adds</strong> so hundreds of names stay scannable — it is not part of any command. ',
    'Hover a segment to see what that position means for its runner.</dd>',
    '<dt>Command</dt><dd>Exactly what to type. Nearly every command is written to run <strong>from the repository root</strong>. ',
    'Where a task can only run from its own directory, Copy adds the <code>cd</code> for you.</dd>',
    '<dt>Runs</dt><dd>What the task runs, or the summary its runner documents. It is shown on a wide window when some task has one.</dd>',
    '<dt>Marks</dt><dd>A filled dot marks a service: a task that runs until you stop it, such as a dev server or a watcher. An outlined dot means that was inferred from the name. ',
    'A <code>?</code> means the parameters could not be read; Run then asks for arguments, which may be left empty.</dd>',
    '</dl>',

    '<h3>The controls</h3>',
    '<dl>',
    '<dt>Scope</dt><dd>How far into the repository to look, by <strong>where a task is declared</strong>. ',
    '<em>Root</em> is what the repository declares itself — its own justfile, package.json and moon project. <code>' +
      BIN +
      ' list --depth N</code> is the same filter.</dd>',
    '<dt>Services</dt><dd>Only services. <code>' + BIN + ' list --services</code>.</dd>',
    '<dt>Declared</dt><dd>Drops tasks no file declares, such as <code>cargo test</code> for a crate. <code>' +
      BIN +
      ' list --declared</code>.</dd>',
    '<dt>Runners</dt><dd>Which runners this page shows, for this visit. Drag a runner, here or in the tab row, to reorder; the order is saved as <code>runners.order</code> in your user config.</dd>',
    "<dt>Fuzzy / Exact</dt><dd>Terms are ANDed, so <code>photo dev</code> narrows to a photo app's dev server. A leading quote forces one term to match exactly.</dd>",
    '<dt>Filters</dt><dd>On a narrow window, Scope, Services, Declared and Runners fold into this one menu.</dd>',
    '<dt>Collapse, Refresh</dt><dd>Collapse folds the groups. Refresh reads every runner again (<code>' +
      BIN +
      ' list</code>).</dd>',
    '<dt>Theme</dt><dd>Cycles System, Light and Dark, and saves <code>theme</code> in your user config.</dd>',
    '</dl>',

    '<h3>Run and Copy</h3>',
    '<p><b>Run</b> hands the task to the terminal ' +
      APP +
      ' is serving from, as <code>' +
      BIN +
      ' run &lt;id&gt; -- &lt;arguments&gt;</code> does. The server stops and this page is done. ',
    'A task that takes parameters, or whose parameters could not be read, asks for its arguments first. ',
    '<b>Copy</b> puts the command on the clipboard.</p>',

    '<h3>Skills</h3>',
    '<p>The Skills tab lists the agent skills this repository ships (the <code>skills</code> setting can add your own). ',
    'A skill is not a command: an agent runs it when you type <code>/&lt;name&gt;</code>. So Copy, Enter and Run all put <code>/&lt;name&gt;</code> on the clipboard to paste into ',
    'the agent the row names, and nothing runs here. The search and Services filter skills as they filter tasks.</p>',

    '<h3>Settings</h3>',
    "<p>The gear opens this project's settings (<code>" +
      BIN +
      ' config list</code>). Edits are staged until Save, which writes each one with <code>' +
      BIN +
      ' config set</code> and names the file it wrote. ',
    'Trust this repository, or one tool, asks you to confirm first. <code>allowExec</code>, the trust policy and <code>tools</code> are changed from the command line only; the screen shows the command for each.</p>',

    '<h3>Why a runner might show nothing</h3>',
    "<p>Some runners can only be read by running them — <code>moon query tasks</code> evaluates this repository's own toolchain configuration. ",
    'Until the repository is trusted they are ' +
      WITHHELD +
      ', and their tab says so. Trust this repository asks you to confirm, then runs <code>' +
      BIN +
      ' trust</code>. ',
    'A runner can also wait on one tool, such as mise for a mise task: Settings trusts that tool alone (<code>' +
      BIN +
      ' trust --scope &lt;tool&gt;</code>). ',
    'A repository cannot grant itself that: <code>allowExec</code> in its own config file cannot raise the gate.</p>',

    '<h3>Staying current</h3>',
    '<p>The page reads the repository again when you focus it and every 15 seconds. ',
    'The first view may come from the stored probe, so it appears at once; the status line then names the stale runners, and a fresh read follows.</p>',
  ].join('')
}

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
        s.status === 'error' ? ' (failed)' : s.skippedForExec ? ' (' + WITHHELD + ')' : ''
      // The button sits next to the note, where the problem is named. One
      // button per withheld row is fine: they all grant the same thing, and
      // the click is confirmed before anything happens.
      const grant = s.skippedForExec && state.trustable ? TRUST_BUTTON : ''
      // A folded runner has no tab, and so no tab `i` button. The picker row
      // is the one place every runner is always listed, so it has the same
      // info button. A <label> passes a click to its checkbox, so the button
      // sits outside the label, or clicking it would also turn the runner
      // off.
      const info = hasInfo(s.runner)
        ? '<button class="tabinfo" data-info-runner="' +
          escapeHtml(s.runner) +
          '" title="About ' +
          escapeHtml(s.runner) +
          ': the tool and its path segments" aria-label="About ' +
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
        escapeHtml(runnerLabel(s.runner)) +
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

/** The task rows in #out: every body row but the skills'. */
export function taskRows(): HTMLElement[] {
  return listRows().filter((r) => !r.hasAttribute('data-skill'))
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
 * A tool's description, language and homepage, from `way providers`. The
 * description and homepage of a custom tool are repository text, so both
 * are escaped, and the homepage is a link only when it is http or https.
 */
export function toolAboutHtml(tool: ToolInfo): string {
  const link = homepageLink(tool.homepage)
  return (
    (tool.description !== null
      ? '<p class="tool-desc">' + escapeHtml(tool.description) + '</p>'
      : '') +
    '<dl class="tool-facts"><dt>Language</dt><dd>' +
    escapeHtml(languageText(tool)) +
    '</dd>' +
    (link !== '' ? '<dt>Homepage</dt><dd>' + link + '</dd>' : '') +
    '</dl>'
  )
}

/**
 * One runner's explanation: the tool it is, what each position of its path
 * selects, and whether reading it means running anything.
 */
export function showRunnerInfo(runner: string): void {
  const report = (state.catalog?.reports || []).find((r) => r.runner === runner)
  if (!report) return
  const tool = toolInfo(runner)
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
    notes.push('<p>Not collected right now. ' + escapeHtml(execNote(runner)) + '</p>')
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
    '<h3 id="help-title">' +
    escapeHtml(runnerLabel(runner)) +
    '</h3>' +
    (tool !== undefined ? toolAboutHtml(tool) : '') +
    (report.chain.length > 0
      ? '<p>A task from this runner reads <code>' +
        escapeHtml(shape) +
        '</code>.</p>' +
        '<dl>' +
        rows +
        '</dl>'
      : '') +
    notes.join('') +
    '<p>' +
    escapeHtml(countTasks(report.tasks.length)) +
    ' found.</p>'
  openDialogAtTop('help')
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
        slow
          .map((r) => runnerLabel(r.runner) + ' (' + humanAge(r.ageMs) + ', ' + cost(r) + ')')
          .join(', '),
      ) +
      ' - slow to probe here, so re-reading takes a moment</span>'
    )
  }
  return (
    '<span>cached: ' +
    escapeHtml(
      stale
        .map((r) => runnerLabel(r.runner) + ' (' + staleLabel(r.reason, r.ageMs) + ')')
        .join(', '),
    ) +
    ' - re-probing</span>'
  )
}

/**
 * Runners withheld because execution is off, shown in the page's own bar
 * above everything, in the words the CLI's note uses: `2 runners withheld:
 * this repository is not trusted`.
 *
 * Without it, the page would mention withheld runners only behind a hover or
 * a click, and someone would see a shorter catalog with nothing saying that
 * anything was missing.
 *
 * It names the runners rather than only counting them. The trust button is
 * included only when trust is what is missing. Otherwise execution is off
 * for the session and trusting the repository would change nothing.
 */
export function withheldBar(reports: readonly RunnerReport[]): string {
  const held = reports.filter((s) => s.skippedForExec)
  if (held.length === 0) return ''
  // One sentence per label, so a runner missing one tool is named apart from
  // the ones missing the repository's trust.
  const byLabel = new Map<string, string[]>()
  for (const s of held) {
    const label = withheldNote(s.runner)
    byLabel.set(label, [...(byLabel.get(label) ?? []), runnerLabel(s.runner)])
  }
  return (
    [...byLabel]
      .map(
        ([label, names]) =>
          '<span>' +
          escapeHtml(countRunners(names.length)) +
          ' ' +
          escapeHtml(label) +
          ': <span class="who">' +
          escapeHtml(names.join(', ')) +
          '</span>.</span>',
      )
      .join(' ') + (state.trustable ? TRUST_BUTTON : '')
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
    (state.runner === SKILLS
      ? skillCounts.shown + ' of ' + escapeHtml(countSkills(skillCounts.total))
      : shown +
        ' of ' +
        escapeHtml(countTasks(total)) +
        (state.runner === ALL ? ', all runners' : ' in ' + escapeHtml(runnerLabel(state.runner))) +
        (skillCounts.total > 0
          ? ', ' + skillCounts.shown + ' of ' + escapeHtml(countSkills(skillCounts.total))
          : '')) +
    '</span>' +
    '<span>checked ' +
    new Date(state.checkedAt).toLocaleTimeString() +
    (state.loading ? ' - refreshing' : '') +
    '</span>' +
    cacheSpan(state.cache) +
    (errs.length
      ? '<span class="err">probe failed: ' +
        escapeHtml(errs.map(runnerLabel).join(', ')) +
        '</span>'
      : '') +
    '<span class="keyhint"><kbd>Enter</kbd> copy &middot; <kbd>Shift+Enter</kbd> run &middot; ' +
    '<kbd>?</kbd> all keys</span>'
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
  // A task whose parameters could not be read may still need some, so the
  // bar says why it asked, and Enter with nothing typed runs it as it is.
  const shape =
    task.parametersUnknown !== undefined
      ? parametersUnknownLabel(task.parametersUnknown) + '; arguments are optional'
      : 'takes ' + paramShape(task.parameters)
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
    '<span class="runbar-shape">' +
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
    '<p>It is running in the shell ' +
    escapeHtml(APP) +
    ' was started from. This page is done — you can close it.</p>'
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
  const chrome = $('chrome')
  // At phone width the header is not sticky, so group headers stick at the top.
  const sticky = getComputedStyle(chrome).position === 'sticky'
  document.documentElement.style.setProperty(
    '--chrome-h',
    (sticky ? Math.round(chrome.getBoundingClientRect().height) : 0) + 'px',
  )
}

/**
 * Open a dialog with its body scrolled to the top and focused. `showModal`
 * focuses the first control, the Close button at the end, which would scroll
 * a long body to the bottom.
 */
export function openDialogAtTop(id: 'help' | 'settings'): void {
  const dialog = $(id) as HTMLDialogElement
  if (!dialog.open) dialog.showModal()
  const body = $(id + '-body')
  body.scrollTop = 0
  body.focus({ preventScroll: true })
}

/**
 * The page when it could not sign in: the boot token was used, expired or
 * missing, as after a reload. Only the terminal can hand out a new one.
 */
export function showSignedOut(): void {
  document.body.innerHTML =
    '<main class="signedout">' +
    '<h1>This browser is not signed in.</h1>' +
    '<p>' +
    escapeHtml(APP) +
    ' needs a fresh link, and only your terminal can hand one out.</p>' +
    '<p>Go to the terminal ' +
    escapeHtml(APP) +
    ' is running in, stop it with <code>Ctrl-C</code> and start it again with <code>' +
    escapeHtml(BIN) +
    ' serve</code>: it prints a new link that signs this browser in.</p>' +
    '</main>'
}

/** The colour-scheme cycle: what a click on the theme button moves to. */
export const THEME_CYCLE: Record<string, string> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

/** How the button shows each scheme when it is the one in use. */
const THEME_FACE: Record<string, { glyph: string; name: string; note: string }> = {
  system: { glyph: '◐', name: 'System', note: ' (follows your OS)' },
  light: { glyph: '☀', name: 'Light', note: '' },
  dark: { glyph: '☾', name: 'Dark', note: '' },
}

/**
 * Update the theme button for the choice now in use.
 *
 * The button shows the current scheme, so both the title and the accessible
 * name must say two things: what is on, and what a click does next. A single
 * cycling button has nowhere else to say the second, and a screen-reader user
 * would otherwise not know what the press does. Startup calls this too, so
 * the button matches the restored preference from the first frame.
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
