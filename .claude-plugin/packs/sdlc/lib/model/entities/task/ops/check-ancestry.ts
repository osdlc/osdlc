/**
 * `sdlc task check-ancestry` — classify a `/sdlc:task-work` feature branch's
 * ancestry against `--base-ref` (default `origin/<target>`: `orchestrator.target_branch`,
 * else `origin/main`; [[T-NB98]]) for contamination from parallel task-work
 * sessions OR a stale base.
 *
 * Ported off `bun run ${CLAUDE_PLUGIN_ROOT}/skills/task-work/check_ancestry.ts`
 * ([[T-VAW3]] AC-2: a skill script invoked by file path resolves its
 * `@osdlc/cli-tool` / `@osdlc/typed-git` imports by accident of the
 * in-repo `node_modules`, which is absent from a plugin copied outside this
 * monorepo — no `bun install` ever runs there). CLI parsing, stdout/stderr
 * shape and exit codes are unchanged from the retired script — only the
 * entry point moved onto the op substrate (`CliHints.rawArgv`, see
 * `lib/registry.ts`), the same way `preflight-permissions.ts` and
 * `dedup-search.ts` moved.
 *
 * Stdout verdicts:
 *   - `clean`
 *   - `contaminated: [<basename-1>, <basename-2>, ...] last_sha=<sha>`
 *   - `stale-base: <N> upstream-drift files; rebase onto <base-ref>`
 * and the exit codes (0 classification produced, 1 precondition failed,
 * 2 the command was typed wrong).
 *
 * Two distinct ways a `task/*` branch's diff against `origin/main` ends
 * up carrying files the task doesn't own:
 *
 * 1. **Parallel-task contamination** — multiple `/sdlc:task-work` runs
 *    land `chore(tasks): start <other-basename>` commits on local `main`;
 *    a feature branch created against that contaminated tip carries those
 *    foreign start-commits as its own ancestors. Detected by walking
 *    `origin/main..HEAD` for foreign start-commit subjects → `contaminated`.
 * 2. **Stale-base drift** — local `main` was fast-forwarded by an
 *    externally-merged PR after the branch was cut, so files restructured
 *    on `origin/main` (a flat doc moved into a folder, a script renamed)
 *    show up in `git diff origin/main HEAD` even though this branch never
 *    touched them. The parallel-task walk reports `clean` (no foreign
 *    start-commits), but pushing as-is couples the PR to those upstream
 *    changes. Detected by the diff-scope check below → `stale-base`.
 *
 * The stale-base check keys on the difference between the two-dot and
 * three-dot diffs against `origin/main`:
 *   - `git diff origin/main HEAD --name-only` (two-dot) lists every file
 *     that differs between the two tips, INCLUDING upstream restructures
 *     the branch hasn't absorbed.
 *   - `git diff origin/main...HEAD --name-only` (three-dot, merge-base)
 *     lists only what this branch changed since it forked.
 * Files in the two-dot set but NOT the three-dot set are upstream drift:
 * the branch carries them solely because its base is stale. When that set
 * is non-empty the verdict is `stale-base`; Step 9 then rebases onto
 * `origin/main` to drop them. On an up-to-date base the two sets are
 * identical and the drift set is empty → `clean`.
 *
 * Precedence: `contaminated` (foreign start-commits — the more specific,
 * `git rebase --onto`-actionable signal) wins over `stale-base`, which
 * wins over `clean`.
 *
 * Usage renders from the flag declaration below; `--help` prints it.
 */

import { z } from 'zod'

import { defineCli, EXIT, type CliContext } from '@osdlc/cli-tool'
import { CommandFailed, Git } from '@osdlc/typed-git'

import { defineOp, type OpCtx } from '@lib/registry'
import { legacyCliContext } from '@lib/util/legacy-cli.ts'
import { stateBranch } from '@lib/services/orchestrator/target-branch'

const START_COMMIT_SUBJECT_RE = /^chore\(tasks\): start ([\w\-./]+)\s*$/

/** The client for one classification run. Every call throws on git failure. */
function gitAt(cwd: string | null): Git {
  // `main` always passes `ctx.cwd`; the fallback is for the two exported
  // helpers, which a caller may use without naming a repository.
  return new Git(cwd ?? process.cwd())
}

/**
 * The changed paths of one diff range, as a set. `range` is the range as
 * argv tokens: the two-dot form is two refs (`[baseRef, "HEAD"]`); the
 * three-dot form is a single token (`["<baseRef>...HEAD"]`).
 *
 * A bad ref or a non-repo cwd throws `CommandFailed` — `main()` turns that
 * into the exit-1 precondition failure. Folding it into an empty set would
 * report a branch we never diffed as drift-free.
 */
function diffNames(git: Git, range: string[]): Set<string> {
  return new Set(git.diffNameOnly({ rangeArgs: range }))
}

/**
 * Compute the upstream-drift file set: files present in the two-dot diff
 * (`<baseRef> HEAD`) but absent from the three-dot diff (`<baseRef>...HEAD`),
 * i.e. carried solely because the base is stale. Sorted for determinism.
 */
export function upstreamDrift(baseRef = 'origin/main', cwd: string | null = null): string[] {
  return driftFrom(gitAt(cwd), baseRef)
}

/** {@link upstreamDrift} against an already-built client. */
function driftFrom(git: Git, baseRef: string): string[] {
  const twoDot = diffNames(git, [baseRef, 'HEAD'])
  const threeDot = diffNames(git, [`${baseRef}...HEAD`])
  const drift: string[] = []
  for (const path of twoDot) {
    if (!threeDot.has(path)) {
      drift.push(path)
    }
  }
  drift.sort()
  return drift
}

