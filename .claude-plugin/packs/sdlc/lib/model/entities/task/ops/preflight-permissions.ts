/**
 * `sdlc task preflight-permissions` — pre-flight permission probe for
 * `/sdlc:task-work` Step 3b.
 *
 * Ported off `bun run ${CLAUDE_PLUGIN_ROOT}/skills/task-work/preflight_permissions.ts`
 * ([[T-VAW3]] AC-2: a skill script invoked by file path resolves its
 * `@lib/*` imports by accident of the in-repo layout, which breaks once the
 * built plugin is copied outside this monorepo). The entry point moved onto the
 * op substrate (`CliHints.rawArgv`, see `lib/registry.ts`). The unreadable-task-file
 * case below reads through `readTask`, which collapses any read failure (not just
 * ENOENT) to "absent" and so drops the retired script's caught-exception detail from
 * that one stderr line (see the comment there).
 *
 * Package-manager permissions use a TWO-TIER model:
 *
 *   - Tier 1 (HARD gaps, exit 1). Deterministic, project-grounded
 *     resolution: `resolveProjectManagers` inspects the repo root's
 *     lockfiles / ecosystem markers and the verbs `resolveWorkflowCommands`
 *     resolves for `check` and `setup`
 *     ([[D-LSLH-collapse-verbs-workflows-chain-hooks]]), and
 *     returns the FULL SET of package managers in play (a polyglot
 *     bun+cargo repo resolves BOTH). For each resolved manager whose
 *     `Bash(<pm>:*)` permission is not granted, a hard
 *     `<pm>: missing Bash(<pm>:*)` gap is reported on stdout.
 *   - Tier 2 (advisory WARNINGS, never exit 1). The body-text
 *     `SIGNAL_TABLE` / `detectSignals` substring scan is a fuzzy signal:
 *     a package-manager family it fires that is NOT in the resolved set
 *     produces, at most, a `warning:` line on stderr. Warnings never
 *     affect the exit code.
 *
 * Non-package-manager families (`node`, `npx`, `pytest`) keep their
 * body-text-driven hard-gap behavior, pending
 * [[T-NUML-task-work-preflight-permissions-probe-extension-for-skill-internal-scripts]].
 *
 * It ALSO probes the two file-mutation tools the implementer always
 * needs — `Write` and `Edit` — against the worktree path Step 4 will
 * create (`<repo-root>/.sdlc/worktrees/<task-basename>/`). When either
 * tool is not granted for that path (absent from `allow`, or matched by
 * `deny`, and `defaultMode` is not a blanket-allow mode), the gap is
 * reported in the shape `<tool>: missing <tool>(<worktree-glob>)`, so a
 * file-mutation denial surfaces before the worktree exists rather than
 * mid-implementation (where the implementer would fall back to a Bash
 * heredoc).
 *
 * The rules come from `@osdlc/detect-harness`, which reads Claude Code's
 * settings files: the user's, the task repo root's `.claude/settings.json` and
 * `.claude/settings.local.json`, and the managed settings. Rules of every scope
 * add up, and `deny` beats `allow`. The same read supplies `defaultMode`:
 * `acceptEdits` and `bypassPermissions` are a blanket allow for `Write`/`Edit`,
 * so no gap is reported regardless of explicit allow/deny rules.
 *
 * Output:
 * - Exit 0: no hard gaps. Advisory `warning:` lines (if any) go to
 *   stderr; no stdout.
 * - Exit 1: one or more hard gaps surfaced. One line per gap on stdout,
 *   each in the shape `<tool-family>: missing Bash(<verb>:*)` (Bash
 *   signals) or `<tool>: missing <tool>(<worktree-glob>)` (Write/Edit
 *   coverage). Advisory `warning:` lines (if any) still go to stderr.
 * - Exit 1 also covers a missing or unreadable task file; the `error:` line
 *   on stderr tells the two apart.
 */

import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { detect } from '@osdlc/detect-harness'
import { z } from 'zod'

