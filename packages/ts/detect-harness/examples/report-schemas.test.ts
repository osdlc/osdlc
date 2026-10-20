/** Examples: validating a report, or one of its parts, with the exported schemas. */

import { describe, expect, test } from 'vitest'

import {
  ArtifactSchema,
  AuthSchema,
  ConfigDirSchema,
  DetectModeSchema,
  DiagnosticSchema,
  HarnessCatalogSchema,
  HarnessReportSchema,
  HookSchema,
  HookTrustSchema,
  InstallSchema,
  InstructionSchema,
  MarketplaceSchema,
  McpServerSchema,
  PermissionRuleSchema,
  PermissionsSchema,
  PluginSchema,
  ScopeSchema,
  SourceSchema,
  detect,
  type Artifact,
  type Auth,
  type ConfigDir,
  type Diagnostic,
  type DetectMode,
  type HarnessCatalog,
  type HarnessReport,
  type Hook,
  type HookTrust,
  type Install,
  type Instruction,
  type Marketplace,
  type McpServer,
  type Permissions,
  type PermissionRule,
  type Plugin,
  type Source,
} from '@osdlc/detect-harness'

describe('report schemas', () => {
  test('a catalog parses through its schema, and so does every part of a report', async () => {
    const catalog: HarnessCatalog = HarnessCatalogSchema.parse(
      await detect({ projectRoot: '/path/to/project', mode: 'project' }),
    )
    const report: HarnessReport = HarnessReportSchema.parse(catalog.reports[0])

    const mode: DetectMode = DetectModeSchema.parse(catalog.mode)
    const install: Install = InstallSchema.parse(report.install)
    const auth: Auth = AuthSchema.parse(report.auth)
    const permissions: Permissions = PermissionsSchema.parse(report.permissions)
    const dirs: ConfigDir[] = report.configDirs.map((d) => ConfigDirSchema.parse(d))
    const sources: Source[] = report.sources.map((s) => SourceSchema.parse(s))
    const plugins: Plugin[] = report.plugins.map((p) => PluginSchema.parse(p))
    const marketplaces: Marketplace[] = report.marketplaces.map((m) => MarketplaceSchema.parse(m))
    const skills: Artifact[] = report.skills.map((a) => ArtifactSchema.parse(a))
    const hooks: Hook[] = report.hooks.map((h) => HookSchema.parse(h))
    const servers: McpServer[] = report.mcpServers.map((s) => McpServerSchema.parse(s))
    const rules: PermissionRule[] = report.permissions.rules.map((r) =>
      PermissionRuleSchema.parse(r),
    )
    const instructions: Instruction[] = report.instructions.map((i) => InstructionSchema.parse(i))
    const diagnostics: Diagnostic[] = report.diagnostics.map((d) => DiagnosticSchema.parse(d))

    expect(mode).toBe('project')
    expect(install.probed).toBe(false)
    expect(auth.signedIn).toBeDefined()
    expect(permissions.rules).toEqual(rules)
    expect([dirs, sources, plugins, marketplaces, skills, hooks, servers]).toBeDefined()
    expect([instructions, diagnostics]).toBeDefined()
  })

  test('the small enums', () => {
    const trust: HookTrust = HookTrustSchema.parse('trusted')
    expect(trust).toBe('trusted')
    expect(ScopeSchema.parse('managed')).toBe('managed')
    expect(() => ScopeSchema.parse('elsewhere')).toThrow()
  })
})
