/**
 * The redact entry: scrub secrets from text and JSON, and append a log line
 * with the redactor in front of the writer.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { readJsonl } from '@osdlc/observe'
import {
  appendRedactedJsonl,
  createRedactor,
  mergeRedactions,
  redactPatternProblem,
  type Redacted,
  type RedactionRange,
  type Redactions,
  type Redactor,
  type RedactorOptions,
} from '@osdlc/observe/redact'

let store: string
beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), 'observe-redact-'))
})
afterEach(() => rmSync(store, { recursive: true, force: true }))

test('redact text before it is logged', async () => {
  const redactor = createRedactor({ env: { DEPLOY_TOKEN: 'dk-7f3a9c2e11b4' } })

  const { text, redactions } = await redactor.redact(
    'curl -H "Authorization: Bearer dk-7f3a9c2e11b4" https://example.com',
  )
  // text: 'curl -H "Authorization: Bearer [REDACTED:auth-scheme]" https://example.com'
  // redactions: { 'auth-scheme': 1 }

  expect(text).toBe('curl -H "Authorization: Bearer [REDACTED:auth-scheme]" https://example.com')
  expect(redactions).toEqual({ 'auth-scheme': 1 })
})

test('append a log line with the redactor in front of the writer', async () => {
  const redactor = createRedactor()

  const redactions = await appendRedactedJsonl(
    join(store, 'tools.jsonl'),
    {
      v: 1,
      ts: new Date().toISOString(),
      kind: 'tool.output',
      source: 'hook',
      session: 's-01JABCDEFGHJKMNPQRSTVWXYZ0',
      output: 'connecting to postgres://app:s3cr3t-pa55@db.internal/prod',
    },
    redactor,
  )
  // The envelope's keys are kept; `output` becomes
  // 'connecting to [REDACTED:database-connection-string]'.

  expect(redactions).toEqual({ 'database-connection-string': 1 })
  const [line] = readJsonl(join(store, 'tools.jsonl')) as Record<string, unknown>[]
  expect(line!['session']).toBe('s-01JABCDEFGHJKMNPQRSTVWXYZ0')
  expect(line!['output']).toBe('connecting to [REDACTED:database-connection-string]')
})

test('extend the redactor with your own names and patterns', async () => {
  const options: RedactorOptions = {
    env: { BUILD_SIGNER: 'sig-9b1e44d0c2' },
    envNames: ['BUILD_SIGNER'], // a secret whose name does not say so
    extraPatterns: [{ id: 'ticket-key', regex: 'TK-[A-Z0-9]{12}' }],
  }
  // Check a pattern before it reaches the redactor, which throws on a bad one.
  expect(redactPatternProblem('TK-[A-Z0-9]{12}')).toBeNull()
  expect(redactPatternProblem('(a+)+$')).toMatch(/catastrophic backtracking/)

  const redactor: Redactor = createRedactor(options)
  const { value, redactions } = await redactor.redactJson({
    signer: 'sig-9b1e44d0c2',
    note: 'use TK-ABCDEF123456',
    max_tokens: 100,
  })

  expect(value).toEqual({
    signer: '[REDACTED:env:BUILD_SIGNER]',
    note: 'use [REDACTED:custom:ticket-key]',
    max_tokens: 100,
  })
  const total: Redactions = {}
  mergeRedactions(total, redactions)
  mergeRedactions(total, { 'custom:ticket-key': 1 })
  expect(total).toEqual({ 'env:BUILD_SIGNER': 1, 'custom:ticket-key': 2 })
})

test('a field typed Redacted takes only redactor output', async () => {
  interface ToolLine {
    kind: 'tool.output'
    output: Redacted
  }
  const { text } = await createRedactor({ env: {} }).redact('ok')
  const line: ToolLine = { kind: 'tool.output', output: text }
  // @ts-expect-error a plain string is not Redacted
  const bad: ToolLine = { kind: 'tool.output', output: 'ok' }

  expect(line.output).toBe('ok')
  expect(bad.output).toBe('ok')
})

test('a lint stand-in that fails makes the redactor fail closed', async () => {
  const lint = async (): Promise<RedactionRange[]> => {
    throw new Error('lint failed')
  }
  const { text, redactions } = await createRedactor({ env: {}, lint }).redact('anything')

  expect(text).toBe('[REDACTED:redactor-error]')
  expect(redactions).toEqual({ 'redactor-error': 1 })
})
