/**
 * `sdlc task set-section <task> <Section> (--from <path> | --text <text|->)` — replace (or add) one
 * `## <Section>` of a task body, leaving frontmatter and every other section
 * byte-identical.
 *
 * The body writer the task noun was missing: `create` writes the template, `update`
 * writes frontmatter, and everything between used to be a hand edit, so a
 * placeholder could survive or a required section vanish unnoticed until the
 * readiness check. This op validates the whole body after the edit:
 *
 *   - an edit that INTRODUCES a readiness gap (a placeholder in the new text, a
 *     required section removed, a broken AC list) is refused with
 *     `TASK_BODY_GAPS` unless `--allow-gaps`. Gaps the body already had in other
 *     sections are reported on stderr and do not block — a freshly scaffolded task
 *     is full of them, and filling it one section at a time must be possible;
 *   - once a task is past `planning/*` (`open/ready` and every later state), its
 *     Goal and Acceptance criteria say what was agreed, so changing either is
 *     refused with `TASK_INTENT_LOCKED` unless `--change-intent`. Ticking an
 *     acceptance-criteria checkbox is not a change: the comparison erases
 *     checkbox state and whitespace ({@link taskIntent}).
 */

import { z } from 'zod'

import { OpError, defineOp } from '@lib/registry'
import { composeBodyUpdate, applyBodyUpdate } from '@lib/model/ops/_set_body'
import { splitFrontmatterFences } from '@lib/util/frontmatter'

import {
  changedIntent,
  formatGaps,
  gapKey,
  intentLocked,
  replaceSection,
  taskBodyGaps,
  taskIntent,
} from '../body.ts'
import { readTaskDoc, readTextSource } from './_task_doc.ts'

const input = z.object({
  projectRoot: z.string(),
  /** Task-file path (absolute or project-relative) or bare basename. */
  task: z.string(),
  /** The section's heading text (`Approach`, `Acceptance criteria`); a known alias names the same section. */
  section: z.string().min(1),
  /** File holding the new section content (heading excluded). */
  from: z.string().optional(),
  /** The new section content itself; the CLI's `--text -` fills it from stdin. */
  text: z.string().optional(),
  /** Allow a change to Goal or Acceptance criteria on a task that is open/ready or later. */
  changeIntent: z.boolean().default(false),
  /** Write even when the edit introduces readiness gaps. */
  allowGaps: z.boolean().default(false),
})

const output = z.object({
  path: z.string(),
  section: z.string(),
  /** False when the section already held exactly this text, or on a dry run. */
  wrote: z.boolean(),
  /** Goal / Acceptance criteria changed (needs `--change-intent` on a locked task). */
  intent_changed: z.boolean(),
  /** Gaps the written body has, new or not. */
  gaps: z.array(
    z.object({ code: z.string(), section: z.string().nullable(), message: z.string() }),
  ),
})

export default defineOp({
  noun: 'task',
  verb: 'set-section',
  summary: 'Replace or add one `## Section` of a task body, validating the whole body afterwards.',
  mutating: true,
  input,
  output,
  cli: {
    positionals: ['task', 'section'],
    stdinKey: 'text',
    flags: {
      from: { valueName: 'path', help: 'File with the new section text.' },
      text: { valueName: 'text|-', help: 'The new section text; `-` reads stdin.' },
      changeIntent: {
        help: 'Allow changing Goal or Acceptance criteria on a task that is open/ready or later.',
      },
      allowGaps: { help: 'Write even when the edit introduces readiness gaps.' },
    },
    render: (out, io) => {
      io.stdout(`${out.path}\n`)
    },
  },
  handler: (args, ctx) => {
    const { path, text, fm } = readTaskDoc(args.projectRoot, args.task)
    const fences = splitFrontmatterFences(text)
    const before = fences === null ? text : fences.body
    if ((args.from === undefined) === (args.text === undefined)) {
      throw new OpError(
        'INVALID_INPUT',
        'pass the new section text with --from <path> or --text <text|->.',
      )
    }
    const content = args.text ?? readTextSource(args.from as string, '--from')
    if (content.trim() === '') {
      throw new OpError('INVALID_INPUT', 'the section text is empty')
    }
    const next = replaceSection(before, args.section, content)

    const changed = changedIntent(taskIntent(before), taskIntent(next))
    if (changed.length > 0 && intentLocked(fm?.['state']) && !args.changeIntent) {
      throw new OpError(
        'TASK_INTENT_LOCKED',
        `${path} is ${String(fm?.['state'])}: ${changed.join(' and ').replaceAll('_', ' ')} say what the task asks for ` +
          'and are locked once it is open/ready. Pass --change-intent to change them on purpose.',
        { state: fm?.['state'], changed },
      )
    }

    const known = new Set(taskBodyGaps(before).map(gapKey))
    const gaps = taskBodyGaps(next)
    const introduced = gaps.filter((g) => !known.has(gapKey(g)))
    if (introduced.length > 0 && !args.allowGaps) {
      throw new OpError(
        'TASK_BODY_GAPS',
        `the edit to "${args.section}" leaves the body with gaps (pass --allow-gaps to write anyway):\n${formatGaps(introduced)}`,
        { gaps: introduced },
      )
    }
    const inherited = gaps.filter((g) => known.has(gapKey(g)))
    if (inherited.length > 0) {
      ctx.io.stderr(
        `note: the body still has ${inherited.length} earlier gap(s):\n${formatGaps(inherited)}\n`,
      )
    }

    // Compose first so the body's frontmatter-framing refusal fires before any write.
    composeBodyUpdate({ text, body: next, path })
    const result = applyBodyUpdate({ path, text, body: next, dryRun: ctx.dryRun })
    return {
      path,
      section: args.section,
      wrote: result.wrote,
      intent_changed: changed.length > 0,
      gaps: gaps.map(({ code, section, message }) => ({ code, section, message })),
    }
  },
})