export interface ClassifyResult {
  verdict: 'clean' | 'contaminated' | 'stale-base'
  contaminants: Array<[sha: string, basename: string]>
  driftFiles: string[]
}

/**
 * Classify the current branch's ancestry against `baseRef`.
 *
 * Returns `{ verdict, contaminants, driftFiles }`:
 *   - `contaminants` is a list of `[sha, basename]` pairs for each foreign
 *     start-commit found, in `git log --reverse` order (oldest first).
 *     Empty unless verdict is "contaminated".
 *   - `driftFiles` is the sorted list of upstream-drift paths. Empty
 *     unless verdict is "stale-base".
 */
export function classify(
  thisBasename: string,
  baseRef = 'origin/main',
  cwd: string | null = null,
): ClassifyResult {
  const git = gitAt(cwd)

  // `--reverse` so the LAST item in our list is the most recent
  // contaminating commit, matching Step 9's "last contaminating sha"
  // terminology and the value `git rebase --onto` wants.
  const logOutput = git.logLines({
    range: `${baseRef}..HEAD`,
    format: '%H%x09%s',
    reverse: true,
  })

  const contaminants: Array<[string, string]> = []
  for (const line of logOutput) {
    if (line.trim() === '') {
      continue
    }
    const tabIdx = line.indexOf('\t')
    const sha = tabIdx === -1 ? line : line.slice(0, tabIdx)
    const subject = tabIdx === -1 ? '' : line.slice(tabIdx + 1)
    const match = START_COMMIT_SUBJECT_RE.exec(subject)
    if (match === null) {
      // Not a start-commit at all — verify-commit, work commit,
      // post-mortem commit, etc. Always owned by this branch.
      continue
    }
    const foundBasename = match[1]!
    if (foundBasename === thisBasename) {
      // Our own start-commit; expected.
      continue
    }
    contaminants.push([sha, foundBasename])
  }

  if (contaminants.length > 0) {
    // Parallel-task contamination is the more specific signal — report
    // it first. The diff-scope check is skipped: the rebase that drops
    // the foreign start-commits also re-roots onto origin/main, which
    // clears any stale-base drift in the same operation.
    return { verdict: 'contaminated', contaminants, driftFiles: [] }
  }

  const driftFiles = driftFrom(git, baseRef)
  if (driftFiles.length > 0) {
    return { verdict: 'stale-base', contaminants: [], driftFiles }
  }

  return { verdict: 'clean', contaminants: [], driftFiles: [] }
}

export function formatVerdict(result: ClassifyResult, baseRef = 'origin/main'): string {
  switch (result.verdict) {
    case 'clean':
      return 'clean'
    case 'contaminated': {
      const basenames = result.contaminants.map(([, b]) => b)
      const lastSha = result.contaminants[result.contaminants.length - 1]![0]
      const rendered = basenames.join(', ')
      return `contaminated: [${rendered}] last_sha=${lastSha}`
    }
    case 'stale-base': {
      const n = result.driftFiles.length
      const noun = n === 1 ? 'file' : 'files'
      return `stale-base: ${n} upstream-drift ${noun}; rebase onto ${baseRef}`
    }
  }
}

const cli = defineCli({
  name: 'sdlc task check-ancestry',
  summary: "Classify a feature branch's ancestry against origin/<target> (default origin/main).",
  flags: {
    thisBasename: {
      kind: 'string',
      valueName: 'basename',
      required: true,
      help: 'The task basename this branch owns; every other start-commit is foreign.',
    },
    baseRef: {
      kind: 'string',
      valueName: 'ref',
      help: 'The upstream tip to classify against. Default: origin/<target branch>.',
    },
    cwd: {
      kind: 'string',
      valueName: 'path',
      help: 'Repository to inspect. Default: the working directory.',
    },
  },
})

export function main(argv: readonly string[], ctx: CliContext, defaultTarget = 'main'): number {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    ctx.io.stderr(`error: ${parsed.message}\n`)
    return EXIT.usage
  }
  const { thisBasename, baseRef, cwd } = parsed.values

  const base = baseRef ?? `origin/${defaultTarget}`
  let result: ClassifyResult
  try {
    result = classify(thisBasename, base, cwd ?? ctx.cwd)
  } catch (exc) {
    if (exc instanceof CommandFailed) {
      ctx.io.stderr(`error: git invocation failed: ${exc.detail || exc.message}\n`)
      return EXIT.error
    }
    throw exc
  }

  ctx.io.stdout(formatVerdict(result, base) + '\n')
  return EXIT.ok
}

// ---------------------------------------------------------------------------
// Op definition — CliHints.rawArgv (see lib/registry.ts): this op's whole CLI
// surface (flags, error text, exit codes) is `main`, above, unchanged from the
// retired standalone script. No `needs` are declared: the retired script
// never went through the op dispatcher's `preflight()` check either.
// ---------------------------------------------------------------------------

const input = z.object({ argv: z.array(z.string()) })
const output = z.object({ exitCode: z.number().int() })

export default defineOp({
  path: ['task', 'check-ancestry'],
  summary: "Classify a feature branch's ancestry against origin/<target> (default origin/main).",
  hidden: true,
  input,
  output,
  cli: { rawArgv: true },
  handler: ({ argv }, ctx: OpCtx) => ({
    exitCode: main(argv, legacyCliContext(ctx), stateBranch(ctx)),
  }),
})
