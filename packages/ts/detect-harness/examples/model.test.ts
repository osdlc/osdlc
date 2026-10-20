/** Examples: reading one plugin folder into a typed model (experimental). */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  CapabilityKindSchema,
  HARNESS_MODEL_VERSION,
  HarnessCapabilitySchema,
  HarnessDocumentSchema,
  HarnessHookSchema,
  HarnessMcpServerSchema,
  HarnessMetadataSchema,
  HarnessModelSchema,
  HarnessPermissionsSchema,
  HarnessResourceSchema,
  McpTransportSchema,
  REDACTED,
  capabilitiesOfKind,
  countResources,
  readClaudeControlPlane,
  readPlugin,
  readPluginControlPlane,
  type ClaudeControlPlane,
  type ControlPlaneOptions,
  type CapabilityKind,
  type HarnessCapability,
  type HarnessDocument,
  type HarnessHook,
  type HarnessMcpServer,
  type HarnessMetadata,
  type HarnessModel,
  type HarnessPermissions,
  type HarnessResource,
  type McpTransport,
  type ReadPluginOptions,
} from '@osdlc/detect-harness/model'

describe('readPlugin', () => {
  test('the README example', () => {
    const model = readPlugin('/path/to/plugin')

    expect(model.metadata.name).toBe('harness')
  })

  test('a plugin folder with one skill and one MCP server', () => {
    const root = mkdtempSync(join(tmpdir(), 'detect-harness-example-'))
    try {
      mkdirSync(join(root, '.claude-plugin'), { recursive: true })
      mkdirSync(join(root, 'skills', 'review'), { recursive: true })
      writeFileSync(
        join(root, '.claude-plugin', 'plugin.json'),
        JSON.stringify({
          name: 'demo',
          version: '1.0.0',
          mcpServers: { api: { command: 'api', env: { KEY: 'secret' } } },
        }),
      )
      writeFileSync(join(root, 'skills', 'review', 'SKILL.md'), '---\nname: review\n---\nBody\n')

      const options: ReadPluginOptions = { documentsDir: 'conventions' }
      const model: HarnessModel = readPlugin(root, options)
      expect(HarnessModelSchema.parse(model).modelVersion).toBe(HARNESS_MODEL_VERSION)
      expect(model.metadata.name).toBe('demo')
      expect(HarnessMetadataSchema.parse(model.metadata).name).toBe('demo')
      expect(countResources(model)).toBeGreaterThanOrEqual(0)
      expect(
        capabilitiesOfKind(model, CapabilityKindSchema.parse('skill')).map((c) => c.name),
      ).toEqual(['review'])
      expect(HarnessCapabilitySchema.parse(model.capabilities[0]).name).toBe('review')
      expect(model.mcpServers[0]!.env).toEqual({ KEY: REDACTED })
      expect(HarnessMcpServerSchema.parse(model.mcpServers[0]).name).toBe('api')
      expect(McpTransportSchema.parse('stdio')).toBe('stdio')
      expect(HarnessPermissionsSchema.parse(model.permissions).allow).toEqual([])
      expect([model.documents.map((d) => HarnessDocumentSchema.parse(d))]).toBeDefined()
      expect([model.hooks.map((h) => HarnessHookSchema.parse(h))]).toBeDefined()
      expect(HarnessResourceSchema.safeParse({}).success).toBe(false)

      const metadata: HarnessMetadata = model.metadata
      const kind: CapabilityKind = 'command'
      const capability: HarnessCapability = model.capabilities[0]!
      const resources: HarnessResource[] = capability.resources
      const hooks: HarnessHook[] = model.hooks
      const server: HarnessMcpServer = model.mcpServers[0]!
      const transport: McpTransport = server.transport
      const permissions: HarnessPermissions = model.permissions
      const documents: HarnessDocument[] = model.documents
      expect([metadata, kind, resources, hooks, transport, permissions, documents]).toBeDefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('control plane', () => {
  test('settings and MCP sources are read on their own', () => {
    const root = mkdtempSync(join(tmpdir(), 'detect-harness-example-'))
    try {
      mkdirSync(join(root, '.claude'), { recursive: true })
      writeFileSync(
        join(root, '.claude', 'settings.json'),
        JSON.stringify({ permissions: { allow: ['Read'] } }),
      )
      const options: ControlPlaneOptions = { includeValues: false }
      const plane: ClaudeControlPlane = readClaudeControlPlane(root, options)
      expect(plane.permissions.allow).toEqual(['Read'])
      expect(readPluginControlPlane(root, {}, options).permissions.allow).toEqual(['Read'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
