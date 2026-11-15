// @vitest-environment jsdom
/**
 * The Vue entry used through its name: `MarkdownRender` under a note source.
 * The file opts into jsdom because Vue captures `document` when it loads.
 */

import { expect, test } from 'vitest'

const vue = await import('vue')
const { MarkdownRender, provideNoteSource } = await import('@osdlc/markdown-render-vue')

test('MarkdownRender renders a note with links resolved by the note source', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = vue.createApp(
    vue.defineComponent({
      setup() {
        provideNoteSource({
          resolveLink: (target) => ({ kind: 'note', path: `/notes/${target}`, display: target }),
          loadNote: async () => null,
          assetUrl: () => null,
        })
        return () => vue.h(MarkdownRender, { source: 'See [[Note|a *note*]].' } as never)
      },
    }),
  )
  app.mount(host)
  for (let i = 0; i < 100 && !host.querySelector('a'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  expect(host.querySelector('a')?.textContent).toBe('a note')
  app.unmount()
})
