/**
 * GitHub Actions workflows — https://docs.github.com/actions
 *
 * `kind: "parse"`, and every task it emits is `executes: "remote"`. The two
 * are independent, and this runner shows the difference. Reading a workflow
 * is YAML parsing on this machine. Running one happens on GitHub's hosted
 * runners, not here.
 *
 * What a dispatch does, so a UI can warn before a click. `gh workflow run`
 * builds nothing locally. It creates a `workflow_dispatch` event on the
 * repository the working directory's git remote points at. So it:
 *   - spends real CI minutes on someone's account,
 *   - needs an authenticated `gh` and write access to the repository,
 *   - prints no local output; the result is a run URL,
 *   - and acts on the remote default branch (or `--ref`), not on the working
 *     tree the user is looking at.
 * A row for `cargo build` and a row for `gh workflow run release.yml` are not
 * the same kind of thing. `executes: "remote"` is the field that says so.
 *
 * Detection. Files directly under `.github/workflows/` whose name ends in
 * `.yml` or `.yaml` and has a name before the extension. A file called just
 * `.yml` has no workflow name, and `gh workflow run .yml` names nothing. The
 * directory test is exact on purpose. GitHub reads `.github/workflows/` only
 * at the repository root, and ignores subdirectories in it. So
 * `packages/x/.github/workflows/y.yml` is not a workflow of the scanned
 * repository, and `.github/workflows/sub/z.yml` is not a workflow at all.
 * Both are rejected. The anchored patterns in `WORKFLOW_FILES` do most of
 * this; `isWorkflowPath` rejects the nameless `.yml`.
 *
 * Dispatch check. Only a workflow with an `on.workflow_dispatch` trigger
 * becomes a task. `gh workflow run --help` (gh 2.97.0) says: "This command
 * will trigger GitHub Actions to run a given workflow file. The given workflow
 * file must support an `on.workflow_dispatch` trigger in order to be run in
 * this way." A task for a workflow that cannot be dispatched would always
 * fail. So those are left out and listed in a diagnostic, with their count
 * and names.
 *
 * The YAML 1.1 `on:` problem. YAML 1.1 reads the bare key `on` as the boolean
 * `true`, so a parser that follows that spec returns a workflow whose trigger
 * key is `true`, not `"on"`. Simple `doc["on"]` code then reports every
 * workflow as having no trigger. This reader works on raw text and matches
 * the literal key, so it is not affected. The note is here for anyone who
 * switches to a real YAML library.
 *
 * Reader limits. This reader uses no YAML library. The lexing is in
 * `yaml-lite.ts`, shared with `docker-compose.ts` and `go-task.ts`: it strips
 * the leading UTF-8 BOM, strips comments outside quoted strings, blanks block
 * scalar bodies, truncates at the first document separator, and flags
 * anchors, aliases and merge keys. This file keeps the `on:` reader, the
 * trigger rules, and every diagnostic.
 *
 * On top of that, this file reads exactly two top-level keys:
 *   - the top-level `name:` scalar, used as `doc`. A block scalar (`name: |`)
 *     is recognized but not decoded, and is treated as absent on purpose.
 *   - the top-level `on:` trigger in five forms: scalar
 *     (`on: workflow_dispatch`), flow sequence (`on: [push, workflow_dispatch]`),
 *     flow mapping (`on: {workflow_dispatch: {}}`), block mapping and block
 *     sequence. Key order in a workflow is free, so `on:` is read wherever it
 *     is, after `jobs:` as well as before it.
 * Quoted keys and values are handled, including the `"on":` and `'on':` forms
 * a repository uses to avoid the YAML 1.1 problem above.
 *
 * It does not handle the following. It emits a `warning` Diagnostic naming
 * the file instead of silently reporting too little:
 *   - YAML anchors/aliases (`&`/`*`) and merge keys (`<<`). It warns only
 *     where they could change this reader's answer: inside the `on:`
 *     declaration and its block, or a merge key at top level, which could
 *     insert an `on:` into the document. An anchor in `jobs:` cannot affect
 *     the trigger, and the common `&defaults` / `<<: *defaults` job pattern
 *     would otherwise warn on ordinary repositories. A `&` or `*` inside a
 *     plain scalar is not an anchor either: `if: rm -rf *tmp` is a glob, and
 *     the lexer does not flag it.
 *   - multi-document files. Only the content before the first document
 *     separator (`---`) or end marker (`...`) at column 0, outside any open
 *     block scalar, is read.
 *   - multi-line flow forms (`on: {` … `}` or `on: [` … `]` across lines).
 *     GitHub accepts this valid YAML, but here the closing bracket must be on
 *     the `on:` line. Otherwise the value cannot be read, and the workflow is
 *     emitted under the fail-open rule below.
 *   - escapes inside quoted scalars: `name: 'It''s CI'` gives `It''s CI`.
 *     Cosmetic: it reaches `doc` only, never `argv`.
 *   - an `on:` value it cannot interpret
 *
 * Which way it fails. When `on:` cannot be interpreted, the workflow is
 * emitted with the warning, not left out. Leaving it out would hide a task
 * the user knows exists, with no way to reach it. Emitting it at worst gives
 * a row that `gh` rejects with its own clear message ("does not have
 * 'workflow_dispatch' trigger"). An `on:` read cleanly that lacks
 * `workflow_dispatch` (including a workflow with no `on:` at all) is left out
 * and counted in the `info` diagnostic. That reading can be trusted: every
 * construct that could hide a trigger from this reader (a BOM, a block
 * scalar, an anchor, a document marker) is handled above or raises its own
 * warning.
 *
 * An empty file is neither case. A zero-byte or whitespace-only file has no
 * trigger declaration that could be missing. Counting it as "lacks
 * workflow_dispatch" would describe a document that does not exist, and
 * emitting a task for it under the fail-open rule would give a row `gh` cannot
 * run. It is left out with its own warning: the file is empty.
 *
 * Inputs are not modelled. A `workflow_dispatch.inputs:` map would become
 * `-f key=value` parameters. This reader does not read into it, so every task
 * has `parameters: []`. `argv` has no placeholders either way, so every task
 * is safe to run. It runs the workflow with its declared defaults.
 */

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { taskId } from '../support/shared.ts'
import {
  BLOCK_SCALAR_VALUE,
  leadingSpaces,
  matchKey,
  prepass,
  unquote,
} from '../support/yaml-lite.ts'