import { defineCli, EXIT, type CliContext, type CliIo } from '@osdlc/cli-tool'
import { resolveWorkflowCommands } from '@lib/config/workflows'
import { resolveProjectManagers } from '@osdlc/detect-runners'
import { checkoutRoot } from '@osdlc/typed-git'
import { isFile } from '@lib/util/fs'
import { worktreeDirFor } from '@lib/util/git'
import { escapeRegExp } from '@lib/util/strings'
import { defineOp, type OpCtx } from '@lib/registry'

import { legacyCliContext } from '@lib/util/legacy-cli.ts'
import type { MachineSeams } from '@lib/util/machine-seams.ts'
import { readTask } from '../read.ts'

// --- Signal table -----------------------------------------------------------

interface SignalEntry {
  family: string
  verb: string
  hints: string[]
}

export const SIGNAL_TABLE: SignalEntry[] = [
  {
    family: 'npm',
    verb: 'npm',
    hints: ['npm ', 'npm install', 'npm run', 'npm --prefix', '`npm`'],
  },
  {
    family: 'node',
    verb: 'node',
    hints: ['node ', '`node`', 'node script', 'node --'],
  },
  {
    family: 'pnpm',
    verb: 'pnpm',
    hints: ['pnpm ', 'pnpm install', 'pnpm run', '`pnpm`'],
  },
  {
    family: 'yarn',
    verb: 'yarn',
    hints: ['yarn ', 'yarn add', 'yarn install', '`yarn`'],
  },
  {
    family: 'npx',
    verb: 'npx',
    hints: ['npx ', '`npx`'],
  },
  {
    family: 'uv',
    verb: 'uv',
    hints: ['uv run', 'uv pip', 'uv add', 'uv sync', '`uv`'],
  },
  {
    family: 'cargo',
    verb: 'cargo',
    hints: ['cargo ', 'cargo build', 'cargo test', 'cargo run', '`cargo`'],
  },
  {
    family: 'pytest',
    verb: 'pytest',
    hints: ['pytest', '`pytest`'],
  },
]

/**
 * The package-manager / build-verb families under the two-tier model:
 * their HARD gaps come ONLY from the project-grounded resolver
 * ({@link resolveProjectManagers}), and a body-text mention NOT in the
 * resolved set is demoted to an advisory warning.
 */
