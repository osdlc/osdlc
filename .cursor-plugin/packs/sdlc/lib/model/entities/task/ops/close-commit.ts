/**
 * `sdlc task close-commit` — land a task's CLOSING state on the target branch
 * (`--target`-less: `orchestrator.target_branch`, else `main`) via an
 * ephemeral worktree off `origin/<target>`, never touching the shared checkout.
 *
 * Mutating the shared primary checkout directly is unsafe under parallel
 * `/sdlc:*` sessions
 * ([[B-P502-commit-task-state-and-planning-docs-via-ephemeral-worktrees]]).
 *
 * This op applies the `prs:` fold + the `## Post-mortem` stub + the closing
 * frontmatter inside a throwaway worktree off `origin/<target>` and pushes
 * `HEAD:<target>`, via the shared `commitToMainViaWorktree` isolation primitive
 * ([[D-WK7T-agent-git-writes-worktree-isolated]]) — the close mutation is the
 * `mutate` callback; the helper owns the worktree lifecycle + push-retry.
 *
 * The close commit is where a task's execution state becomes history:
 *
 * - `prs:` is written ONCE, here ([[T-IVEJ-prs-once-at-close]]). `--pr-url` is
 *   repeatable — pass every PR the task produced and the ordered list lands in
 *   this one commit. In flight the live PR binding is the lease's `pr_number`,
 *   not this field.
 * - the `## Post-mortem` stub is planted here when the body carries none
 *   ([[T-5LP4]]).
 *
 * - the task's lease is released once the close lands, so a merged task never
 *   keeps an `awaiting-review` lease that only `--force` could remove
 *   ([[T-VXQ9]]). Best-effort: no lease or no authority configured is not an
 *   error, and the skill's own `lease task archive` step stays idempotent.
 *
 * Hidden plumbing ([[D-H7FS-op-substrate-surface]] §2): absent from default
 * `--help`, revealed by `--advanced`. Driven by the task-close-out skill.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { z } from 'zod'

import { defineOp, OpError, type OpIo } from '@lib/registry'
import { applyFrontmatterUpdates, readInstanceDoc } from '@lib/model/ops/_update'
import { entityFromDir, type Entity } from '@lib/model/entity'
import { pluginLibDir } from '@lib/util/plugin-root'
import { renderTaskLifecycleCommit } from '@lib/model/entities/task/commits/lifecycle/schema'
import { resolveAuthority } from '@lib/config'
import { LeaseError, releaseToArchive } from '@lib/services/lease'
import { stateBranch } from '@lib/services/orchestrator/target-branch'
import { closePanesForCloseOut } from '@lib/services/session/close'
import { CommitToMainError, commitToMainViaWorktree } from '@lib/services/git/commit-to-main'
import { DATE_PATTERN } from '@lib/model/entities/_common'
import { appendPostMortemStub } from '../post-mortem.ts'
import { computeAppendMany, readPrsFrontmatter, writePrsFrontmatter } from '../prs.ts'

let taskEntity: Entity | null = null
function getTaskEntity(): Entity {
  taskEntity ??= entityFromDir(join(pluginLibDir(), 'model', 'entities', 'task'))
  return taskEntity
}

/** Archive the closed task's lease; a failure only warns, the close already landed. */
function releaseLease(projectRoot: string, basename: string, warn: (line: string) => void): void {
  const authority = resolveAuthority(null, projectRoot)
  if (!authority) return
  try {
    releaseToArchive(basename, {
      cwd: projectRoot,
      authority,
      projectRoot,
      actor: 'op:task close-commit',
      reason: 'close-out',
    })
  } catch (e) {
    if (!(e instanceof LeaseError)) throw e
    warn(`warning: could not release the lease of ${basename}: ${e.message}\n`)
  }
}

const input = z.object({
  projectRoot: z.string(),
  basename: z.string().min(1).describe('Task file basename without `.md`.'),
  completionNote: z
    .string()
    .min(1)
    .describe("completion_note frontmatter value (e.g. 'Shipped via #42.')."),
  today: z.string().regex(DATE_PATTERN).describe('last_reviewed value, ISO date (UTC).'),
  prUrl: z
    .array(z.string().url())
    .default([])
    .describe(
      'PR URL to verify/append into prs: (repeatable; order preserved, ' +
        'idempotent against URLs already listed). Omit to touch nothing.',
    ),
  detail: z.string().optional().describe('Commit body detail; defaults to completionNote.'),
})

const output = z.object({
  taskPath: z.string(),
  /** The pushed commit SHA, or null under --dry-run / when nothing was pushed. */
  pushedSha: z.string().nullable(),
  /** prs: outcome, aggregated over every `--pr-url`: `create` when the field
   *  was absent and at least one URL landed, `append` when it existed and at
   *  least one landed, `noop` when every URL was already present. */
  prsAction: z.enum(['noop', 'create', 'append']),
  /** Final length of prs: after the fold — the historical record's size. */
  prsCount: z.number().int().nonnegative(),
  /** The prs: addendum lines for the commit body (one per landed URL), or null
   *  on noop. */
  prsAddendum: z.string().nullable(),
  /** True when the body carried no `## Post-mortem` H2 and the close planted
   *  the stub ([[T-5LP4]]: the stub moved from start to close). */
  postMortemStubbed: z.boolean(),
  dryRun: z.boolean(),
  /** Under --dry-run: the unified diff of the closing task-file mutation. */
  diff: z.string().nullable(),
})

