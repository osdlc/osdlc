/**
 * The harness model: a JSON-safe description of a coding-agent plugin.
 *
 * A "harness" is the control-plane surface a coding agent runs inside: its
 * invocable capabilities, the context it carries, the tools it may use, the MCP
 * servers it can reach, the permissions that gate it, and the lifecycle hooks
 * that fire around it. This module holds the shape of that surface. It is read
 * from a Claude Code plugin folder by {@link readPlugin} in
 * `./derive.ts`.
 *
 * The model is a plain, JSON-serializable Zod shape, so it also serves as its
 * own interchange form. Zod is a peer dependency: the schemas are public, and a
 * consumer that nests them in its own schemas needs one copy of Zod.
 *
 * Runtime-agnostic: pure schema, no `node:`/Bun coupling.
 */

import { z } from 'zod'

/** Schema version of the model. `HarnessModelSchema` accepts only this value. */
export const HARNESS_MODEL_VERSION = '2' as const

/** Plugin identity, from the plugin manifest. */
export const HarnessMetadataSchema = z.object({
  /** Machine name / plugin id (kebab), e.g. `"sdlc"`. */
  name: z.string().min(1),
  /** Semver-ish version string, or `"unknown"`. */
  version: z.string().min(1),
  /** One-paragraph human description. */
  description: z.string().default(''),
  /** Author name, when the source manifest declares one. */
  author: z.string().optional(),
  /** Project homepage / repo URL, when declared. */
  homepage: z.string().optional(),
})
export type HarnessMetadata = z.infer<typeof HarnessMetadataSchema>

/**
 * A file co-located with a capability (a helper script, a fixture). Contents are
 * carried as text — the surface is markdown + source scripts, never binary —
 * with the executable bit preserved so a launcher stays runnable.
 */
export const HarnessResourceSchema = z.object({
  /** Path RELATIVE to the capability's own directory (e.g. `"start_task.ts"`). */
  path: z.string().min(1),
  /** File contents, verbatim. */
  contents: z.string(),
  /** True when the source file carried a user-executable bit. */
  executable: z.boolean().default(false),
})
export type HarnessResource = z.infer<typeof HarnessResourceSchema>

/**
 * A capability's kind. `skill` is a model-invoked capability; `command` is a
 * user-invoked one (a `/name` slash command). Claude Code separates the two, so
 * the model keeps the distinction.
 */
export const CapabilityKindSchema = z.enum(['skill', 'command'])
export type CapabilityKind = z.infer<typeof CapabilityKindSchema>

/**
 * An invocable capability. `name` is the kebab id (and the invocation leaf):
 * `instructions` is the markdown the agent runs against, `allowedTools` the
 * permitted tools, `argumentHint` the CLI-style hint for commands that take
 * arguments. `annotations` holds the frontmatter keys the model has no field for.
 */
export const HarnessCapabilitySchema = z.object({
  /** Kebab id, unique within the harness (`"task-work"`). */
  name: z.string().min(1),
  /** skill (model-invoked) or command (user-invoked). */
  kind: CapabilityKindSchema.default('skill'),
  /** Invocation summary — what it does, when to reach for it. */
  description: z.string().default(''),
  /** Markdown instruction body the agent runs against. */
  instructions: z.string().default(''),
  /** Tools the capability is permitted to use. */
  allowedTools: z.array(z.string()).default([]),
  /** CLI-style argument hint, for commands that take arguments. */
  argumentHint: z.string().optional(),
  /** Co-located helper files, by capability-relative path. */
  resources: z.array(HarnessResourceSchema).default([]),
  /** Frontmatter keys with no field of their own (e.g. `need_human_review`). */
  annotations: z.record(z.string(), z.unknown()).default({}),
})
export type HarnessCapability = z.infer<typeof HarnessCapabilitySchema>

/**
 * A lifecycle hook: a shell `action` fired on `event` (e.g. `PreToolUse`,
 * `Stop`, `SessionStart`), optionally gated by a `matcher` (a tool-name / event
 * pattern).
 */
