/**
 * The task body as a document of `## ` sections: split it, replace one section, and
 * ask whether the result is complete — the pure core of `sdlc task set-section` and
 * `sdlc task create --body-file`, and of the define guard the work tick runs.
 *
 * Two ideas live here besides the section walk.
 *
 * BODY GAPS. {@link taskBodyGaps} is the readiness check `task gap-report` runs
 * (required sections present, no unresolved placeholder, a checkbox AC list),
 * minus the corpus-wide slices (claims, parenthood) that need a repository. It
 * composes the same helpers the op does, so the two cannot disagree on what a gap is.
 *
 * INTENT. A task's Goal and Acceptance criteria say WHAT it asks for; every other
 * section says how or why. {@link taskIntent} is the normalised pair of the two, with
 * whitespace collapsed and checkbox state erased, so ticking `- [ ]` to `- [x]` is
 * not a change of intent while rewording a criterion is.
 */

import { stripFrontmatter, scanBody } from './ops/scan-placeholders.ts'
import { readyContractContentGaps, sectionPresence } from './ops/gap-report.ts'
import { TASK_BODY, taskSectionLookup } from './schema.ts'

/** One H2 section of a body: the heading as written, and the lines under it. */
export interface BodySection {
  /** The heading text as written (`Acceptance criteria`). */
  heading: string
  /** First line of the heading, 0-indexed into the body's lines. */
  start: number
  /** One past the last line of the section, 0-indexed. */
  end: number
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const H2 = /^##\s+(.+?)\s*#*\s*$/

/** The `## ` sections of `body`, in order, ignoring headings inside fenced code. */
export function bodySections(body: string): { lines: string[]; sections: BodySection[] } {
  const lines = body.split('\n')
  const sections: BodySection[] = []
  let fence: string | null = null // the opening fence run, e.g. three backticks or four tildes
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const f = FENCE.exec(line)
    if (f !== null) {
      const run = f[1] as string
      if (fence === null) fence = run
      // A fence closes only on the same character, at least as long as the opener,
      // with nothing after it (a closing fence takes no info string).
      else if (
        run[0] === fence[0] &&
        run.length >= fence.length &&
        line.slice(f[0].length).trim() === ''
      )
        fence = null
      continue
    }
    if (fence !== null) continue
    const m = H2.exec(line)
    if (m === null) continue
    const prev = sections[sections.length - 1]
    if (prev !== undefined) prev.end = i
    sections.push({ heading: (m[1] as string).trim(), start: i, end: lines.length })
  }
  return { lines, sections }
}

/** Machine key of a section name (`goal`, `acceptance_criteria`, ...), or `null` for a free-form section. */
const KEY_BY_NAME = taskSectionLookup(TASK_BODY, (s) => s.key)
export function sectionKey(name: string): string | null {
  return KEY_BY_NAME.get(name.trim().toLowerCase()) ?? null
}

/** The key two section names share, or the lower-cased name itself for a free-form section. */
function identity(name: string): string {
  return sectionKey(name) ?? name.trim().toLowerCase()
}

/** The text under section `name` (heading excluded), or `null` when absent. */
export function sectionText(body: string, name: string): string | null {
  const { lines, sections } = bodySections(body)
  const want = identity(name)
  const s = sections.find((x) => identity(x.heading) === want)
  return s === undefined ? null : lines.slice(s.start + 1, s.end).join('\n')
}

/**
 * Replace (or add) section `name` in `body` with `content`. An existing section keeps
 * the heading text it was written with; a new one uses the canonical spelling and is
 * placed before the first present section that follows it in the contract's order,
 * else at the end. Everything outside the section is byte-identical.
 */
export function replaceSection(body: string, name: string, content: string): string {
  const { lines, sections } = bodySections(body)
  const want = identity(name)
  const block = (heading: string): string[] => [
    '## ' + heading,
    '',
    ...content.trim().split('\n'),
    '',
  ]
  const existing = sections.find((x) => identity(x.heading) === want)
  if (existing !== undefined) {
    // The block ends in a blank line: it separates the section from the next one, or is the file's final newline.
    return [
      ...lines.slice(0, existing.start),
      ...block(existing.heading),
      ...lines.slice(existing.end),
    ].join('\n')
  }
  const order = TASK_BODY.map((s) => s.key)
  const mine = order.indexOf(want)
  const canonical = TASK_BODY.find((s) => s.key === want)?.names[0] ?? name.trim()
  const before =
    mine < 0
      ? undefined
      : sections.find((x) => {
          const idx = order.indexOf(identity(x.heading))
          return idx > mine
        })
  if (before !== undefined) {
    return [
      ...lines.slice(0, before.start),
      ...block(canonical),
      ...lines.slice(before.start),
    ].join('\n')
  }
  const head = lines.join('\n').replace(/\s+$/, '')
  return `${head}\n\n${block(canonical).join('\n').replace(/\s+$/, '')}\n`
}

