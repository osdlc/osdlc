// @vitest-environment jsdom
/**
 * The hast→VNode walker's routing table, tested in isolation: pure functions,
 * no DOM, no component instance.
 *
 * The one mounted suite at the bottom covers how `MarkdownRender` hands the
 * injected `NoteSource` to the pipeline, which no pure function can show.
 */

import { markdownVue, vue } from './setup-dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { App, PropType, VNode } from 'vue'
import type { ComponentMap, HastNode, RenderContext } from '../src/render.ts'
import type { NoteSource } from '../src/context.ts'
import type { LinkResolution } from '@osdlc/markdown-render'

const { attrName, classList, matchOverride, routeKeys, toVueProps } = markdownVue

const Stub = vue.defineComponent({ name: 'Stub', render: () => null })
const Other = vue.defineComponent({ name: 'Other', render: () => null })

function el(tagName: string, properties: Record<string, unknown> = {}): HastNode {
  return { type: 'element', tagName, properties, children: [] }
}

describe('attrName', () => {
  test('data and aria properties become dash-cased attributes', () => {
    expect(attrName('dataBlockId')).toBe('data-block-id')
    expect(attrName('dataLine')).toBe('data-line')
    expect(attrName('ariaExpanded')).toBe('aria-expanded')
  })

  test('multi-word aria properties are one lowercase word after the dash', () => {
    expect(attrName('ariaDescribedBy')).toBe('aria-describedby')
    expect(attrName('ariaLabelledBy')).toBe('aria-labelledby')
    expect(toVueProps({ ariaDescribedBy: ['footnote-label'] })).toEqual({
      'aria-describedby': 'footnote-label',
    })
  })

  test('className maps to Vue class', () => {
    expect(attrName('className')).toBe('class')
  })

  test('camelCase HTML properties lowercase', () => {
    expect(attrName('colSpan')).toBe('colspan')
    expect(attrName('tabIndex')).toBe('tabindex')
    expect(attrName('htmlFor')).toBe('for')
  })

  test('case-sensitive SVG attribute names keep their casing', () => {
    // SVG attribute names are matched case-sensitively by the DOM, so a
    // lowercased `viewbox` is simply not `viewBox` and the graphic loses its
    // coordinate system. The string renderer emits them unchanged; the walker
    // has to agree, or the same hast renders two different pictures.
    expect(attrName('viewBox')).toBe('viewBox')
    expect(attrName('preserveAspectRatio')).toBe('preserveAspectRatio')
    expect(attrName('gradientUnits')).toBe('gradientUnits')
    expect(attrName('markerWidth')).toBe('markerWidth')
    expect(attrName('refX')).toBe('refX')
    expect(attrName('stdDeviation')).toBe('stdDeviation')
    // Still lowercase where the HTML attribute is: `viewBox` is the exception,
    // not the rule.
    expect(attrName('width')).toBe('width')
    expect(attrName('colSpan')).toBe('colspan')
  })
})

describe('toVueProps', () => {
  test('class arrays join into a string', () => {
    expect(toVueProps({ className: ['wikilink', 'wikilink-missing'] }).class).toBe(
      'wikilink wikilink-missing',
    )
  })

  test('data attributes are renamed', () => {
    expect(toVueProps({ dataBlockId: 'abc' })['data-block-id']).toBe('abc')
  })

  test('false and null properties are dropped, true is kept', () => {
    const props = toVueProps({ disabled: false, checked: true, title: null })
    expect(props).not.toHaveProperty('disabled')
    expect(props).not.toHaveProperty('title')
    expect(props.checked).toBe(true)
  })

  test('undefined properties produce an empty prop set', () => {
    expect(toVueProps(undefined)).toEqual({})
  })
})

describe('classList', () => {
  test('reads arrays and strings alike', () => {
    expect(classList(el('a', { className: ['x', 'y'] }))).toEqual(['x', 'y'])
    expect(classList(el('a', { className: 'x y' }))).toEqual(['x', 'y'])
    expect(classList(el('a'))).toEqual([])
  })
})

describe('routeKeys', () => {
  test('an embed routes on its tag name', () => {
    expect(routeKeys(el('markdown-embed'))).toContain('markdown-embed')
  })

  test('a wikilink anchor is more specific than a plain anchor', () => {
    const keys = routeKeys(el('a', { className: ['wikilink'] }))
    expect(keys).toEqual(['a.wikilink', 'a'])
  })

  test('a tag anchor routes to a.tag', () => {
    expect(routeKeys(el('a', { className: ['tag'] }))).toEqual(['a.tag', 'a'])
  })

  test('a callout routes to div.callout', () => {
    expect(routeKeys(el('div', { className: ['callout'] }))).toEqual(['div.callout', 'div'])
  })

  test('a checkbox routes to input.checkbox, other inputs do not', () => {
    expect(routeKeys(el('input', { type: 'checkbox' }))).toEqual(['input.checkbox', 'input'])
    expect(routeKeys(el('input', { type: 'text' }))).toEqual(['input'])
  })

  test('a fence routes on lang:<language>', () => {
    expect(routeKeys(el('pre', { dataLang: 'base' }))).toEqual(['lang:base', 'pre'])
    expect(routeKeys(el('pre', { dataLang: 'mermaid' }))).toEqual(['lang:mermaid', 'pre'])
  })

  test('inline math routes to math-inline', () => {
    expect(routeKeys(el('code', { className: ['language-math', 'math-inline'] }))).toEqual([
      'math-inline',
      'code',
    ])
  })

  test('a plain element routes on its tag name only', () => {
    expect(routeKeys(el('p'))).toEqual(['p'])
  })

  test('a table routes on its tag name, which is all the extras need', () => {
    expect(routeKeys(el('table'))).toEqual(['table'])
  })
})

