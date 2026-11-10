/**
 * The optional-peer seam: one warning per missing peer per process, and a
 * loader that rejects leaves the renderer rejecting rather than hanging.
 */

import { afterEach, describe, expect, vi, test } from 'vitest'
import { warnMissingPeer } from '../src/peers.ts'
import { createMermaidRenderer } from '../src/mermaid.ts'

describe('warnMissingPeer', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  afterEach(() => warn.mockClear())

  test('warns once per peer, naming the peer and the effect', () => {
    warnMissingPeer('katex', 'math renders as source')
    warnMissingPeer('katex', 'math renders as source')
    warnMissingPeer('katex', 'math renders as source')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      '@osdlc/markdown-render: katex is not installed; math renders as source',
    )
  })

  test('a second peer gets its own single warning', () => {
    warnMissingPeer('mermaid', 'diagrams render as source')
    warnMissingPeer('mermaid', 'diagrams render as source')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      '@osdlc/markdown-render: mermaid is not installed; diagrams render as source',
    )
    // Already warned in the previous test: silent now.
    warnMissingPeer('katex', 'math renders as source')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('createMermaidRenderer over a loader that rejects', () => {
  test('every render rejects with the loader error', async () => {
    const render = createMermaidRenderer(async () => {
      throw new Error("Cannot find package 'mermaid'")
    })
    await expect(render('graph TD; a-->b')).rejects.toThrow("Cannot find package 'mermaid'")
    await expect(render('graph TD; b-->c')).rejects.toThrow("Cannot find package 'mermaid'")
  })
})

describe('warnMissingPeer with the import error', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  afterEach(() => warn.mockClear())

  test('a missing module is "not installed"', async () => {
    vi.resetModules()
    const { warnMissingPeer: fresh } = await import('../src/peers.ts')
    fresh('a-peer', 'x', Object.assign(new Error('nope'), { code: 'ERR_MODULE_NOT_FOUND' }))
    expect(warn).toHaveBeenCalledWith('@osdlc/markdown-render: a-peer is not installed; x')
  })

  test('any other failure carries its message instead of claiming "not installed"', async () => {
    vi.resetModules()
    const { warnMissingPeer: fresh } = await import('../src/peers.ts')
    fresh('b-peer', 'y', new TypeError('Failed to fetch dynamically imported module: /chunk.js'))
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).not.toContain('not installed')
    expect(message).toContain('could not be loaded')
    expect(message).toContain('/chunk.js')
  })
})
