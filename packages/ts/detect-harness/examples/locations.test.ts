/** Examples: the location table and its resolvers (experimental). */

import { describe, expect, test } from 'vitest'

import {
  LOCATIONS,
  SCOPES,
  defaultSystemRoot,
  resolveBase,
  resolveBases,
  resolveConfigDir,
  resolveLocations,
  resolveTemplate,
  type BaseDir,
  type EnvOverride,
  type HarnessLocations,
  type LocationContext,
  type LocationPath,
  type LocationRole,
  type PlatformTemplate,
  type ResolvedDir,
  type ResolvedLocation,
  type Scope,
} from '@osdlc/detect-harness/locations'

describe('locations', () => {
  test('the README example', () => {
    resolveConfigDir('codex', { home: '/home/me', env: process.env }) // "/home/me/.codex"

    expect(resolveConfigDir('codex', { home: '/home/me', env: {} })).toBe('/home/me/.codex')
  })

  test('the table names the files each harness keeps', () => {
    expect(SCOPES).toEqual(['managed', 'user', 'project', 'local'])
    expect(LOCATIONS.claude.binary).toBe('claude')
  })

  test('resolvers take a context with the home folder and the environment', () => {
    const ctx: LocationContext = { home: '/home/me', env: { CODEX_HOME: '/data/codex' } }
    expect(resolveBase('codex', 'config', ctx).path).toBe('/data/codex')
    expect(resolveBases('codex', ctx).map((b) => b.name)).toContain('config')
    expect(resolveTemplate(null, '~/x', ctx)).toBe('/home/me/x')
    expect(resolveLocations('codex', ctx).length).toBeGreaterThan(0)
    expect(defaultSystemRoot('linux', {})).toBe('/')
  })

  test('the table is made of typed entries', () => {
    const harness: HarnessLocations = LOCATIONS.claude
    const base: BaseDir = harness.bases['config']!
    const path: LocationPath = harness.paths[0]!
    const role: LocationRole = path.role
    const scope: Scope = path.scope
    const override: EnvOverride | undefined = base.env?.[0]
    const template: PlatformTemplate | string = base.default
    const dir: ResolvedDir = resolveBase('claude', 'config', { home: '/h', env: {} })
    const located: ResolvedLocation[] = resolveLocations('claude', { home: '/h', env: {} })
    expect([role, scope, override, template, dir.name, located.length]).toBeDefined()
  })
})
