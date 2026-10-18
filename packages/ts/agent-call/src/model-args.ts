import { claudeEffortArgv } from './adapters/claude.js'
import { codexEffortArgv } from './adapters/codex.js'
import { modelFlag } from './adapters/shared.js'

/**
 * A resolved model and effort to hand a tool's CLI; all optional, none validated here.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export interface ModelChoice {
  model?: string | undefined
  effort?: string | undefined
  /**
   * The launch mode the model's provider needs, as flags (codex reaches a
   * local Ollama model only as `--oss --local-provider ollama`). Passed
   * before the model flag.
   */
  via?: readonly string[] | undefined
}

/**
 * Each tool's effort flag, keyed by tool name: the tools whose command line a
 * caller builds itself with a model and an effort. A tool run through an
 * adapter or a template translates its own. pi's `--thinking <level>` takes
 * `off` through `max`, so a level passes through as given.
 */
const EFFORT_ARGV: Record<string, (effort: string) => string[]> = {
  claude: claudeEffortArgv,
  codex: codexEffortArgv,
  pi: (effort) => ['--thinking', effort],
}

/**
 * Why `tool`'s argv cannot take `choice`, or `null` when it can (a tool with
 * nothing asked of it always can). Only claude, codex and pi have model and
 * effort flags wired here; any other tool refuses rather than dropping the
 * choice silently.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function modelArgsRefusal(tool: string, choice: ModelChoice): string | null {
  const via = choice.via ?? []
  if (choice.model === undefined && choice.effort === undefined && via.length === 0) return null
  if (Object.hasOwn(EFFORT_ARGV, tool)) return null
  const asked = [
    ...(via.length > 0 ? [`launch mode '${via.join(' ')}'`] : []),
    ...(choice.model !== undefined ? [`model '${choice.model}'`] : []),
    ...(choice.effort !== undefined ? [`effort '${choice.effort}'`] : []),
  ].join(' and ')
  return `tool '${tool}' has no model or effort flags wired; cannot pass ${asked}`
}

/**
 * The CLI flags that select `choice` for `tool`, using the headless adapters'
 * own flag rules: claude `--model <m> --effort <e>`, codex `--model <m> -c
 * model_reasoning_effort="<e>"`, pi `--model <m> --thinking <e>` (the model as
 * given, `provider/id` included, e.g. `ollama/qwen3:4b`). A launch mode
 * (`choice.via`) goes first: codex `--oss --local-provider ollama --model
 * gemma3:4b`. Empty when nothing is set.
 *
 * @throws {Error} For a tool with no flags wired, naming the tool and what was
 * asked ({@link modelArgsRefusal} gives the same text without throwing).
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function modelArgs(tool: string, choice: ModelChoice): string[] {
  const refusal = modelArgsRefusal(tool, choice)
  if (refusal !== null) throw new Error(refusal)
  // A set field got past the refusal, so `tool` is in EFFORT_ARGV.
  return [
    ...(choice.via ?? []),
    ...(choice.model !== undefined ? modelFlag(choice.model) : []),
    ...(choice.effort !== undefined ? EFFORT_ARGV[tool]!(choice.effort) : []),
  ]
}
