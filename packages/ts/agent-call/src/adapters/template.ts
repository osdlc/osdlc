import type { ModelChoice } from '../model-args.js'
import { customAdapter } from './custom.js'
import type { AgentAdapter } from './types.js'

/**
 * Options for {@link templateAdapter}.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export interface TemplateAdapterOptions {
  /** Adapter name, reported as `PlannedCall.agent`. */
  name: string
  /** Binary to spawn. */
  binary: string
  /**
   * Arguments after the binary. `{prompt}`, `{model}` and `{effort}` are
   * slots: an argument equal to one is replaced whole by its value; any other
   * argument passes as written, so a value never lands inside a larger one.
   */
  args: readonly string[]
  /** Whether the prompt fills the `{prompt}` slot or goes on stdin. */
  promptVia: 'argv' | 'stdin'
}

/**
 * Why a template with `args` cannot take `choice`, or `null` when it can: a
 * model or effort needs its slot, and a slot needs a value.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function templateRefusal(args: readonly string[], choice: ModelChoice): string | null {
  for (const [field, slot] of [
    ['model', '{model}'],
    ['effort', '{effort}'],
  ] as const) {
    const value = choice[field]
    const has = args.includes(slot)
    if (value !== undefined && !has) {
      return `its headless template has no ${slot} slot; cannot pass ${field} '${value}'`
    }
    if (value === undefined && has) {
      return `its headless template's ${slot} slot needs a ${field}, and none was resolved`
    }
  }
  return null
}

/**
 * A headless call through an argument template for any one-shot CLI: the slots
 * are filled and the prompt goes in `{prompt}` or on stdin. Context, system
 * prompt and schema are folded into the prompt; `permissions.mode` is noted
 * as dropped. Any other field the template cannot express (budget, session,
 * mcp, plugins, dirs, tool rules) is left out with no note, as
 * {@link customAdapter} does.
 *
 * @throws {Error} From `plan` (so from `planCall` and `callAgent`) when the
 * spec's model or effort does not fit the slots ({@link templateRefusal}), when
 * `promptVia` is `'argv'` and `args` has no `{prompt}` slot, or when it is
 * `'stdin'` and `args` has one.
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function templateAdapter(options: TemplateAdapterOptions): AgentAdapter {
  return customAdapter({
    name: options.name,
    binary: options.binary,
    promptVia: options.promptVia,
    args: (spec, prompt) => {
      const hasPromptSlot = options.args.includes('{prompt}')
      if (options.promptVia === 'argv' && !hasPromptSlot) {
        throw new Error(`${options.name}: promptVia 'argv' needs a {prompt} slot in args`)
      }
      if (options.promptVia === 'stdin' && hasPromptSlot) {
        throw new Error(`${options.name}: promptVia 'stdin' cannot have a {prompt} slot in args`)
      }
      const refusal = templateRefusal(options.args, spec)
      if (refusal !== null) throw new Error(`${options.name}: ${refusal}`)
      const slots: Record<string, string | undefined> = {
        '{prompt}': prompt,
        '{model}': spec.model,
        '{effort}': spec.effort,
      }
      return options.args.map((arg) => (Object.hasOwn(slots, arg) ? slots[arg]! : arg))
    },
  })
}
