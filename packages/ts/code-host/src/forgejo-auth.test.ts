import { describe, expect, test } from 'vitest'

import type { CommandRunner } from '@osdlc/command-seam'
import { DEFAULT_FORGEJO_TOKEN_ENV } from './forgejo.ts'
import { forgejoAuthChecks } from './forgejo-auth.ts'

const noGh: CommandRunner = {
  run() {
    throw new Error('forgejo checks must not run gh')
  },
}

const TOKEN_FIX = `export ${DEFAULT_FORGEJO_TOKEN_ENV}=<token from Settings → Applications>`
const API_FIX = `token rejected or host unreachable: create a new token and re-export ${DEFAULT_FORGEJO_TOKEN_ENV}`

function fakeFetch(respond: () => Response | Promise<Response>): {
  fetch: typeof fetch
  calls: { url: string; init: RequestInit | undefined }[]
} {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return respond()
  }
  return { fetch: fn as typeof fetch, calls }
}

describe('forgejoAuthChecks', () => {
  test('passes on HTTP 200 and sends the token to /api/v1/user with a timeout', async () => {
    const f = fakeFetch(() => new Response('{}', { status: 200 }))
    const env = { [DEFAULT_FORGEJO_TOKEN_ENV]: 'tok' }
    const checks = await forgejoAuthChecks(
      { gh: noGh, env, fetch: f.fetch },
      'https://code.example',
    )
    expect(checks.every((c) => c.ok)).toBe(true)
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]!.url).toBe('https://code.example/api/v1/user')
    expect(f.calls[0]!.init?.headers).toEqual({ Authorization: 'token tok' })
    expect(f.calls[0]!.init?.signal).toBeInstanceOf(AbortSignal)
  })

  test('a missing token fails with its fix and makes no network call', async () => {
    const f = fakeFetch(() => new Response('{}', { status: 200 }))
    const checks = await forgejoAuthChecks(
      { gh: noGh, env: {}, fetch: f.fetch },
      'https://code.example',
    )
    expect(checks).toEqual([
      { name: `${DEFAULT_FORGEJO_TOKEN_ENV} set`, ok: false, fix: TOKEN_FIX },
    ])
    expect(f.calls).toHaveLength(0)
  })

  test('a rejected token fails with the API fix', async () => {
    const f = fakeFetch(() => new Response('', { status: 401 }))
    const env = { [DEFAULT_FORGEJO_TOKEN_ENV]: 'tok' }
    const api = (
      await forgejoAuthChecks({ gh: noGh, env, fetch: f.fetch }, 'https://code.example')
    )[1]!
    expect(api).toEqual({
      name: 'GET https://code.example/api/v1/user',
      ok: false,
      detail: 'HTTP 401',
      fix: API_FIX,
    })
  })

  test('an unreachable host fails with the API fix', async () => {
    const f = fakeFetch(() => Promise.reject(new Error('connect ECONNREFUSED')))
    const env = { [DEFAULT_FORGEJO_TOKEN_ENV]: 'tok' }
    const api = (
      await forgejoAuthChecks({ gh: noGh, env, fetch: f.fetch }, 'https://code.example')
    )[1]!
    expect(api).toMatchObject({ ok: false, detail: 'connect ECONNREFUSED', fix: API_FIX })
  })

  test('no base URL fails the host check without a network call', async () => {
    const f = fakeFetch(() => new Response('{}', { status: 200 }))
    const env = { [DEFAULT_FORGEJO_TOKEN_ENV]: 'tok' }
    const checks = await forgejoAuthChecks({ gh: noGh, env, fetch: f.fetch }, null)
    expect(checks.map((c) => [c.name, c.ok])).toEqual([
      [`${DEFAULT_FORGEJO_TOKEN_ENV} set`, true],
      ['forgejo host', false],
    ])
    expect(f.calls).toHaveLength(0)
  })

  test('a custom token env var is read and named in the check and fix', async () => {
    const f = fakeFetch(() => new Response('{}', { status: 401 }))
    const env = { MY_TOKEN: 'tok' }
    const checks = await forgejoAuthChecks(
      { gh: noGh, env, fetch: f.fetch },
      'https://code.example',
      'MY_TOKEN',
    )
    expect(checks[0]).toMatchObject({ name: 'MY_TOKEN set', ok: true })
    expect(checks[1]?.fix).toContain('re-export MY_TOKEN')
    const missing = await forgejoAuthChecks({ gh: noGh, env: {} }, null, 'MY_TOKEN')
    expect(missing[0]?.fix).toBe('export MY_TOKEN=<token from Settings → Applications>')
  })
})
