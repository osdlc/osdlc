/**
 * Turning one job into one `AgentCallSpec`.
 *
 * Pure, so the exact invocation can be asserted against a golden `PlannedCall`
 * without spawning anything. Two rules shape everything here: the rule prose
 * is handed over verbatim (paraphrasing it would change what is enforced),
 * and the judge is told to cite, so a finding always points somewhere real.
 */
import type { AgentCallSpec } from '@osdlc/agent-call'

import type { ReviewConfig, ReviewJob } from './types.ts'

/**
 * JSON Schema pinning the judge's reply.
 *
 * Also the single definition of the finding wire shape — `Finding` in
 * `types.ts` is its TypeScript mirror, and `parseFindings` validates against
 * these same constraints.
 */
export const FINDINGS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'evidence', 'why', 'severity'],
        properties: {
          file: {
            type: 'string',
            description: 'Repo-relative path, exactly as given in the input.',
          },
          line: {
            type: 'integer',
            minimum: 1,
            description: '1-indexed line in the new version of the file.',
          },
          evidence: {
            type: 'string',
            description: 'Quoted verbatim from the diff.',
          },
          why: {
            type: 'string',
            description: 'Which rule this breaches, and how.',
          },
          severity: {
            type: 'string',
            enum: ['violation', 'tension', 'drift'],
          },
        },
      },
    },
  },
}

/** A changed file paired with its unified diff. */
export interface FileDiff {
  file: string
  diff: string
}

/** Build the judgement call for one job. */
export function buildSpec(
  job: ReviewJob,
  diffs: readonly FileDiff[],
  config: ReviewConfig,
  cwd: string,
): AgentCallSpec {
  const spec: AgentCallSpec = {
    prompt: buildPrompt(job, diffs),
    permissions: { mode: 'read-only' },
    output: { format: 'json', schema: FINDINGS_SCHEMA },
    session: { persist: false },
    cwd,
    timeoutMs: config.timeoutMs,
  }
  if (config.model !== undefined) spec.model = config.model
  if (config.effort !== undefined) spec.effort = config.effort
  if (config.extraArgs !== undefined) spec.extraArgs = [...config.extraArgs]
  return spec
}

function buildPrompt(job: ReviewJob, diffs: readonly FileDiff[]): string {
  const relevant = diffs.filter((d) => job.files.includes(d.file))

  return [
    'You are checking a changeset against one specific set of project rules.',
    '',
    `# The rules (from ${job.source.path})`,
    '',
    'Treat the text below as the complete and only ruleset for this check.',
    'Do not apply general best practices, style preferences, or rules from',
    'anywhere else — another check covers those. If the text is guidance for',
    'authoring rather than a constraint on code, apply it only where the',
    'changed files fall under it.',
    '',
    '<rules>',
    job.source.text.trim(),
    '</rules>',
    '',
    `# The changed files (${relevant.length})`,
    '',
    'These are the only files in scope. Each is given as a unified diff.',
    '',
    ...relevant.map((d) => `<file path="${d.file}">\n${d.diff.trim()}\n</file>\n`),
    '# What to report',
    '',
    'Report only breaches you can point at in the diffs above. For each one,',
    'quote the offending text in `evidence` and name the rule it breaches in',
    '`why`. A file that complies produces no finding — an empty list is the',
    'expected result for a clean changeset, and inventing marginal findings to',
    'look thorough is worse than reporting none.',
    '',
    'Severity:',
    '- `violation` — the change contradicts a rule.',
    "- `tension`   — defensible, but pulls against a rule's intent.",
    '- `drift`     — complies today while moving away from a rule.',
    '',
    'Reply with JSON matching the required schema, and nothing else.',
  ].join('\n')
}