const CHAIN = [
  { label: 'runner', hint: 'gh dispatches workflows declared under .github/workflows/.' },
  { label: 'workflow', hint: 'The workflow file, named as GitHub Actions names it.' },
]

const WORKFLOW_DIR = '.github/workflows/'

const MULTI_DOC =
  'multi-document YAML (`---`/`...`) is not supported — only the content before the first separator was read'
const ANCHOR_ALIAS =
  'YAML anchors and aliases (`&`/`*`) are not supported — a trigger defined via an anchor/alias may be misread'
const MERGE_KEY = 'YAML merge keys (`<<`) are not supported — merged fields were not applied'
const EMPTY_FILE =
  'workflow file is empty — it declares no triggers and GitHub has nothing to dispatch'
const UNREADABLE_ON =
  'the `on:` trigger could not be interpreted — this workflow is listed as dispatchable without proof, and `gh` will reject it if it is not'

/**
 * A workflow file GitHub would use.
 *
 * Exact prefix, one path segment after it: `.github/workflows/ci.yml` yes,
 * `packages/x/.github/workflows/ci.yml` no (not the repository root's
 * directory), `.github/workflows/sub/ci.yml` no (GitHub ignores
 * subdirectories under `.github/workflows/`), `.github/workflows/.yml` no (a
 * dotfile whose whole name is the extension, so no workflow name to give
 * `gh workflow run`).
 */