describe('matchOverride', () => {
  test('the most specific registered key wins', () => {
    const node = el('a', { className: ['wikilink'] })
    expect(matchOverride(node, { 'a.wikilink': Stub, a: Other })?.component).toBe(Stub)
  })

  test('a less specific key still matches when the specific one is absent', () => {
    const node = el('a', { className: ['wikilink'] })
    expect(matchOverride(node, { a: Other })?.key).toBe('a')
  })

  test('no registered key means no override', () => {
    expect(matchOverride(el('p'), { a: Stub })).toBeUndefined()
  })

  test('a host claims a fence language with a lang: key', () => {
    const node = el('pre', { dataLang: 'base' })
    expect(matchOverride(node, { 'lang:base': Stub })?.component).toBe(Stub)
  })

  test('an undefined entry is a value: it turns a built-in route back off', () => {
    // What `{ pre: undefined }` and `{ table: undefined }` rely on — the entry
    // is present and falsy, so routing falls through to the plain element.
    expect(matchOverride(el('table'), { table: undefined })).toBeUndefined()
  })
})

describe('renderChildren keys children by identity, not position', () => {
  const { renderChildren } = markdownVue

  function block(blockId: string): HastNode {
    return { type: 'element', tagName: 'pre', properties: { dataBlockId: blockId }, children: [] }
  }

  function para(text: string, line: number): HastNode {
    return {
      type: 'element',
      tagName: 'p',
      properties: { dataLine: line },
      children: [{ type: 'text', value: text }],
    }
  }

  function item(text: string, line: number): HastNode {
    return {
      type: 'element',
      tagName: 'li',
      properties: { dataLine: line },
      children: [{ type: 'text', value: text }],
    }
  }

  const plain: RenderContext = { components: {} }

  test('the same node keys the same wherever it sits', () => {
    const alpha = block('alpha')
    const alone = renderChildren([alpha], plain)[0] as VNode
    const shifted = renderChildren([para('intro', 0), alpha], plain)[1] as VNode
    expect(shifted.key).toBe(alone.key)
  })

  test('siblings sharing a data-line get distinct keys', () => {
    const keys = renderChildren([item('one', 4), item('two', 4)], plain).map(
      (child) => (child as VNode).key,
    )
    expect(new Set(keys).size).toBe(2)
  })

  test('children with no identity at all still key apart', () => {
    const bare = (): HastNode => ({ type: 'element', tagName: 'em', children: [] })
    const keys = renderChildren([bare(), bare(), bare()], plain).map(
      (child) => (child as VNode).key,
    )
    expect(new Set(keys).size).toBe(3)
  })

  /**
   * The state a mis-keyed block inherits — a rendered diagram, a copy-button
   * clock, a loaded transclusion — is component instance state, so the probe
   * stamps its own instance id into the DOM and records its lifecycle.
   */
  let nextInstance = 0
  let unmounted: string[] = []

  const Probe = vue.defineComponent({
    name: 'Probe',
    props: { node: { type: Object as PropType<HastNode>, required: true } },
    setup(props) {
      const instance = `probe-${++nextInstance}`
      vue.onUnmounted(() => unmounted.push(instance))
      return () =>
        vue.h('pre', {
          'data-instance': instance,
          'data-block': String(props.node.properties?.dataBlockId ?? ''),
        })
    },
  })

  let app: App | null = null

  beforeEach(() => {
    nextInstance = 0
    unmounted = []
  })

  afterEach(() => {
    app?.unmount()
    app = null
  })

  function mountChildren(initial: HastNode[], components: ComponentMap) {
    const children = vue.shallowRef(initial)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const Wrapper = vue.defineComponent({
      setup: () => () => vue.h('div', renderChildren(children.value, { components })),
    })
    app = vue.createApp(Wrapper)
    app.mount(host)
    return {
      host,
      /** blockId → the probe instance currently rendering it. */
      instances(): Record<string, string> {
        const found: Record<string, string> = {}
        for (const node of host.querySelectorAll('[data-instance]')) {
          found[node.getAttribute('data-block') ?? ''] = node.getAttribute('data-instance') ?? ''
        }
        return found
      },
      async render(next: HastNode[]) {
        children.value = next
        await vue.nextTick()
      },
    }
  }

  test('a block that shifts down keeps its own component instance', async () => {
    const view = mountChildren([block('alpha'), block('beta')], { pre: Probe })
    const before = view.instances()
    expect(Object.keys(before)).toEqual(['alpha', 'beta'])

    // An unrelated paragraph appears above both blocks.
    await view.render([para('intro', 0), block('alpha'), block('beta')])

    const after = view.instances()
    expect(after.alpha).toBe(before.alpha)
    expect(after.beta).toBe(before.beta)
    expect(unmounted).toEqual([])
  })

  test('a different block arriving at a vacated position gets a fresh instance', async () => {
    const view = mountChildren([para('intro', 0), block('alpha')], { pre: Probe })
    const before = view.instances()

    // `alpha` is gone and `gamma` takes its place — same position, other block.
    await view.render([para('intro', 0), block('gamma')])

    const after = view.instances()
    expect(after.alpha).toBeUndefined()
    expect(after.gamma).toBeDefined()
    expect(after.gamma).not.toBe(before.alpha)
    expect(unmounted).toHaveLength(1)
    expect(unmounted[0]).toBe(before.alpha)
  })

  test('siblings sharing a data-line re-render without a duplicate-key patch', async () => {
    const view = mountChildren([item('one', 4), item('two', 4)], {})
    const warnings: string[] = []
    const warn = console.warn
    console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(' '))
    try {
      await view.render([item('one', 4), item('two', 4), item('three', 5)])
    } finally {
      console.warn = warn
    }
    expect(view.host.textContent).toBe('onetwothree')
    expect(warnings.filter((line) => /Duplicate keys/i.test(line))).toEqual([])
  })
})