// ── intent ───────────────────────────────────────────────────────────────────

/** What a task asks for: its Goal and Acceptance criteria, normalised for comparison. */
export interface TaskIntent {
  goal: string
  acceptance_criteria: string
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** `- [x] AC-1: foo` and `- [ ] AC-1: foo` are the same criterion. */
function untick(text: string): string {
  return text.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/gm, '$1[ ]')
}

/** The normalised Goal and Acceptance criteria of a task body or document. */
export function taskIntent(text: string): TaskIntent {
  const [body] = stripFrontmatter(text)
  return {
    goal: collapse(sectionText(body, 'Goal') ?? ''),
    acceptance_criteria: collapse(untick(sectionText(body, 'Acceptance criteria') ?? '')),
  }
}

/** Which of the two intent sections differ between `before` and `after` (empty when none). */
export function changedIntent(before: TaskIntent, after: TaskIntent): Array<keyof TaskIntent> {
  const out: Array<keyof TaskIntent> = []
  if (before.goal !== after.goal) out.push('goal')
  if (before.acceptance_criteria !== after.acceptance_criteria) out.push('acceptance_criteria')
  return out
}

/**
 * Which intent sections an edit changed or removed, counting only sections that had
 * content before: filling an empty or missing Goal or acceptance-criteria section is
 * what definition is for, not a change of intent.
 */
export function changedFilledIntent(
  before: TaskIntent,
  after: TaskIntent,
): Array<keyof TaskIntent> {
  return changedIntent(before, after).filter((key) => before[key] !== '')
}

/** The state from which Goal and Acceptance criteria are locked: everything past `planning/*`. */
export function intentLocked(state: unknown): boolean {
  return typeof state === 'string' && !state.startsWith('planning/')
}

// ── gaps ─────────────────────────────────────────────────────────────────────

/** One thing wrong with a task body, as `task gap-report` would name it. */
export interface BodyGap {
  code: string
  section: string | null
  line: number | null
  message: string
}

/** The readiness gaps of a task body (or whole document): missing sections, placeholders, a malformed AC list. */
export function taskBodyGaps(text: string): BodyGap[] {
  const gaps: BodyGap[] = []
  for (const s of sectionPresence(text)) {
    if (!s.present) {
      gaps.push({
        code: 'section-missing',
        section: s.section,
        line: null,
        message: `Required section "${s.section}" is absent.`,
      })
    }
  }
  const [body, offset] = stripFrontmatter(text)
  for (const p of scanBody(body, offset)) {
    gaps.push({
      code: 'placeholder',
      section: p.section,
      line: p.line,
      message: `Unresolved placeholder ${p.phrase} in "${p.section}": ${p.snippet}`,
    })
  }
  for (const ac of readyContractContentGaps(text, '').acShape) {
    gaps.push({
      code: ac.id === 'content/list/min-items' ? 'ac-empty' : 'ac-not-checklist',
      section: ac.section,
      line: ac.line,
      message: `Acceptance-criteria content error: ${ac.message}`,
    })
  }
  // Prose where the checklist should be is a block-kind finding the shared helper does not
  // surface; gap-report would call the section present and empty-handed, so say so here.
  const ac = sectionText(body, 'Acceptance criteria')
  if (
    ac !== null &&
    !gaps.some((g) => g.code.startsWith('ac-')) &&
    !/^\s*[-*+]\s+\[[ xX]\]/m.test(ac)
  ) {
    gaps.push({
      code: 'ac-not-checklist',
      section: 'Acceptance criteria',
      line: null,
      message: 'Acceptance-criteria content error: the section has no `- [ ]` checklist items.',
    })
  }
  return gaps
}

/** A gap's identity across two versions of a body: its line moves, nothing else does. */
export function gapKey(g: BodyGap): string {
  return `${g.code}\u0000${g.section ?? ''}\u0000${g.message}`
}

/** `  - <message> (line N)` lines for an error message. */
export function formatGaps(gaps: readonly BodyGap[]): string {
  return gaps.map((g) => `  - ${g.message}${g.line !== null ? ` (line ${g.line})` : ''}`).join('\n')
}
