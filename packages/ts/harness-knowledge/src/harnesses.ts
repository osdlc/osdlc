/**
 * The short harness ids other packages use (`claude`, `codex`, `copilot`) against the slugs in
 * the knowledge file (`claude-code`, `codex`, `copilot-cli`), and the environment variables the
 * file states for credentials and for the config folder.
 */
import { fact } from './query.js'

/**
 * Short id to knowledge slug. Covers every id in detect-harness `BUILTIN_HARNESSES`
 * (`src/harnesses.ts`) and every agent-call `AgentName` (`src/spec.ts`).
 */
export const HARNESS_SLUGS = Object.freeze({
  antigravity: 'antigravity',
  claude: 'claude-code',
  codex: 'codex',
  copilot: 'copilot-cli',
  cursor: 'cursor',
  deepseek: 'dsh',
  droid: 'droid',
  opencode: 'opencode',
  pi: 'pi',
  qwen: 'qwen-code',
} as const)

/** A short harness id, such as `claude`. */
export type HarnessId = keyof typeof HARNESS_SLUGS

/** A knowledge slug a short id maps to, such as `claude-code`. */
export type HarnessSlug = (typeof HARNESS_SLUGS)[HarnessId]

function isId(name: string): name is HarnessId {
  return Object.hasOwn(HARNESS_SLUGS, name)
}

/** The knowledge slug for a short id; a slug resolves to itself; undefined for anything else. */
export function slugFor(harness: string): HarnessSlug | undefined {
  if (isId(harness)) return HARNESS_SLUGS[harness]
  return Object.values(HARNESS_SLUGS).find((slug) => slug === harness)
}

/** The short id for a knowledge slug; an id resolves to itself; undefined for anything else. */
export function idFor(harness: string): HarnessId | undefined {
  if (isId(harness)) return harness
  return (Object.keys(HARNESS_SLUGS) as HarnessId[]).find((id) => HARNESS_SLUGS[id] === harness)
}

/**
 * The names of the environment variables that carry the harness's credentials. Weak and
 * disputed values are skipped, as in {@link fact}. Empty when the harness is unknown or the
 * file states none.
 *
 * @throws `AmbiguousValue` when two values fit equally well, as `fact` does.
 */
export function credentialEnv(harness: string): string[] {
  const vars = fact(slugFor(harness) ?? harness, 'config/credentials-env')?.['vars']
  if (!Array.isArray(vars)) return []
  return vars
    .map((v: unknown) => (v as { name?: unknown } | null)?.name)
    .filter((name): name is string => typeof name === 'string')
}

/**
 * The variable that moves the harness's config folder. Weak and disputed values are skipped, as
 * in {@link fact}. Undefined when the harness is unknown, the file states none, or the file says
 * the variable moves the folder only partly (`supported` is `partial` or `false`).
 *
 * @throws `AmbiguousValue` when two values fit equally well, as `fact` does.
 */
export function configDirEnv(harness: string): string | undefined {
  const value = fact(slugFor(harness) ?? harness, 'config/config-dir-env')
  if (value?.['supported'] === false || value?.['supported'] === 'partial') return undefined
  const name = value?.['var']
  return typeof name === 'string' ? name : undefined
}