function isWorkflowPath(rel: string): boolean {
  if (!rel.startsWith(WORKFLOW_DIR)) return false
  const rest = rel.slice(WORKFLOW_DIR.length)
  if (rest.length === 0 || rest.includes('/')) return false
  // A non-empty stem is required; the extension itself is not a name.
  return /\.(?:yml|yaml)$/.test(rest) && !/^\.(?:yml|yaml)$/.test(rest)
}

function basenameOf(rel: string): string {
  const at = rel.lastIndexOf('/')
  return at === -1 ? rel : rel.slice(at + 1)
}

/** How the `on:` declaration was read. */
type Trigger =
  | { kind: 'read'; dispatchable: boolean }
  /** Present but in a form this reader does not understand. */
  | { kind: 'unreadable' }
  /**
   * The file has no content, so there is no declaration to read. Not `read`,
   * which would claim a missing trigger in a document that does not exist.
   * See "An empty file" in the file header.
   */
  | { kind: 'empty' }

export interface WorkflowRead {
  /** The top-level `name:`, when there is a readable scalar one. */
  name?: string | undefined
  trigger: Trigger
  warnings: string[]
}

const DISPATCH = 'workflow_dispatch'

/** Trigger names out of a flow sequence `[push, workflow_dispatch]`, or null if malformed. */
function readFlowSequence(value: string): string[] | null {
  const t = value.trim()
  if (!t.startsWith('[') || !t.endsWith(']')) return null
  const inner = t.slice(1, -1).trim()
  if (inner === '') return []
  return inner.split(',').map((part) => unquote(part))
}

/** Trigger names out of a flow mapping `{workflow_dispatch: {}, push: null}`, or null if malformed. */
function readFlowMapping(value: string): string[] | null {
  const t = value.trim()
  if (!t.startsWith('{') || !t.endsWith('}')) return null
  const inner = t.slice(1, -1).trim()
  if (inner === '') return []
  const names: string[] = []
  // Split on top-level commas only, so a nested `{branches: [main]}` value
  // does not fragment the key it belongs to.
  let depth = 0
  let current = ''
  for (const ch of inner) {
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      names.push(current)
      current = ''
      continue
    }
    current += ch
  }
  names.push(current)
  return names.map((entry) => {
    const at = entry.indexOf(':')
    return unquote(at === -1 ? entry : entry.slice(0, at))
  })
}

/**
 * One past the last line belonging to the `on:` declaration: the `on:` line
 * itself plus everything indented under it, ending at the next top-level key.
 */
function onBlockEnd(lines: string[], onLine: number): number {
  if (onLine === -1) return 0
  for (let i = onLine + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '') continue
    if (leadingSpaces(line) === 0) return i
  }
  return lines.length
}

/**
 * Read a workflow file's top-level `name:` and `on:`. See the file header for
 * exactly what this does and does not attempt.
 */