export const HarnessHookSchema = z.object({
  /** Lifecycle event name, in Claude Code's own spelling. */
  event: z.string().min(1),
  /** Optional matcher (tool-name / pattern) scoping when the hook fires. */
  matcher: z.string().optional(),
  /** The shell command to run. */
  action: z.string().min(1),
})
export type HarnessHook = z.infer<typeof HarnessHookSchema>

/** MCP transport kind. */
export const McpTransportSchema = z.enum(['stdio', 'http', 'sse'])
export type McpTransport = z.infer<typeof McpTransportSchema>

/**
 * An MCP server the harness can reach. `stdio` servers carry `command`/`args`/
 * `env`; `http`/`sse` servers carry `url` (+ optional `headers`). Nothing checks
 * that a server has the fields of its transport.
 *
 * The readers replace `env` and `headers` values, and the user part and query
 * values of `url`, with `"<redacted>"` unless asked to keep them.
 */
export const HarnessMcpServerSchema = z.object({
  /** Server id, unique within the harness. */
  name: z.string().min(1),
  transport: McpTransportSchema.default('stdio'),
  /** stdio: the binary to launch. */
  command: z.string().optional(),
  /** stdio: launch arguments. */
  args: z.array(z.string()).default([]),
  /** stdio: environment overrides (values redacted by default). */
  env: z.record(z.string(), z.string()).default({}),
  /** http/sse: the endpoint URL. */
  url: z.string().optional(),
  /** http/sse: request headers (values redacted by default). */
  headers: z.record(z.string(), z.string()).default({}),
})
export type HarnessMcpServer = z.infer<typeof HarnessMcpServerSchema>

/**
 * Tool permission rule sets: the `allow`/`deny`/`ask` lists of Claude settings.
 * Rules are tool patterns (`"Bash(git *)"`). Rules from every settings scope are
 * kept.
 */
export const HarnessPermissionsSchema = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  ask: z.array(z.string()).default([]),
})
export type HarnessPermissions = z.infer<typeof HarnessPermissionsSchema>

/**
 * A shared context document the capabilities draw on, read from a documents
 * folder (`conventions/` by default).
 */
export const HarnessDocumentSchema = z.object({
  /** Path under the documents folder, without `.md` (`"commit-messages"`). */
  name: z.string().min(1),
  /** Full markdown document, verbatim. */
  body: z.string().default(''),
})
export type HarnessDocument = z.infer<typeof HarnessDocumentSchema>

/**
 * The whole model: what {@link readPlugin} produces from a Claude Code
 * plugin folder.
 */
export const HarnessModelSchema = z.object({
  /** Model schema version — see {@link HARNESS_MODEL_VERSION}. */
  modelVersion: z.literal(HARNESS_MODEL_VERSION).default(HARNESS_MODEL_VERSION),
  metadata: HarnessMetadataSchema,
  /** Capabilities, sorted by `name` for a deterministic emit. */
  capabilities: z.array(HarnessCapabilitySchema).default([]),
  /** Lifecycle hooks. */
  hooks: z.array(HarnessHookSchema).default([]),
  /** MCP servers, sorted by `name`. */
  mcpServers: z.array(HarnessMcpServerSchema).default([]),
  /** Tool permissions. */
  permissions: HarnessPermissionsSchema.default({ allow: [], deny: [], ask: [] }),
  /** Shared context documents, sorted by `name`. */
  documents: z.array(HarnessDocumentSchema).default([]),
})
export type HarnessModel = z.infer<typeof HarnessModelSchema>

/** Total resource-file count across every capability — a cheap summary stat. */
export function countResources(model: HarnessModel): number {
  return model.capabilities.reduce((n, c) => n + c.resources.length, 0)
}

/** Capabilities of a given kind, in model order. */
export function capabilitiesOfKind(model: HarnessModel, kind: CapabilityKind): HarnessCapability[] {
  return model.capabilities.filter((c) => c.kind === kind)
}