export const PM_FAMILIES = new Set(['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'uv', 'pip', 'go'])

// --- Permission resolution ---------------------------------------------------

/** Claude Code's `defaultMode` values that blanket-approve file mutation. */
const BLANKET_EDIT_MODES = new Set(['acceptEdits', 'bypassPermissions'])

export class ResolvedPermissions {
  readonly allow: ReadonlySet<string>
  readonly deny: ReadonlySet<string>
  readonly defaultMode: string | null

  constructor(
    allow: ReadonlySet<string>,
    deny: ReadonlySet<string>,
    defaultMode: string | null = null,
  ) {
    this.allow = allow
    this.deny = deny
    this.defaultMode = defaultMode
  }

  /**
   * True iff the verb is allowed and its whole family is not denied.
   * `deny` entries beat `allow`, but only a family-wide deny counts here —
   * see {@link deniesVerbFamily}.
   */
  allowsVerb(verb: string): boolean {
    if (deniesVerbFamily(this.deny, verb)) {
      return false
    }
    return matchesVerb(this.allow, verb)
  }

  /**
   * True iff a file-mutation `tool` (`Write` / `Edit`) is granted for
   * `targetPath` (an absolute path). The resolution order mirrors
   * Claude Code's:
   *
   *   1. `defaultMode: acceptEdits | bypassPermissions` is a blanket allow.
   *   2. Otherwise a `<tool>(...)` deny rule matching `targetPath` beats
   *      everything (`deny` always wins over `allow`).
   *   3. Otherwise the tool is allowed iff a `<tool>` allow rule covers
   *      `targetPath`: the bare-tool form (`"Edit"` / `"Write"`, no
   *      parens) covers all paths, and the path-scoped form
   *      (`Edit(<spec>)`) covers `targetPath` when its glob matches.
   */
  allowsTool(tool: string, targetPath: string): boolean {
    if (this.defaultMode !== null && BLANKET_EDIT_MODES.has(this.defaultMode)) {
      return true
    }
    if (matchesTool(this.deny, tool, targetPath)) {
      return false
    }
    return matchesTool(this.allow, tool, targetPath)
  }
}

const VERB_PATTERN_CACHE = new Map<string, RegExp>()

function matchesVerb(entries: ReadonlySet<string>, verb: string): boolean {
  let pat = VERB_PATTERN_CACHE.get(verb)
  if (pat === undefined) {
    // Match Bash(<verb>...) with the verb at the start of the inner
    // command. Anchored with a non-word-character boundary after the
    // verb so `Bash(npmrc:*)` does not match the `npm` family.
    pat = new RegExp(`^Bash\\(\\s*${escapeRegExp(verb)}(?=[\\s:)\\-]|$)`, 'i')
    VERB_PATTERN_CACHE.set(verb, pat)
  }
  for (const e of entries) {
    if (e.trim().toLowerCase() === 'bash') return true // bare Bash: all verbs
    if (pat.test(e)) return true
  }
  return false
}

/**
 * True iff some entry in `entries` denies the WHOLE verb family.
 *
 * Only the bare `Bash`, `Bash(<verb>)` and `Bash(<verb>:*)` forms qualify.
 * The allow-side prefix match is wrong here: it reads
 * `deny: ["Bash(npm publish:*)"]` — one forbidden sub-command — as
 * cancelling `allow: ["Bash(npm:*)"]`, and preflight then reports a hard
 * permission gap that halts task-work.
 */
function deniesVerbFamily(entries: ReadonlySet<string>, verb: string): boolean {
  const low = verb.trim().toLowerCase()
  for (const e of entries) {
    const entry = e.trim().toLowerCase()
    if (entry === 'bash') return true
    if (entry === `bash(${low})` || entry === `bash(${low}:*)`) return true
  }
  return false
}

/**
 * True iff some `<tool>(...)` (or bare `<tool>`) rule in `entries`
 * covers `targetPath`.
 */
function matchesTool(entries: ReadonlySet<string>, tool: string, targetPath: string): boolean {
  for (const e of entries) {
    const spec = parseToolRule(e, tool)
    if (spec === null) continue
    if (spec === '') return true // bare tool ("Edit"): all paths
    if (toolPathMatches(spec, targetPath)) return true
  }
  return false
}

/**
 * If `entry` is a rule for `tool`, return its path spec (the text inside
 * the parens, or `""` for the bare `<tool>` form). Otherwise return
 * `null`. Matching on the tool name is case-insensitive to mirror how
 * `matchesVerb` treats Bash entries.
 */
function parseToolRule(entry: string, tool: string): string | null {
  const trimmed = entry.trim()
  const lowTool = tool.toLowerCase()
  const lowEntry = trimmed.toLowerCase()
  if (lowEntry === lowTool) return '' // bare tool: all paths
  const prefix = lowTool + '('
  if (lowEntry.startsWith(prefix) && trimmed.endsWith(')')) {
    return trimmed.slice(tool.length + 1, -1).trim()
  }
  return null
}

/**
 * Resolve a Claude Code tool-rule path spec to an absolute glob and test
 * it against `targetPath`. Handles the documented spec forms:
 *
 *   - `//abs/path/**`  — leading double-slash = filesystem-absolute.
 *   - `~/rel/**`       — home-relative.
 *   - `/rel/**`        — leading single-slash = repo/cwd-relative (the
 *                        glob is anchored at the directory the settings
 *                        file's project owns; we anchor at the target's
 *                        repo root, which is what the worktree path lives
 *                        under).
 *   - `rel/**`         — bare relative, anchored the same way.
 *
 * `targetPath` is always absolute (the resolved worktree path). A directory
 * spec like `Edit(.sdlc/worktrees/**)` covers any path beneath it.
 */
function toolPathMatches(spec: string, targetPath: string): boolean {
  const absSpec = resolveSpecToAbsolute(spec, targetPath)
  if (absSpec === null) return false
  return globCovers(absSpec, targetPath)
}

function expandUser(p: string): string {
  if (p === '~' || p.startsWith('~/')) {
    return join(homedir(), p.slice(1))
  }
  return p
}

function resolveSpecToAbsolute(spec: string, targetPath: string): string | null {
  if (spec === '') return null
  if (spec.startsWith('//')) {
    // Filesystem-absolute: the remainder (with the leading slash kept)
    // is the absolute path. "//Users/x/**" -> "/Users/x/**".
    return spec.slice(1)
  }
  if (spec === '~' || spec.startsWith('~/')) {
    return expandUser(spec)
  }
  // Repo/cwd-relative (leading single slash or bare). Anchor the glob at the
  // target's repo root — the same tree the worktree lives in.
  const root = findRepoRoot(targetPath) ?? dirname(targetPath)
  const rel = spec.startsWith('/') ? spec.slice(1) : spec
  return join(root, rel)
}

/**
 * True iff the glob `absSpec` covers `targetPath`. The spec is split on
 * `/`; `**` matches any number of path segments, a segment containing
 * `*`/`?` is matched as a per-segment glob, and a literal segment must
 * match exactly. A spec that runs out of segments while still a prefix
 * of the target (e.g. `.../worktrees/**` vs a file beneath it) covers
 * the target — a directory rule grants its whole subtree.
 */
function globCovers(absSpec: string, targetPath: string): boolean {
  const specParts = absSpec.split(/[/\\]+/).filter((s) => s.length > 0)
  const targetParts = targetPath.split(/[/\\]+/).filter((s) => s.length > 0)
  return matchSegments(specParts, 0, targetParts, 0)
}

function matchSegments(spec: string[], si: number, target: string[], ti: number): boolean {
  while (si < spec.length) {
    const seg = spec[si] as string
    if (seg === '**') {
      // `**` at the end covers everything remaining (including the
      // empty tail — a trailing `/**` matches the directory itself).
      if (si === spec.length - 1) return true
      // Try to consume zero or more target segments, then match the rest.
      for (let k = ti; k <= target.length; k++) {
        if (matchSegments(spec, si + 1, target, k)) return true
      }
      return false
    }
    if (ti >= target.length) {
      // Spec still has a concrete segment but target is exhausted.
      return false
    }
    if (!segmentMatches(seg, target[ti] as string)) return false
    si++
    ti++
  }
  // Spec exhausted. If the target is also exhausted it's an exact match;
  // if target segments remain, the spec named a directory prefix and we
  // treat it as covering the whole subtree beneath it.
  return true
}

function segmentMatches(seg: string, part: string): boolean {
  if (!seg.includes('*') && !seg.includes('?')) {
    return seg === part
  }
  const re = new RegExp(
    '^' +
      seg
        .split('')
        .map((c) => {
          if (c === '*') return '[^/]*'
          if (c === '?') return '[^/]'
          return escapeRegExp(c)
        })
        .join('') +
      '$',
  )
  return re.test(part)
}

/**
 * The permission rules and default mode Claude Code would apply under `projectRoot`, as
 * `@osdlc/detect-harness` reads them. An unreadable settings file is a warning on stderr.
 */
async function collectPermissions(
  io: CliIo,
  projectRoot: string,
  env: CliContext['env'],
  machine: MachineSeams,
): Promise<ResolvedPermissions> {
  const report = (await detect({ only: ['claude'], projectRoot, env, ...machine })).reports[0]
  for (const source of report?.sources ?? []) {
    if (source.kind === 'settings' && source.status === 'error') {
      io.stderr(`warning: could not read ${source.path}: ${source.error}\n`)
    }
  }
  const rules = report?.permissions.rules ?? []
  const rulesOf = (kind: 'allow' | 'deny'): Set<string> =>
    new Set(rules.filter((r) => r.kind === kind).map((r) => r.rule))
  return new ResolvedPermissions(
    rulesOf('allow'),
    rulesOf('deny'),
    report?.permissions.defaultMode ?? null,
  )
}

/**
 * The git checkout containing `start` — a `.git` marker, because the settings
 * files this probe reads (`<root>/.claude/settings.json`) are committed
 * alongside the checkout, not scoped to an sdlc project.
 *
 * `start` is usually a task FILE; `checkoutRoot` handles that (and a
 * not-yet-existing path) by starting the walk at its parent directory.
 */
function findRepoRoot(start: string): string | null {
  return checkoutRoot(start)
}

// --- Task body scanning ------------------------------------------------------

export function detectSignals(body: string): string[] {
  const hits: string[] = []
  const lowered = body.toLowerCase()
  for (const entry of SIGNAL_TABLE) {
    const family = entry.family
    for (const hint of entry.hints) {
      if (hint.startsWith('re:')) {
        if (new RegExp(hint.slice(3), 'i').test(body)) {
          hits.push(family)
          break
        }
      } else if (lowered.includes(hint.toLowerCase())) {
        hits.push(family)
        break
      }
    }
  }
  return hits
}

// --- CLI ---------------------------------------------------------------------

const cli = defineCli({
  name: 'sdlc task preflight-permissions',
  summary: "Report the Claude Code permissions a task's implementer will be missing.",
  flags: {},
  positionals: [{ name: 'task-file', required: true, help: 'The task markdown to probe for.' }],
})

/** `machine` lets a test point the home folder and the system root (managed settings) at a temp folder. */
export async function main(
  argv: readonly string[],
  ctx: CliContext,
  machine: MachineSeams = {},
): Promise<number> {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    ctx.io.stderr(`error: ${parsed.message}\n`)
    return EXIT.usage
  }
  const taskPath = parsed.positionals[0] as string

  if (!isFile(taskPath)) {
    ctx.io.stderr(`error: task file not found or not a regular file: ${taskPath}\n`)
    return EXIT.error
  }

  // `taskPath` is already known to be a regular file (the `isFile` guard
  // above); read it through the entity read layer ([[T-N9PM]]) rather than a
  // hand-rolled readFileSync + splitFrontmatter, per
  // `solutions/ontological/lib/CLAUDE.md`. `readTask` treats any read
  // failure (not just ENOENT) as absent, so a race or permission error here
  // reports as "could not read" rather than propagating the raw exception.
  const read = readTask(taskPath, { projectRoot: dirname(taskPath) })
  if (read === null) {
    ctx.io.stderr(`error: could not read ${taskPath}\n`)
    return EXIT.error
  }

  const signals = detectSignals(read.body)

  // Without a git checkout the task file's own folder stands in as the project root, so its
  // `.claude/settings.json` and `settings.local.json` are read as project scope.
  const repoRoot = findRepoRoot(taskPath)
  const perms = await collectPermissions(
    ctx.io,
    repoRoot ?? dirname(resolve(taskPath)),
    ctx.env,
    machine,
  )

  // Tier 1 — deterministic, project-grounded HARD gaps: a Bash(<pm>:*) grant
  // for every package manager the project resolves to. Skipped entirely when
  // the repo root can't be resolved (no project context → no PM hard gaps).
  let resolvedManagers: Set<string>
  if (repoRoot === null) {
    resolvedManagers = new Set<string>()
  } else {
    const [check, setup] = await Promise.all([
      resolveWorkflowCommands('check', repoRoot),
      resolveWorkflowCommands('setup', repoRoot),
    ])
    const verbs = [...check.commands, ...setup.commands]
    // The existence check is injected so the resolver stays pure and
    // testable without a filesystem.
    resolvedManagers = resolveProjectManagers(repoRoot, verbs, isFile)
  }

  // Each gap is a pre-rendered stdout line (shapes in the header). Warnings
  // are advisory, go to stderr, and never affect the exit code.
  const gaps: string[] = []
  const warnings: string[] = []

  // Tier-1 HARD gaps: one per resolved manager lacking a Bash(<pm>:*)
  // grant, in ascending order for deterministic output.
  for (const pm of [...resolvedManagers].sort()) {
    if (!perms.allowsVerb(pm)) {
      gaps.push(`${pm}: missing Bash(${pm}:*)`)
    }
  }

  // Body-text signals. PM families: never a hard gap from body text — a fired
  // family NOT in the resolved set and not granted is an advisory warning; one
  // IN the resolved set was already handled by the Tier-1 loop (skip — never
  // double-report). Non-PM families keep body-text hard gaps (T-NUML).
  for (const family of signals) {
    const entry = SIGNAL_TABLE.find((e) => e.family === family)
    if (entry === undefined) continue
    const verb = entry.verb
    if (PM_FAMILIES.has(family)) {
      if (resolvedManagers.has(family)) continue
      if (!perms.allowsVerb(verb)) {
        warnings.push(
          `warning: ${family} mentioned in task body but not a resolved ` +
            `project manager; Bash(${family}:*) not granted`,
        )
      }
    } else if (!perms.allowsVerb(verb)) {
      gaps.push(`${family}: missing Bash(${verb}:*)`)
    }
  }

  // File-mutation probe. The implementer always needs Write/Edit on the
  // worktree Step 4 will create at <primary-checkout>/.sdlc/worktrees/<basename>,
  // so probe unconditionally (independent of Bash signals).
  const worktreePath = worktreeDirForTaskFile(taskPath)
  if (worktreePath !== null) {
    const worktreeGlob = join(worktreePath, '**')
    for (const tool of ['Write', 'Edit']) {
      if (!perms.allowsTool(tool, worktreePath)) {
        gaps.push(`${tool}: missing ${tool}(${worktreeGlob})`)
      }
    }
  }

  for (const line of warnings) {
    ctx.io.stderr(`${line}\n`)
  }

  if (gaps.length === 0) {
    return EXIT.ok
  }

  for (const line of gaps) {
    ctx.io.stdout(`${line}\n`)
  }
  return EXIT.error
}

/**
 * The worktree directory `/sdlc:task-work` Step 4 will create for the
 * task at `taskPath`: `<primary-checkout>/.sdlc/worktrees/<task-basename>`
 * (the primary checkout, not the checkout containing `taskPath`, which inside
 * a linked worktree is that worktree). The basename is the task filename
 * without its `.md` extension. Returns `null` when the repo root cannot be
 * resolved (so the probe simply skips the file-mutation check rather than
 * guessing a path).
 */
export function worktreeDirForTaskFile(taskPath: string): string | null {
  const root = findRepoRoot(taskPath)
  if (root === null) return null
  const name = taskPath.split(/[/\\]/).pop() ?? taskPath
  const basename = name.endsWith('.md') ? name.slice(0, -3) : name
  return worktreeDirFor(root, basename)
}

// ---------------------------------------------------------------------------
// Op definition — CliHints.rawArgv (see lib/registry.ts): this op's whole CLI
// surface (error text, exit codes; it takes no flags) is `main`, above. No `needs`
// are declared: the retired script
// never went through the op dispatcher's `preflight()` check either, and
// `resolveWorkflowCommands`'s own validation (SCHEMA_ERROR on a broken
// sdlc.yaml) is the only check this op ever ran.
// ---------------------------------------------------------------------------

const input = z.object({ argv: z.array(z.string()) })
const output = z.object({ exitCode: z.number().int() })

export default defineOp({
  path: ['task', 'preflight-permissions'],
  summary: "Report the Claude Code permissions a task's implementer will be missing.",
  hidden: true,
  input,
  output,
  cli: { rawArgv: true },
  handler: async ({ argv }, ctx: OpCtx) => ({ exitCode: await main(argv, legacyCliContext(ctx)) }),
})