export function readWorkflow(text: string): WorkflowRead {
  const warnings = new Set<string>()
  // `prepass` strips a leading BOM. Testing the raw text for emptiness first
  // is safe: U+FEFF is ECMAScript WhiteSpace, so `trim()` removes it and a
  // BOM-only file reads as empty.
  if (text.trim() === '') return { trigger: { kind: 'empty' }, warnings: [] }

  // One walk over the file: comments stripped, block-scalar bodies blanked so
  // their content is never mistaken for structure, everything from the first
  // document separator dropped, and anchors and merge keys flagged per line.
  const { lines, scanned, multiDoc } = prepass(text)
  if (multiDoc) warnings.add(MULTI_DOC)

  let name: string | undefined
  let onLine = -1
  let onValue = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '' || leadingSpaces(line) !== 0) continue
    const m = matchKey(line, 0)
    if (m === null) continue
    if (m.key === 'name' && name === undefined) {
      const v = unquote(m.value)
      // A block scalar (`name: |`) is recognizable but not decoded, so it is
      // treated as absent rather than reported as the literal indicator.
      if (v !== '' && !BLOCK_SCALAR_VALUE.test(v)) name = v
    }
    // The literal key only. YAML 1.1 would turn this into `true`; see the file
    // header. `"on"` and `'on'` are the quoted forms a repo uses to avoid
    // that, and matchKey already unquotes them.
    if (m.key === 'on' && onLine === -1) {
      onLine = i
      onValue = m.value.trim()
    }
  }

  // Warn about anchors, aliases and merge keys only where they could change
  // this reader's answer: inside the `on:` declaration and its block, or a
  // merge key at top level, which could insert an `on:` into the document. An
  // `&defaults` on a job cannot affect a trigger. Warning on that common job
  // pattern would fire on ordinary repositories and teach users to ignore
  // this runner's warnings.
  const onEnd = onBlockEnd(lines, onLine)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    // The prepass blanked block-scalar content, so it is skipped here too,
    // and its per-line flags are always false.
    if (line.trim() === '') continue
    const inOnBlock = onLine !== -1 && i >= onLine && i < onEnd
    const topLevel = leadingSpaces(line) === 0
    if (!inOnBlock && !topLevel) continue
    const { anchor, merge } = scanned[i] ?? { anchor: false, merge: false }
    if (anchor && inOnBlock) warnings.add(ANCHOR_ALIAS)
    if (merge && (inOnBlock || topLevel)) warnings.add(MERGE_KEY)
  }

  // No `on:` at all: a readable answer, and the answer is "not dispatchable".
  if (onLine === -1) {
    return { name, trigger: { kind: 'read', dispatchable: false }, warnings: [...warnings] }
  }

  if (onValue !== '') {
    if (onValue.startsWith('[')) {
      const names = readFlowSequence(onValue)
      return {
        name,
        trigger:
          names === null
            ? { kind: 'unreadable' }
            : { kind: 'read', dispatchable: names.includes(DISPATCH) },
        warnings: [...warnings],
      }
    }
    if (onValue.startsWith('{')) {
      const names = readFlowMapping(onValue)
      return {
        name,
        trigger:
          names === null
            ? { kind: 'unreadable' }
            : { kind: 'read', dispatchable: names.includes(DISPATCH) },
        warnings: [...warnings],
      }
    }
    // Scalar: `on: workflow_dispatch`.
    const scalar = unquote(onValue)
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(scalar)) {
      return {
        name,
        trigger: { kind: 'read', dispatchable: scalar === DISPATCH },
        warnings: [...warnings],
      }
    }
    return { name, trigger: { kind: 'unreadable' }, warnings: [...warnings] }
  }

  // Empty value: a block mapping or block sequence follows. The first indent
  // level seen under `on:` is the trigger-name level; anything deeper (a
  // `branches:` filter under `push:`) is not a trigger name.
  let triggerIndent = -1
  const names: string[] = []
  for (let i = onLine + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '') continue
    const indent = leadingSpaces(line)
    if (indent === 0) break // back to top level: the `on:` block is over
    if (triggerIndent === -1) triggerIndent = indent
    if (indent !== triggerIndent) continue

    const content = line.slice(indent)
    if (content.startsWith('-')) {
      // Block sequence item: `- workflow_dispatch`.
      names.push(unquote(content.slice(1)))
      continue
    }
    const m = matchKey(line, indent)
    if (m !== null) names.push(m.key)
  }

  if (names.length === 0) {
    // `on:` with nothing readable under it: this reader cannot say either
    // way.
    warnings.add(UNREADABLE_ON)
    return { name, trigger: { kind: 'unreadable' }, warnings: [...warnings] }
  }
  return {
    name,
    trigger: { kind: 'read', dispatchable: names.includes(DISPATCH) },
    warnings: [...warnings],
  }
}

