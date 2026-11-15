/**
 * A throwaway repository whose correct findings are known in advance.
 *
 * Synthetic rather than a labelled slice of real history, for one reason: the
 * answer has to be beyond argument. A real changeset needs a person to decide
 * what the correct findings were, and that decision is itself the judgement
 * being measured — so the scores would only ever be as good as the labelling.
 * Here the breach is planted, so "did it find it" has a fact for an answer.
 *
 * What the fixture cannot tell you is whether planted breaches resemble real
 * ones. They are cleaner: one rule, one file, no surrounding noise. Treat a
 * good score as evidence the judge is not broken, not as evidence it is good.
 */
import { makeGitFixture, type GitFixture } from '@osdlc/typed-git/testing'

import type { EvalCase } from './score.ts'

/**
 * Rules chosen to be checkable without taste.
 *
 * A rule like "keep functions small" cannot be scored, because two careful
 * readers disagree about it — and a case built on one measures the case
 * author's opinion, not the judge. Every rule here has a fact for an answer.
 */
const ROOT_RULES = `# Project rules

- Never use the \`any\` type. Give a real type, or \`unknown\` plus a narrowing
  check at the point of use.
- Shell commands go through \`run()\` in \`lib/exec.ts\`. Never import
  \`node:child_process\` directly.
- Every exported function carries a doc comment saying what it does.
`

const SRC_RULES = `# src/ rules

- Modules under \`src/\` must not import from \`test/\`. Test helpers belong to
  the suite, and importing one into shipped code ships it.
`

/** Files present before the changeset — context, not part of the diff. */
const BASELINE: Record<string, string> = {
  'CLAUDE.md': ROOT_RULES,
  'src/CLAUDE.md': SRC_RULES,
  'lib/exec.ts': `/** Run a command through the one seam that spawns processes. */
export function run(argv: string[]): string {
  return argv.join(" ");
}
`,
  'test/helpers.ts': `/** Build a throwaway fixture for a test. */
export function makeFixture(): { summary: string } {
  return { summary: "fixture" };
}
`,
  'src/existing.ts': `/** Return the library version. */
export function version(): string {
  return "0.1.0";
}
`,
}

/**
 * The changeset under judgement.
 *
 * Three planted breaches, two near-misses, one plainly clean file. The
 * near-misses carry the weight: any judge scores well on the breaches by
 * reporting everything, and only a file that reads as guilty while complying
 * separates one that follows the code from one that greps.
 */
const CHANGESET: Record<string, string> = {
  // BREACH — the `any` rule, as plainly as it can be stated.
  'src/parse.ts': `/** Parse a config blob into a settings object. */
export function parse(input: any): Record<string, unknown> {
  return { ...input };
}
`,

  // BREACH — the command-seam rule.
  'src/shell.ts': `import { execSync } from "node:child_process";

/** Build one target and return whatever the build printed. */
export function build(target: string): string {
  return execSync(\`make \${target}\`).toString();
}
`,

  // BREACH — the nested src/ rule. Governed by src/CLAUDE.md, not the root.
  'src/report.ts': `import { makeFixture } from "../test/helpers.ts";

/** Summarise the current run. */
export function report(): string {
  return makeFixture().summary;
}
`,

  // NEAR-MISS — says "any" twice in prose and is correctly typed `unknown`.
  // A judge matching the word rather than the type flags this.
  'src/describe.ts': `/**
 * Render a value for a log line.
 *
 * Accepts any shape the logger can stringify, so the parameter is \`unknown\`
 * and narrows at the point of use rather than naming any particular union.
 */
export function describeValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "";
}
`,

  // NEAR-MISS — names `node:child_process` in a comment explaining that it
  // deliberately does NOT import it, and goes through the seam instead.
  'src/serve.ts': `import { run } from "../lib/exec.ts";

/**
 * Start the dev server.
 *
 * Goes through \`run()\` rather than importing \`node:child_process\` here, so
 * the seam stays the only place in the tree that spawns a process.
 */
export function startServer(port: number): string {
  return run(["dev-server", "--port", String(port)]);
}
`,

  // CLEAN — nothing interesting, to confirm an ordinary file draws nothing.
  'src/add.ts': `/** Add two numbers. */
export function add(a: number, b: number): number {
  return a + b;
}
`,
}

export interface Fixture {
  repo: GitFixture
  /** Commit the changeset is measured against. */
  base: string
  evalCase: EvalCase
}

/**
 * Build the fixture repository and return it with its known answer.
 *
 * The caller owns cleanup: `fixture.repo.cleanup()`.
 */
export function makeEvalFixture(): Fixture {
  const repo = makeGitFixture()
  const base = repo.commit('baseline: rules and existing code', BASELINE)
  repo.commit('the changeset under judgement', CHANGESET)

  return { repo, base, evalCase: RULE_BREACH_CASE }
}

/**
 * The known answer.
 *
 * Severities are deliberately loose. Each planted breach flatly contradicts a
 * rule, so `violation` is the honest grade — but whether a judge says
 * `violation` or hedges to `tension` is a calibration question, and folding it
 * in here would fail a run that found every breach and graded one gently.
 * Spotting the breach is what this case asserts.
 */
export const RULE_BREACH_CASE: EvalCase = {
  name: 'rule-breaches',
  expected: [
    {
      file: 'src/parse.ts',
      severity: ['violation', 'tension'],
      evidence: 'any',
    },
    {
      file: 'src/shell.ts',
      severity: ['violation', 'tension'],
      evidence: 'child_process',
    },
    {
      file: 'src/report.ts',
      severity: ['violation', 'tension'],
      // Only src/CLAUDE.md forbids this, so finding it also proves the nested
      // rule source was discovered, scoped, and actually applied.
      evidence: 'test/helpers',
    },
  ],
  clean: ['src/describe.ts', 'src/serve.ts', 'src/add.ts'],
}
