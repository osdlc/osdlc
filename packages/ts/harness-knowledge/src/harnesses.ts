/**
 * The short harness ids other packages use (`claude`, `codex`, `copilot`) against the slugs in
 * the knowledge file (`claude-code`, `codex`, `copilot-cli`), and the environment variables the
 * file states for credentials and for the config folder.
 */
import { fact } from './query.js'

/**
 * Short id to knowledge slug: the ids of detect-harness's built-in harnesses and agent-call's
 * agent names that the file has a harness for.
 */
export const HARNESS_SLUGS: Readonly<Record<string, string>> = {
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
}

/** The knowledge slug for a short id; a slug resolves to itself; undefined for anything else. */
export function slugFor(harness: string): string | undefined {
  if (Object.hasOwn(HARNESS_SLUGS, harness)) return HARNESS_SLUGS[harness]
  return Object.values(HARNESS_SLUGS).includes(harness) ? harness : undefined
}

/** The short id for a knowledge slug; an id resolves to itself; undefined for anything else. */
export function idFor(harness: string): string | undefined {
  if (Object.hasOwn(HARNESS_SLUGS, harness)) return harness
  return Object.keys(HARNESS_SLUGS).find((id) => HARNESS_SLUGS[id] === harness)
}

/**
 * The names of the environment variables that carry the harness's credentials, as the file states
 * them at moderate strength or better. Empty when the harness is unknown or the file states none.
 */
export function credentialEnv(harness: string): string[] {
  const vars = fact(slugFor(harness) ?? harness, 'config/credentials-env')?.['vars']
  if (!Array.isArray(vars)) return []
  return vars
    .map((v: unknown) => (v as { name?: unknown } | null)?.name)
    .filter((name): name is string => typeof name === 'string')
}

/**
 * The variable that moves the harness's config folder, or undefined when the harness is unknown
 * or the file states none.
 */
export function configDirEnv(harness: string): string | undefined {
  const name = fact(slugFor(harness) ?? harness, 'config/config-dir-env')?.['var']
  return typeof name === 'string' ? name : undefined
}
