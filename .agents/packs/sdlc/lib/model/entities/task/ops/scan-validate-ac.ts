/**
 * `sdlc task scan-validate-ac` — authoring-time advisory helper for
 * /sdlc:task-define.
 *
 * Ported off `bun run ${CLAUDE_PLUGIN_ROOT}/skills/task-define/scan_validate_ac.ts`
 * ([[T-VAW3]] AC-2: a skill script invoked by file path resolves its deep
 * relative imports (`../../../../../lib/util/...`) by accident of the
 * in-repo layout, which breaks once the built plugin is copied outside this
 * monorepo). CLI parsing, stdout shape and exit codes are unchanged from the
 * retired script; the entry point moved onto the op substrate
 * (`CliHints.rawArgv`, see `lib/registry.ts`), and the validator call
 * (below) moved from a `bun run <guessed-path-to-cli/sdlc.ts> entities
 * validate` subprocess shell-out to an in-process call to the sibling
 * `entities validate` op — the exact bug class this task exists to fix, and
 * doubled once the plugin is a compiled binary with no `cli/sdlc.ts` file to
 * find.
 *
 * Given a task file, scan its Acceptance criteria section for ACs that
 * reference `validate_frontmatter.ts` plus a file path (the "make X
 * validate" pattern). For each matched target, run the frontmatter
 * validator against the path and capture the failing fields. Emit a JSON
 * structure the SKILL.md procedure can feed into AskUserQuestion.
 *
 * This is purely advisory — it does NOT mutate the task file, the target
 * file, or anything else.
 *
 * Output (stdout, single JSON object):
 *
 *     {
 *       "matched": true | false,
 *       "targets": [
 *         {
 *           "path": "<absolute or task-relative path as cited>",
 *           "resolved_path": "<absolute path the validator was run against, or null>",
 *           "exists": true | false,
 *           "validator_exit": 0 | 1 | 2 | null,
 *           "failing_fields": [
 *             {"pointer": "frontmatter/type", "message": "Invalid string: must match ..."},
 *             ...
 *           ]
 *         },
 *         ...
 *       ]
 *     }
 *
 * Exit code ([[S-0015-standalone-cli-shape]]):
 *   0  the JSON was produced, even if every target failed validation. The
 *      advisory is informational, not a gate.
 *   1  the task file could not be read.
 *   2  the command was typed wrong.
 */

import { isAbsolute, dirname, resolve } from 'node:path'

import { z } from 'zod'

import { defineCli, EXIT, type CliContext } from '@osdlc/cli-tool'

import { isFile } from '@lib/util/fs'
import { defineOp, createCtx, callSync, type OpCtx } from '@lib/registry'
import { legacyCliContext } from '@lib/util/legacy-cli.ts'
import validateOp from '@lib/model/ops/validate'
import { readTask } from '../read.ts'

// Path regex: capture a relative-or-absolute path ending in a markdown
// extension. Intentionally narrow to .md (the validator's domain).
const PATH_RE = /([\w./\-]+\.md)/g

// The validate-AC predicate: a line mentioning the validator AND a .md path.
const VALIDATOR_TOKEN = 'validate_frontmatter.ts'

// [[D-0014]]: validate now emits a `markdown-contract` finding per error,
// rendered as `  [<finding-id>] (line N): <message>` (the `(line N)` is omitted
// for whole-document findings). The capture groups are the finding id and the
// message. The AC predicate is specifically about FRONTMATTER validity, so the
// scanner keeps only `frontmatter/*` findings (body/structure findings are not
// what "passes validate_frontmatter.ts" asks about).
const VALIDATOR_FAIL_LINE_RE = /^\s+\[([^\]]+)\](?:\s+\(line\s+\d+\))?:\s+(.*)$/
const FRONTMATTER_FINDING_PREFIX = 'frontmatter/'

interface FailingField {
  pointer: string
  message: string
}

export function extractAcSection(text: string): string | null {
  const lines = text.split('\n')
  let start: number | null = null
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim().toLowerCase().startsWith('## acceptance criteria')) {
      start = i + 1
      break
    }
  }
  if (start === null) {
    return null
  }
  let end = lines.length
  for (let j = start; j < lines.length; j++) {
    if (lines[j]!.startsWith('## ')) {
      end = j
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

export function findValidateTargets(acBody: string): string[] {
  const targets: string[] = []
  const seen = new Set<string>()
  for (const raw of acBody.split('\n')) {
    if (!raw.includes(VALIDATOR_TOKEN)) {
      continue
    }
    PATH_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PATH_RE.exec(raw)) !== null) {
      const p = m[1]!
      // Skip the validator itself if it shows up as a "path".
      if (p.endsWith('validate_frontmatter.ts')) {
        continue
      }
      if (seen.has(p)) {
        continue
      }
      seen.add(p)
      targets.push(p)
    }
  }
  return targets
}

export function resolvePathCitation(citation: string, projectRoot: string): string {
  if (isAbsolute(citation)) {
    return citation
  }
  return resolve(projectRoot, citation)
}

/**
 * Validate `target`'s frontmatter in-process, via the `entities validate`
 * op's own handler — never a subprocess (see the module header: the retired
 * script's `bun run <guessed-path-to-cli/sdlc.ts> entities validate`
 * shell-out is exactly the bug class this task exists to fix). `projectRoot`
 * is `dirname(target)`, matching the `ensure-ready-mutate.ts` precedent for
 * this same in-process call, rather than the retired script's `ctx.cwd` —
 * whatever directory the CLI process happened to be launched from, not
 * necessarily inside the target's own repo. `entities validate`'s own
 * `errors` entries are ALREADY the exact `  [<id>] (line N): <message>` text
 * `VALIDATOR_FAIL_LINE_RE` matches (`formatFinding` in `lib/model/ops/validate.ts`),
 * so the filtering logic here is unchanged from the retired script.
 */
