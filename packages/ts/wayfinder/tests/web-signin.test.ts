// @vitest-environment jsdom
/**
 * The page's sign-in: the bearer token is kept per tab in `sessionStorage`,
 * so a reload stays signed in, and a 401 from a restarted server signs the
 * tab out with a way to get a new link.
 */
import { mountPage } from './dom.ts'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { TOKEN_KEY, call, setTokenForTest, signIn, signedIn } from '../src/web/api.ts'

beforeEach(() => {
  mountPage()
  sessionStorage.clear()
  setTokenForTest('')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the session token', () => {
  test('a sign-in keeps the token in sessionStorage, never in a cookie or the URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ token: 'bearer-1' })),
    )
    expect(await signIn('boot-1')).toBe(true)
    expect(signedIn()).toBe(true)
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('bearer-1')
    expect(document.cookie).toBe('')
    expect(location.href).not.toContain('bearer-1')
  })

  test('a reload reads the kept token, and sends it as a bearer header', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'bearer-2')
    vi.resetModules()
    const api = await import('../src/web/api.ts')
    expect(api.signedIn()).toBe(true)
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(new Headers(init.headers).get('authorization') ?? '')
        return Response.json({ ok: true })
      }),
    )
    await api.call(['list'])
    expect(seen).toEqual(['Bearer bearer-2'])
  })

  test('a failed sign-in keeps nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    )
    expect(await signIn('used')).toBe(false)
    expect(signedIn()).toBe(false)
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  test('a 401 forgets the token and says how to get a new link', async () => {
    setTokenForTest('old')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    )
    const result = await call(['list'])
    expect(result.ok).toBe(false)
    expect(signedIn()).toBe(false)
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    const text = document.body.textContent ?? ''
    expect(text).toContain('not signed in')
    expect(text).toContain('press Enter')
    expect(text).toContain('serve')
  })
})
