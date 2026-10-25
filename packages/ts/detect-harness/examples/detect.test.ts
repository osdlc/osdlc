/** Examples: `detect()`, its options and the report it returns. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  REDACTED,
  detect,
  parseVersion,
  selectProviders,
  which,
  type DetectOptions,
} from '@osdlc/detect-harness'

describe('detect', () => {
  test('the README example', async () => {
    const catalog = await detect({ projectRoot: '/path/to/project' })
    for (const report of catalog.reports) {
      report.harness // "claude", "codex", ...
      report.status // "ok" when anything was found, else "absent" (or "error")
      report.install // { found, path, how, version }
      report.mcpServers // env and header values read "<redacted>"
    }

    expect(catalog.reports).toHaveLength(6)
  })

  test('a project with an MCP server: values are redacted, and project mode reads the project only', async () => {
    const root = mkdtempSync(join(tmpdir(), 'detect-harness-example-'))
    try {
      const project = join(root, 'project')
      mkdirSync(project, { recursive: true })
      writeFileSync(
        join(project, '.mcp.json'),
        JSON.stringify({ mcpServers: { api: { command: 'api', env: { KEY: 'secret' } } } }),
      )
      const options: DetectOptions = { projectRoot: project, mode: 'project', only: ['claude'] }
      const catalog = await detect(options)
      const [claude] = catalog.reports
      expect(claude!.mcpServers[0]!.env).toEqual({ KEY: REDACTED })
      expect(claude!.install.probed).toBe(false)

      const kept = await detect({ ...options, includeValues: true })
      expect(kept.reports[0]!.mcpServers[0]!.env).toEqual({ KEY: 'secret' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('the skills a repository ships, for a task catalog', async () => {
    const root = mkdtempSync(join(tmpdir(), 'detect-harness-example-'))
    try {
      const projectRoot = join(root, 'project')
      mkdirSync(join(projectRoot, '.claude', 'skills', 'review'), { recursive: true })
      writeFileSync(
        join(projectRoot, '.claude', 'skills', 'review', 'SKILL.md'),
        '---\ndescription: Review a PR.\nargument-hint: "[pr-number]"\n---\n\nReview it.\n',
      )
      const catalog = await detect({ projectRoot, mode: 'project' })
      const skills = catalog.reports.flatMap((r) => r.skills)
      // [{ name: 'review', description: 'Review a PR.', argumentHint: '[pr-number]', origin: 'project', ... }]
      expect(skills).toEqual([
        expect.objectContaining({
          name: 'review',
          description: 'Review a PR.',
          argumentHint: '[pr-number]',
          origin: 'project',
        }),
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('selectProviders applies only and exclude', () => {
    const ids = selectProviders({ only: ['claude', 'codex'], exclude: ['codex'] }).map((p) => p.id)
    expect(ids).toEqual(['claude'])
  })
})

describe('install helpers', () => {
  test('parseVersion takes the first version-shaped token', () => {
    expect(parseVersion('claude 2.1.283 (build)')).toBe('2.1.283')
    expect(parseVersion('no version here')).toBeNull()
  })

  test('which looks a binary up on PATH, without running it', () => {
    expect(which('definitely-not-installed-xyz', { PATH: '/usr/bin' })).toBeNull()
  })
})
