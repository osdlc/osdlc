// The probes for a detection report live in the host; the schema lives here,
// browser-safe, so a UI imports the same type the host emits.
import { z } from 'zod'

import { PROVIDER_KINDS, type Trait } from './catalogue/types.ts'
import { TRAITS } from './ref.ts'

// TRAITS must equal the catalogue's Trait: a missing or extra member fails to compile.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const traitsMatch: Exact<(typeof TRAITS)[number], Trait> = true
void traitsMatch

/** `true` or `false` when the probe could tell; `'unknown'` when it could not. */
const TriState = z.union([z.boolean(), z.literal('unknown')])

export const DetectServesSchema = z.object({
  provider: z.string(),
  /** The launch mode that reaches this provider, when one is needed. */
  via: z.string().optional(),
})

/**
 * Schema for one installed coding-agent tool in a {@link DetectReport}: whether it was found,
 * where, its version, sign-in evidence and the providers the catalogue says it serves.
 *
 * @experimental
 */
export const DetectToolSchema = z.object({
  /** The catalogue tool id. */
  tool: z.string(),
  /** The CLI name probed on PATH. */
  binary: z.string(),
  found: z.boolean(),
  /** Absolute path of the executable (PATH) or the app bundle; null when not found. */
  path: z.string().nullable(),
  /** Parsed from `--version`; null when not found, no CLI to ask, or the call failed or timed out. */
  version: z.string().nullable(),
  /** How the tool was found; null when not found. */
  how: z.enum(['PATH', 'app bundle']).nullable(),
  /** `true` when local credentials are present; `'unknown'` otherwise (and always for a tool not found). `false` is reserved for a probe that can prove signed-out. */
  signedIn: TriState,
  /** The file path or environment variable name the verdict rests on, never a value; null when `unknown`. */
  signInEvidence: z.string().nullable(),
  /** pi only: the providers pi has credentials for (names, never keys); null for every other tool and when pi's auth file is missing or unreadable. */
  providers: z.array(z.string()).nullable(),
  /** The providers the catalogue says this tool serves. */
  serves: z.array(DetectServesSchema),
  /** The tool version the catalogue row was checked against; null when the row names none. */
  catalogueVersion: z.string().nullable(),
})
/**
 * One installed tool in a {@link DetectReport}; see {@link DetectToolSchema}.
 *
 * @experimental
 */
export type DetectTool = z.infer<typeof DetectToolSchema>

export const DetectProviderSchema = z.object({
  id: z.string(),
  kind: z.enum(PROVIDER_KINDS),
  /** The endpoint's host (and port), never its path or credentials; null when the catalogue names none. */
  endpointHost: z.string().nullable(),
  /** A local runtime's server answered; `'unknown'` for a provider that is never contacted. */
  reachable: TriState,
  /** The environment variable named for the key; null when the provider takes none. */
  keyEnv: z.string().nullable(),
  /** Whether `keyEnv` is set and non-empty, never its value; null when there is no `keyEnv`. */
  keySet: z.boolean().nullable(),
})
/**
 * One model provider in a {@link DetectReport}; see {@link DetectProviderSchema}.
 *
 * @experimental
 */
export type DetectProvider = z.infer<typeof DetectProviderSchema>

export const DetectModelSchema = z.object({
  /** The name the runtime lists the model under. */
  name: z.string(),
  /** The model's context length in tokens, as the runtime reports it; null when it reports none. */
  context: z.number().int().positive().nullable(),
  /** `local` always; `embedding` or `agent` only when the runtime says so. */
  traits: z.array(z.enum(TRAITS)),
})
/**
 * One model a local runtime holds, in a {@link DetectReport}; see {@link DetectModelSchema}.
 *
 * @experimental
 */
export type DetectModel = z.infer<typeof DetectModelSchema>

/**
 * Schema for one local model runtime (`ollama` or `lmstudio`) in a {@link DetectReport}: whether
 * it was found and is serving, and the models it holds.
 *
 * @experimental
 */
export const DetectRuntimeSchema = z.object({
  runtime: z.enum(['ollama', 'lmstudio']),
  found: z.boolean(),
  /** Absolute CLI path (Ollama) or the local API base URL (LM Studio); null when not found. */
  where: z.string().nullable(),
  /** Parsed from `ollama --version`; null for LM Studio and when the call failed. */
  version: z.string().nullable(),
  /** How the runtime was found; null when not found. */
  how: z.enum(['PATH', 'local API']).nullable(),
  /** Whether the runtime's local server answered. */
  serving: z.boolean(),
  /** The models it holds. Empty when none are pulled or the runtime could not be asked. */
  models: z.array(DetectModelSchema),
})
/**
 * One local model runtime in a {@link DetectReport}; see {@link DetectRuntimeSchema}.
 *
 * @experimental
 */
export type DetectRuntime = z.infer<typeof DetectRuntimeSchema>

export const DetectHostSchema = z.object({
  host: z.string(),
  found: z.boolean(),
  /** What the probe checked. */
  checked: z.string(),
  /** Set when the host does not support this OS ("not supported on <os>"); `found` is then false. */
  unsupported: z.string().optional(),
})
/**
 * One session host in a {@link DetectReport}; see {@link DetectHostSchema}.
 *
 * @experimental
 */
export type DetectHost = z.infer<typeof DetectHostSchema>

/**
 * Schema for a detection report a host prints: the installed tools with their catalogue facts, the
 * providers, the local runtimes and their models, and the session hosts. It carries no secrets: a
 * provider's key is reported as the variable's name and whether it is set.
 *
 * @experimental
 */
export const DetectReportSchema = z.object({
  tools: z.array(DetectToolSchema),
  providers: z.array(DetectProviderSchema),
  runtimes: z.array(DetectRuntimeSchema),
  hosts: z.array(DetectHostSchema),
  /**
   * The first found host in preference order, which a host would write as its default; null when
   * none is found.
   */
  suggestedHost: z.string().nullable(),
  /** Whether the host wrote its default session host as a result of the detection. */
  hostDefaultWritten: z.boolean(),
  /** Why the default session host was left alone, when the detection did not change it. */
  hostDefaultNotes: z.array(z.string()),
})
/**
 * A detection report as {@link DetectReportSchema} parses it.
 *
 * @experimental
 */
export type DetectReport = z.infer<typeof DetectReportSchema>