function makeTask(file: string, doc: string): Task {
  const workflow = basenameOf(file)
  // `gh workflow run [<workflow-id> | <workflow-name>]`, checked against
  // `gh workflow run --help` on gh 2.97.0, whose example is
  // `gh workflow run triage.yml`. gh identifies a workflow by its file name,
  // not by a path and not by the root-relative `.github/workflows/…`. So the
  // basename goes in argv.
  const argv = ['gh', 'workflow', 'run', workflow]
  return {
    id: taskId('github-actions', file, workflow),
    runner: 'github-actions',
    path: ['github-actions', workflow],
    argv,
    // `cwd` stays "." and no directory flag is needed. gh finds the
    // repository from the working directory's git remote, and workflows live
    // only at the repository root, so the root is the right place to run.
    // `-R/--repo` is not wanted: it selects a different repository, and this
    // catalog lists this repository's tasks.
    cwd: '.',
    // A plain join, like every other runner, not a shell-quoted form. A
    // workflow filename may contain a space, `$`, a backtick or a `;`, so
    // this string is not always safe to paste into a shell. That is fine:
    // model.ts defines `display` as the human form for showing and copying
    // (other runners put parameter placeholders in it), and says never to
    // build `argv` from it. `argv` is what runs: an array, spawned directly,
    // never re-joined.
    display: argv.join(' '),
    parameters: [],
    source: file,
    origin: 'declared',
    doc,
    tags: ['github-actions', 'ci', 'remote'],
    // A dispatch POSTs an event and returns a run URL. It does not stream the
    // run, and nothing stays attached to this process.
    persistent: { value: false, declared: false },
    executes: 'remote',
  }
}

/** Workflow files, at the root only. */
export const WORKFLOW_FILES = ['/.github/workflows/*.yml', '/.github/workflows/*.yaml']

export const githubActionsRunner: RunnerRole = {
  // `parse`: workflows are read from YAML on this machine, never by asking gh.
  // That the tasks run remotely is a separate matter; see `executes`.
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const found = await Promise.all(WORKFLOW_FILES.map((p) => ctx.files(p)))
    const files = [...new Set(found.flat())].filter(isWorkflowPath).sort()
    if (files.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const diagnostics: Diagnostic[] = []
    const tasks: Task[] = []
    const skipped: string[] = []

    for (const file of files) {
      const text = await ctx.readText(file)
      if (text === null) {
        diagnostics.push({
          severity: 'warning',
          message: 'workflow file could not be read',
          source: file,
        })
        continue
      }
      const read = readWorkflow(text)
      for (const message of read.warnings) {
        diagnostics.push({ severity: 'warning', message, source: file })
      }
      if (read.trigger.kind === 'empty') {
        // Left out, and not counted as "cannot be dispatched": that line says
        // a trigger declaration is missing, and an empty file has none at all.
        // See "An empty file" in the file header.
        diagnostics.push({ severity: 'warning', message: EMPTY_FILE, source: file })
        continue
      }
      if (read.trigger.kind === 'read' && !read.trigger.dispatchable) {
        skipped.push(basenameOf(file))
        continue
      }
      if (read.trigger.kind === 'unreadable') {
        // Fail open; see "Which way it fails" in the file header. The reader
        // emits the warning for a malformed block. This emits it for the
        // flow and scalar forms that returned unreadable without one.
        if (!read.warnings.includes(UNREADABLE_ON)) {
          diagnostics.push({ severity: 'warning', message: UNREADABLE_ON, source: file })
        }
      }
      tasks.push(makeTask(file, read.name ?? basenameOf(file)))
    }

    if (skipped.length > 0) {
      // `info`, not `warning`: most workflows are push/pull_request CI and are
      // not meant to be dispatched by hand. A warning on the normal case would
      // fire on nearly every repository and teach users to ignore this
      // runner's warnings, which are kept for the reader's real gaps. The
      // count and names let a user missing a task see why.
      diagnostics.push({
        severity: 'info',
        message: `${skipped.length} workflow${skipped.length === 1 ? '' : 's'} cannot be dispatched and ${
          skipped.length === 1 ? 'was' : 'were'
        } not listed — \`gh workflow run\` requires an \`on.workflow_dispatch\` trigger: ${skipped.join(', ')}`,
      })
    }

    return {
      // "ok" with zero tasks, not "absent": the workflows are here, they just
      // cannot be dispatched. `absent` means "this runner is not present",
      // which would be false. It would also put the diagnostic that explains
      // the empty list in a report a consumer may hide.
      status: 'ok',
      tasks,
      diagnostics,
    }
  },
}