describe('MarkdownRender: the NoteSource keeps its receiver', () => {
  /**
   * A class-based `NoteSource` — the shape a real host app has — whose
   * `resolveLink` reads `this`. Handing the bare method to the pipeline
   * detached it, and every link threw a TypeError on the first render.
   */
  class VaultSource implements NoteSource {
    constructor(private readonly prefix: string) {}

    resolveLink(target: string): LinkResolution {
      return { kind: 'note', path: `${this.prefix}/${target}`, display: target }
    }

    async loadNote(path: string) {
      return { body: `Body of ${path}.` }
    }

    assetUrl(target: string): string {
      return `${this.prefix}/${target}`
    }
  }

  let app: App | null = null

  afterEach(() => {
    app?.unmount()
    app = null
  })

  async function mount(props: Record<string, unknown>): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const Wrapper = vue.defineComponent({
      setup() {
        markdownVue.provideNoteSource(new VaultSource('/vault'))
        return () => vue.h(markdownVue.MarkdownRender, props as never)
      },
    })
    app = vue.createApp(Wrapper)
    app.mount(host)
    for (let i = 0; i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
      if (host.querySelector('.markdown-render')?.childNodes.length) break
    }
    return host
  }

  test('a class-based resolveLink resolves a wikilink instead of throwing', async () => {
    const host = await mount({ source: '[[Note]]', notePath: '/vault/Host' })
    expect(host.querySelector('.markdown-render-error')).toBeNull()
    const anchor = host.querySelector('a.wikilink')
    expect(anchor?.getAttribute('data-path')).toBe('/vault/Note')
    expect(anchor?.getAttribute('data-kind')).toBe('note')
  })

  test('a class-based resolveLink also resolves an embed target', async () => {
    // `selfIdentity` and the embed both call the resolver on their own paths;
    // neither may lose the receiver either.
    const host = await mount({ source: '![[Note]]', notePath: '/vault/Host' })
    expect(host.querySelector('.markdown-render-error')).toBeNull()
    expect(host.querySelector('.markdown-embed-note')?.textContent).toContain(
      'Body of /vault/Note.',
    )
  })
})

describe('MarkdownRender: options that the processor captures', () => {
  let app: App | null = null

  afterEach(() => {
    app?.unmount()
    app = null
  })

  async function settle(host: HTMLElement, done: () => boolean): Promise<void> {
    for (let i = 0; i < 100 && !done(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
  }

  const tags = (host: HTMLElement) =>
    [...host.querySelectorAll('a.tag')].map((a) => a.getAttribute('data-tag'))

  test('a changed tagDialect rebuilds the processor', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const options = vue.shallowRef<Record<string, unknown>>({ tagDialect: 'obsidian' })
    app = vue.createApp({
      render: () =>
        vue.h(markdownVue.MarkdownRender, { source: '#2024 (#draft)', options: options.value }),
    })
    app.mount(host)
    await settle(host, () => tags(host).length > 0)
    expect(tags(host)).toEqual(['draft'])

    options.value = { tagDialect: 'unicode' }
    await settle(host, () => tags(host)[0] === '2024')
    expect(tags(host)).toEqual(['2024'])
  })

  test('a changed comments option rebuilds the processor', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const options = vue.shallowRef<Record<string, unknown>>({ comments: false })
    app = vue.createApp({
      render: () =>
        vue.h(markdownVue.MarkdownRender, {
          source: 'shown %%secret%% end',
          options: options.value,
        }),
    })
    app.mount(host)
    await settle(host, () => (host.textContent ?? '').includes('shown'))
    expect(host.textContent).toContain('secret')

    options.value = { comments: true }
    await settle(host, () => !(host.textContent ?? '').includes('secret'))
    expect(host.textContent).not.toContain('secret')
  })
})