export function runValidator(target: string): [number, FailingField[]] {
  if (!isFile(target)) {
    return [2, []]
  }
  const result = callSync(
    validateOp.handler(
      { flavor: 'frontmatter', files: [target], schema: null, entitiesDir: null, quiet: false },
      createCtx({ projectRoot: dirname(target) }),
    ),
  )
  const failures: FailingField[] = []
  for (const r of result.results) {
    for (const line of r.errors) {
      const m = VALIDATOR_FAIL_LINE_RE.exec(line)
      if (m && m[1]!.startsWith(FRONTMATTER_FINDING_PREFIX)) {
        // `pointer` now carries the contract finding id (e.g. `frontmatter/type`)
        // rather than the retired JSON-pointer location.
        failures.push({ pointer: m[1]!, message: m[2]! })
      }
    }
  }
  return [result.failed > 0 ? 1 : 0, failures]
}

const cli = defineCli({
  name: 'sdlc task scan-validate-ac',
  summary:
    "Report which files a task's acceptance criteria ask to make validate, and why they fail.",
  flags: {
    projectRoot: {
      kind: 'string',
      valueName: 'path',
      help: "Repo root the cited paths resolve against. Default: the task file's repo root.",
    },
  },
  positionals: [{ name: 'task-file', required: true, help: 'The task markdown to scan.' }],
})

export function main(argv: readonly string[], ctx: CliContext): number {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    ctx.io.stderr(`${parsed.message}\n`)
    return EXIT.usage
  }
  const ns = { taskFile: parsed.positionals[0] as string, projectRoot: parsed.values.projectRoot }

  const taskPath = resolve(ns.taskFile)
  if (!isFile(taskPath)) {
    ctx.io.stderr(`task file not found: ${taskPath}\n`)
    return EXIT.error
  }
  // The retired script's next check (`isFile(SDLC_CLI)`, a sanity probe that
  // the guessed `cli/sdlc.ts` path existed before shelling out to it) is
  // gone: `runValidator` below calls the validate op in-process, so there is
  // no subprocess binary to find.

  let projectRoot: string
  if (ns.projectRoot) {
    projectRoot = resolve(ns.projectRoot)
  } else {
    // docs/planning/tasks/<file>.md -> repo root is three parents up.
    projectRoot = parentsUp(taskPath, 4)
  }

  // Read through the entity read layer ([[T-N9PM]]) rather than a hand-rolled
  // readFileSync, per `solutions/ontological/lib/CLAUDE.md`. `readTask`
  // treats any read failure (not just ENOENT) as absent; the `isFile` guard
  // above already covers the ordinary missing-file case, so a `null` result
  // here means a race or permission error at read time.
  const read = readTask(taskPath, { projectRoot })
  if (read === null) {
    ctx.io.stderr(`failed to read ${taskPath}\n`)
    return EXIT.error
  }
  const acBody = extractAcSection(read.text)
  if (acBody === null) {
    ctx.io.stdout(JSON.stringify({ matched: false, targets: [] }) + '\n')
    return EXIT.ok
  }

  const citations = findValidateTargets(acBody)
  if (citations.length === 0) {
    ctx.io.stdout(JSON.stringify({ matched: false, targets: [] }) + '\n')
    return EXIT.ok
  }

  const targets: Record<string, unknown>[] = []
  for (const citation of citations) {
    const resolved = resolvePathCitation(citation, projectRoot)
    const exists = isFile(resolved)
    let exitCode: number | null
    let failures: FailingField[]
    if (exists) {
      ;[exitCode, failures] = runValidator(resolved)
    } else {
      exitCode = null
      failures = []
    }
    targets.push({
      path: citation,
      resolved_path: exists ? resolved : null,
      exists,
      validator_exit: exitCode,
      failing_fields: failures,
    })
  }

  ctx.io.stdout(JSON.stringify({ matched: true, targets }) + '\n')
  return EXIT.ok
}

/**
 * Return the ancestor `levels` directories up. Mirrors Python's
 * `path.parents[levels - 1]` semantics where parents[0] is the immediate
 * parent. If the path has fewer ancestors than requested, falls back to
 * the immediate parent (matching the Python guard).
 */
function parentsUp(path: string, levels: number): string {
  // Python: task_path.parents[3] if len(parents) >= 4 else task_path.parent
  const ancestors: string[] = []
  let cur = path
  while (true) {
    const parent = dirname(cur)
    if (parent === cur) break
    ancestors.push(parent)
    cur = parent
  }
  // ancestors[0] = immediate parent (parents[0]); request parents[levels-1].
  if (ancestors.length >= levels) {
    return ancestors[levels - 1]!
  }
  return dirname(path)
}

// ---------------------------------------------------------------------------
// Op definition — CliHints.rawArgv (see lib/registry.ts): this op's whole CLI
// surface (flags, error text, exit codes) is `main`, above, unchanged from the
// retired standalone script. `--project-root` is this script's own flag,
// which collides with the adapter's reserved global `--project-root` — one
// more reason `rawArgv` (no global flags registered) is required here, not
// just convenient.
// ---------------------------------------------------------------------------

const input = z.object({ argv: z.array(z.string()) })
const output = z.object({ exitCode: z.number().int() })

export default defineOp({
  path: ['task', 'scan-validate-ac'],
  summary:
    "Report which files a task's acceptance criteria ask to make validate, and why they fail.",
  hidden: true,
  input,
  output,
  cli: { rawArgv: true },
  handler: ({ argv }, ctx: OpCtx) => ({ exitCode: main(argv, legacyCliContext(ctx)) }),
})
