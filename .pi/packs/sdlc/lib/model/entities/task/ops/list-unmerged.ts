/**
 * `sdlc task list-unmerged` — task files that exist on an open PR's head ref
 * but NOT yet on the base branch.
 *
 * Why this exists: task ids are minted deterministically from the slug
 * (`mintBase36(seed = slug)` in `lib/model/identifier.ts`), and both the
 * collision guard (`takenIdChars`) and the spawn-time dedup search
 * (`sdlc task dedup-search`) look at ONE on-disk directory. A task
 * that lives only on an unmerged PR branch is therefore invisible to both.
 * Two post-mortems describing the same friction derive the same slug, mint the
 * same id, and land the same filename on two different PRs — which git surfaces
 * as a conflict at merge time rather than a warning at spawn time.
 *
 * This op is the missing read: it enumerates the unmerged task corpus so a
 * caller can fold it into a dedup pass. It keeps git/gh HERE rather than in
 * `dedup-search.ts`, per the "deterministic ops as CLI verbs" rule — the
 * scoring op stays a pure function of the rows it is handed.
 *
 * Each row carries the full file `text`, because the dedup scorer scores the
 * body, not just the headline.
 *
 * Refs are read from the REMOTE tracking ref (`<remote>/<headRefName>`). A head
 * ref with no local tracking copy is not silently dropped — it lands in
 * `skipped_refs` so a stale fetch is visible rather than looking like "no
 * duplicates". Run `git fetch <remote>` first for a complete answer.
 */

import { z } from 'zod'

import { Gh, PR_REF_FIELDS } from '@osdlc/typed-gh'
import { Git } from '@osdlc/typed-git'

import { defineOp } from '@lib/registry'
import type { OpCtx, OpIo } from '@lib/registry'
import { parseFrontmatter, splitFrontmatter } from '@lib/util/frontmatter'
import { realResolve } from '@lib/util/paths'

// ── constants ─────────────────────────────────────────────────────────────────

const TASKS_DIR_REL = 'docs/planning/tasks'
const DEFAULT_PR_LIMIT = 200

// ── helpers ───────────────────────────────────────────────────────────────────

interface OpenPr {
  number: number
  headRefName: string
  url: string
}

/** Open PRs against the repo, or null when gh is unavailable/failed. */
function listOpenPrs(projectRoot: string, ctx: OpCtx, limit: number): OpenPr[] | null {
  const rows = new Gh(projectRoot, { runner: ctx.gh }).prList({
    fields: PR_REF_FIELDS,
    limit,
  })
  if (rows === null) return null
  return rows.rows
    .filter((r) => r.headRefName !== '')
    .map((r) => ({ number: r.number, headRefName: r.headRefName, url: r.url }))
}

/**
 * `<TASKS_DIR_REL>/*.md` paths present at `rev`, as a set. Empty when the rev
 * does not resolve.
 *
 * `soft`, not the default door: this op degrades to a partial answer rather
 * than failing a dedup pass. An unfetched `<remote>/<base>` is the common
 * case, and it is already visible to the caller — a missing baseline makes
 * every candidate report as unmerged, and every unresolvable head ref lands in
 * `skipped_refs`.
 */
function taskPathsAtRev(git: Git, rev: string): Set<string> {
  const entries = git.soft.lsTree(rev, { recursive: true, paths: [TASKS_DIR_REL + '/'] })
  return new Set(entries.map((e) => e.path).filter((p) => p.endsWith('.md')))
}

/** The first `# ` heading in a task body, or "" when absent. */
function extractHeadline(body: string): string {
  for (const line of body.split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line)
    if (m) return m[1]!
  }
  return ''
}

/** A string frontmatter field, or null. `fm` is the parsed map. */
function fmString(fm: Record<string, unknown> | null, key: string): string | null {
  if (fm === null) return null
  const v = fm[key]
  return typeof v === 'string' ? v : null
}

// ── schema ────────────────────────────────────────────────────────────────────

const UnmergedTask = z.object({
  basename: z.string(),
  path: z.string(),
  pr_number: z.number().int(),
  pr_url: z.string(),
  head_ref: z.string(),
  state: z.string().nullable(),
  headline: z.string(),
  text: z.string(),
})

