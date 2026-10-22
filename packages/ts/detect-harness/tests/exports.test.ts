/**
 * The public surface: every export of every entry point is named here, so
 * adding or removing one fails this test and shows up in review.
 */

import { describe, expect, test } from 'vitest'

import * as root from '../src/index.ts'
import * as locations from '../src/locations.ts'
import * as model from '../src/model/index.ts'

const LOCATION_EXPORTS = [
  'LOCATIONS',
  'SCOPES',
  'defaultSystemRoot',
  'resolveBase',
  'resolveBases',
  'resolveConfigDir',
  'resolveLocations',
  'resolveTemplate',
]

const MODEL_EXPORTS = [
  'CapabilityKindSchema',
  'HARNESS_MODEL_VERSION',
  'HarnessCapabilitySchema',
  'HarnessDocumentSchema',
  'HarnessHookSchema',
  'HarnessMcpServerSchema',
  'HarnessMetadataSchema',
  'HarnessModelSchema',
  'HarnessPermissionsSchema',
  'HarnessResourceSchema',
  'McpTransportSchema',
  'capabilitiesOfKind',
  'countResources',
]

describe('public exports', () => {
  test('the root entry', () => {
    expect(Object.keys(root).sort()).toEqual(
      [
        // detect
        'detect',
        'parseVersion',
        'selectProviders',
        'builtinProviders',
        'current',
        'BUILTIN_HARNESSES',
        'HARNESS_ALIASES',
        'harnessId',
        'REDACTED',
        'codexHookHash',
        'snakeEvent',
        'which',
        // report schemas
        'ArtifactSchema',
        'AuthSchema',
        'ConfigDirSchema',
        'DetectModeSchema',
        'DiagnosticSchema',
        'HarnessCatalogSchema',
        'HarnessReportSchema',
        'HookSchema',
        'HookTrustSchema',
        'InstallSchema',
        'InstructionSchema',
        'MarketplaceSchema',
        'McpServerSchema',
        'PermissionRuleSchema',
        'PermissionsSchema',
        'PluginSchema',
        'ScopeSchema',
        'SourceSchema',
        ...LOCATION_EXPORTS,
      ].sort(),
    )
  })

  test('./locations', () => {
    expect(Object.keys(locations).sort()).toEqual([...LOCATION_EXPORTS].sort())
  })

  test('./model', () => {
    expect(Object.keys(model).sort()).toEqual(
      [
        ...MODEL_EXPORTS,
        'REDACTED',
        'readClaudeControlPlane',
        'readPlugin',
        'readPluginControlPlane',
      ].sort(),
    )
  })
})
