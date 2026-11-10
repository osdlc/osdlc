import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToHtmlSync } from '../src/processor.ts'
import { renderToHtml } from '../src/index.ts'
import { vaultResolver } from './helpers.ts'

const everyFeature = readFileSync(new URL('./fixtures/every-feature.md', import.meta.url), 'utf8')

describe('renderToHtmlSync', () => {
  test('matches renderToHtml with default options', async () => {
    expect(renderToHtmlSync(everyFeature)).toBe(await renderToHtml(everyFeature))
  })

  test('matches renderToHtml with math on', async () => {
    const options = { math: true }
    expect(renderToHtmlSync(everyFeature, options)).toBe(await renderToHtml(everyFeature, options))
  })

  test('matches renderToHtml with a resolver and notePath', async () => {
    const options = {
      resolveLink: vaultResolver(['Note', 'Folder/Other', 'diagram.png']),
      notePath: 'Kitchen.md',
    }
    const sync = renderToHtmlSync(everyFeature, options)
    expect(sync).toBe(await renderToHtml(everyFeature, options))
    // The resolver actually ran: a listed note resolves into the vault.
    expect(sync).toContain('/vault/')
  })

  test('throws when a highlight pass is given', () => {
    // Any pass, sync or not: the option is the signal, not the body.
    expect(() => renderToHtmlSync('x', { highlight: () => {} })).toThrow(
      new Error('renderToHtmlSync: highlight is async; use renderToHtml'),
    )
  })

  test('an absent highlight pass does not throw', () => {
    expect(() => renderToHtmlSync('# hi', {})).not.toThrow()
  })

  test('sanitize is still applied', () => {
    const out = renderToHtmlSync('before\n\n<script>alert(1)</script>\n\nafter')
    expect(out).not.toContain('<script')
    expect(out).toContain('before')
    expect(out).toContain('after')
  })

  test('the pipeline stays sync under every option except highlight', () => {
    // unified throws "`processSync` finished async" if any plugin returns a
    // promise. This guards against a future plugin quietly going async.
    expect(() => renderToHtmlSync(everyFeature, { math: true, sanitize: false })).not.toThrow()
  })
})