const input = z.object({
  noGh: z.boolean().default(false),
  remote: z.string().default('origin'),
  base: z.string().default('main'),
  limit: z.number().int().positive().default(DEFAULT_PR_LIMIT),
  withText: z.boolean().default(true),
})

const output = z.object({
  base: z.string(),
  remote: z.string(),
  gh_available: z.boolean(),
  prs_scanned: z.number().int(),
  skipped_refs: z.array(z.string()),
  tasks: z.array(UnmergedTask),
})

type Output = z.infer<typeof output>

// ── render hook ───────────────────────────────────────────────────────────────

function renderListUnmerged(out: Output, io: OpIo): number {
  if (!out.gh_available) {
    io.stdout('unmerged-tasks=unknown (gh unavailable)\n')
    return 0
  }
  for (const t of out.tasks) {
    io.stdout(`${t.basename}\t#${t.pr_number}\t${t.state ?? 'unknown'}\t${t.headline}\n`)
  }
  io.stdout(
    `unmerged-tasks=${out.tasks.length} prs-scanned=${out.prs_scanned}` +
      ` skipped-refs=${out.skipped_refs.length ? out.skipped_refs.join(',') : 'none'}\n`,
  )
  return 0
}

// ── op definition ─────────────────────────────────────────────────────────────

export default defineOp({
  path: ['task', 'list-unmerged'],
  summary: 'Task files present on an open PR head ref but not on the base branch.',
  // Read-only: queries `gh pr list` and reads git refs/blobs; writes nothing.
  mutating: false,
  input,
  output,
  cli: {
    flags: {
      noGh: { help: 'Skip gh queries (hermetic/offline mode); reports gh_available=false.' },
      remote: { help: 'Remote whose tracking refs are read (default: origin).' },
      base: { help: 'Base branch a task must be ABSENT from to count (default: main).' },
      limit: { help: 'Max open PRs to scan (default: 200).' },
      withText: { help: 'Include full file text on each row (default: true).' },
    },
    render: renderListUnmerged,
  },
  handler: (args, ctx) => {
    const projectRoot = realResolve(ctx.projectRoot)
    const git = new Git(projectRoot, { runner: ctx.git })

    const empty: Output = {
      base: args.base,
      remote: args.remote,
      gh_available: false,
      prs_scanned: 0,
      skipped_refs: [],
      tasks: [],
    }
    if (args.noGh) return empty

    const prs = listOpenPrs(projectRoot, ctx, args.limit)
    if (prs === null) return empty

    // The baseline corpus: whatever is already on the base branch does not
    // count as unmerged, no matter how many PRs also carry it.
    const baseRef = `${args.remote}/${args.base}`
    const baseline = taskPathsAtRev(git, baseRef)

    const tasks: z.infer<typeof UnmergedTask>[] = []
    const skipped: string[] = []
    const seen = new Set<string>()

    for (const pr of prs) {
      const ref = `${args.remote}/${pr.headRefName}`
      if (!git.objectExists(ref)) {
        skipped.push(pr.headRefName)
        continue
      }
      for (const path of taskPathsAtRev(git, ref)) {
        if (baseline.has(path)) continue
        // First PR to carry a path wins; a second one carrying the SAME path is
        // precisely the duplicate this op exists to expose, and the caller sees
        // it as one row whose pr_number names the earliest claimant.
        if (seen.has(path)) continue
        seen.add(path)

        const text = git.showAtRev(ref, path)
        if (text === null) continue
        const [, body] = splitFrontmatter(text)
        const basename = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
        tasks.push({
          basename,
          path,
          pr_number: pr.number,
          pr_url: pr.url,
          head_ref: pr.headRefName,
          state: fmString(parseFrontmatter(text), 'state'),
          headline: extractHeadline(body),
          text: args.withText ? text : '',
        })
      }
    }

    tasks.sort((a, b) => (a.basename < b.basename ? -1 : a.basename > b.basename ? 1 : 0))
    skipped.sort()

    return {
      base: args.base,
      remote: args.remote,
      gh_available: true,
      prs_scanned: prs.length,
      skipped_refs: skipped,
      tasks,
    }
  },
})

export { extractHeadline, taskPathsAtRev }