type Output = z.infer<typeof output>

function render(out: Output, io: OpIo): number {
  // `prs=` is the aggregate action; `prs_count=` is the final list length, so
  // a multi-URL close reports how much history landed, not just that it did.
  const prs = `prs=${out.prsAction} prs_count=${out.prsCount}`
  if (out.dryRun) {
    if (out.diff) io.stdout(`${out.diff}\n`)
    io.stderr(`CLOSE-COMMIT dry-run ${prs} (no commit, no push)\n`)
    return 0
  }
  io.stderr(`CLOSE-COMMIT pushed=${out.pushedSha?.slice(0, 12) ?? '?'} ${prs}\n`)
  return 0
}

export default defineOp({
  noun: 'task',
  verb: 'close-commit',
  summary:
    "Commit a task's closing state to the target branch (default main) via an ephemeral worktree off origin/<target> (no shared-checkout contamination).",
  hidden: true,
  input,
  output,
  cli: {
    positionals: ['basename'],
    flags: {
      completionNote: { valueName: 'text', help: 'completion_note value.' },
      today: { valueName: 'date', help: 'last_reviewed ISO date (UTC).' },
      prUrl: {
        valueName: 'url',
        repeatable: true,
        help: 'PR URL for prs: (repeatable — pass every PR the task produced, in order).',
      },
      detail: { valueName: 'text', help: 'Commit body detail.' },
    },
    render,
  },
  handler: async (args, ctx): Promise<Output> => {
    // Captured from the (idempotent, re-runnable) mutate callback below.
    let prsAction: 'noop' | 'create' | 'append' = 'noop'
    let prsCount = 0
    let prsAddendum: string | null = null
    let postMortemStubbed = false

    let result
    try {
      result = await commitToMainViaWorktree({
        projectRoot: args.projectRoot,
        git: ctx.git,
        label: args.basename,
        branch: stateBranch(ctx),
        dryRun: ctx.dryRun,
        mutate: (wt) => {
          const { path: wtTaskPath } = readInstanceDoc('task', wt, args.basename)
          const taskRel = relative(wt, wtTaskPath)

          // 1) prs: the whole ordered PR history, folded in one write
          // ([[T-IVEJ-prs-once-at-close]]). Idempotent per URL — a URL already
          // listed lands nothing — so a re-run (or the helper's push-race
          // re-apply) changes no bytes. The read is unconditional so the
          // marker's `prs_count=` reports the final list length even when no
          // `--pr-url` was passed.
          const readPrs = readPrsFrontmatter(wtTaskPath)
          const append = computeAppendMany(readPrs.prs, args.prUrl)
          prsAction = append.action
          prsCount = append.newList.length
          prsAddendum = append.addendum
          if (append.action !== 'noop') {
            writePrsFrontmatter(wtTaskPath, readPrs.text, append.newList)
          }

          // 2) `## Post-mortem` anchor. The close commit plants the stub
          // ([[T-5LP4]]) so the close-out post-mortem flow always has its
          // section. No-op when the body already carries the H2.
          const stubbed = appendPostMortemStub(readFileSync(wtTaskPath, 'utf-8'), args.today)
          postMortemStubbed = stubbed !== null
          if (stubbed !== null) {
            writeFileSync(wtTaskPath, stubbed, 'utf-8')
          }

          // 3) Closing frontmatter. Force the write (dryRun:false) — the
          // worktree is throwaway; the op's --dry-run gates commit/push inside
          // the helper.
          applyFrontmatterUpdates({
            entity: getTaskEntity(),
            path: wtTaskPath,
            text: readFileSync(wtTaskPath, 'utf-8'),
            updates: {
              state: 'closed/done',
              last_reviewed: args.today,
              completion_note: args.completionNote,
              relevance_note: null,
              readiness_verified_at: null,
            },
            ctx: { ...ctx, dryRun: false },
          })

          const detailBase = args.detail ?? args.completionNote
          const paragraphs = [detailBase]
          if (prsAddendum != null) paragraphs.push(prsAddendum)
          if (postMortemStubbed) {
            paragraphs.push('Planted the `## Post-mortem` stub (the body carried none).')
          }
          const detail = paragraphs.join('\n\n')
          const msg = renderTaskLifecycleCommit({
            action: 'close-done',
            basename: args.basename,
            detail,
          })
          return { stagePaths: [taskRel], message: msg.message }
        },
      })
    } catch (e) {
      if (e instanceof CommitToMainError) {
        throw new OpError('SERVICE_ERROR', e.message)
      }
      throw e
    }

    if (!result.dryRun) releaseLease(args.projectRoot, args.basename, ctx.io.stderr)
    // The worktree is torn down after this op (the task-close-out skill removes the worktree), so the panes of
    // the task branch's sessions close now. Not under --dry-run; best effort.
    if (!ctx.dryRun) {
      closePanesForCloseOut({
        projectRoot: args.projectRoot,
        basename: args.basename,
        config: ctx.sdlcConfig,
      })
    }

    return {
      taskPath: join(result.mainCheckout, 'docs', 'planning', 'tasks', `${args.basename}.md`),
      pushedSha: result.pushedSha,
      prsAction,
      prsCount,
      prsAddendum,
      postMortemStubbed,
      dryRun: result.dryRun,
      diff: result.diff,
    }
  },
})
