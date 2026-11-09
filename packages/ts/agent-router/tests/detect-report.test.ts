import { describe, expect, test } from 'vitest'

import { DetectReportSchema, type DetectReport } from '../src/index.ts'

const report: DetectReport = {
  tools: [
    {
      tool: 'claude',
      binary: 'claude',
      found: true,
      path: '/usr/local/bin/claude',
      version: '2.1.295',
      how: 'PATH',
      signedIn: true,
      signInEvidence: 'ANTHROPIC_API_KEY',
      providers: null,
      serves: [{ provider: 'anthropic' }],
      catalogueVersion: '2.1.295',
    },
  ],
  providers: [
    {
      id: 'anthropic',
      kind: 'anthropic',
      endpointHost: 'api.anthropic.com',
      reachable: 'unknown',
      keyEnv: 'ANTHROPIC_API_KEY',
      keySet: true,
    },
  ],
  runtimes: [
    {
      runtime: 'ollama',
      found: true,
      where: '/usr/local/bin/ollama',
      version: '0.5.7',
      how: 'PATH',
      serving: true,
      models: [{ name: 'nomic-embed-text:latest', context: 2048, traits: ['local', 'embedding'] }],
    },
  ],
  hosts: [{ host: 'terminal', found: true, checked: 'always available' }],
  suggestedHost: 'terminal',
  hostDefaultWritten: false,
  hostDefaultNotes: [],
}

describe('DetectReportSchema', () => {
  test('a full report round-trips through JSON', () => {
    expect(DetectReportSchema.parse(JSON.parse(JSON.stringify(report)))).toEqual(report)
  })

  test('a provider row cannot carry a key value', () => {
    const provider = { ...report.providers[0], keySet: 'sk-live' }
    expect(DetectReportSchema.safeParse({ ...report, providers: [provider] }).success).toBe(false)
  })

  test('traits outside the catalogue vocabulary are refused', () => {
    const runtime = {
      ...report.runtimes[0],
      models: [{ name: 'x', context: null, traits: ['chat'] }],
    }
    expect(DetectReportSchema.safeParse({ ...report, runtimes: [runtime] }).success).toBe(false)
  })

  test('tools without catalogue facts are refused', () => {
    const { serves: _s, ...tool } = report.tools[0]!
    expect(DetectReportSchema.safeParse({ ...report, tools: [tool] }).success).toBe(false)
  })
})
