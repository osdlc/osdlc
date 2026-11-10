/**
 * hast → VNodes.
 *
 * Never `v-html`: the tree is walked into real VNodes with `h()`, which is what
 * makes component overrides possible at all (a `<markdown-embed>` becomes a
 * live component, not an inert element) and what keeps a sanitizer bypass from
 * turning into script execution.
 *
 * Routing is table-driven and pure — {@link matchOverride} is unit-testable
 * without a DOM or a component instance. The table itself lives in
 * `../routing-signals.ts`, shared with `plugins/provenance.ts`: what routes an
 * element here is exactly what provenance strips off an element a note wrote,
 * and the two must not drift.
 */

import { h, type Component, type VNode } from 'vue'
import type { Position } from 'unist'

import { CLASS_ROUTES, FENCE_LANG_PROP, classNames } from '@osdlc/markdown-render'

export interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  value?: string
  /** Where the node sits in the source; absent on a synthesized node. */
  position?: Position
}

/**
 * Component override map: route key → component.
 *
 * `undefined` is a value, not an absence: {@link matchOverride} skips a falsy
 * entry and falls through to the next key, so `{ pre: undefined }` merged over
 * the built-ins turns a built-in route back off.
 */
export type ComponentMap = Record<string, Component | undefined>

export interface RenderContext {
  /** Built-in routes with the host's `components` prop merged over them. */
  components: ComponentMap
  /** `data-line` of the nearest ancestor that had one. */
  line?: number
}

/** Attribute-name fixups where lowercasing is wrong. */
const ATTR_NAME_OVERRIDES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  httpEquiv: 'http-equiv',
  acceptCharset: 'accept-charset',
  xmlLang: 'xml:lang',
}

/**
 * SVG attribute names that are genuinely camelCase in the DOM.
 *
 * HTML attribute names are case-insensitive, so lowercasing a hast property is
 * right for `colSpan` → `colspan`. SVG's are not: `viewbox` is a different
 * attribute from `viewBox`, and a browser ignores it — the graphic loses its
 * coordinate system and paints at its intrinsic size. hast carries these in
 * exactly the casing the attribute wants (`property-information`'s svg
 * schema), and the string renderer emits them unchanged, so the walker has to
 * as well or the same hast renders two different pictures.
 *
 * Only the names the attribute spells the same way hast does. The dash-cased
 * SVG presentation attributes (`strokeWidth` → `stroke-width`) are a separate
 * mapping this set does not claim.
 */
const CASE_SENSITIVE_SVG_ATTRS = new Set([
  'attributeName',
  'attributeType',
  'baseFrequency',
  'baseProfile',
  'calcMode',
  'clipPathUnits',
  'contentScriptType',
  'contentStyleType',
  'defaultAction',
  'diffuseConstant',
  'edgeMode',
  'externalResourcesRequired',
  'filterRes',
  'filterUnits',
  'focusHighlight',
  'glyphRef',
  'gradientTransform',
  'gradientUnits',
  'hatchContentUnits',
  'hatchUnits',
  'initialVisibility',
  'kernelMatrix',
  'kernelUnitLength',
  'keyPoints',
  'keySplines',
  'keyTimes',
  'lengthAdjust',
  'limitingConeAngle',
  'markerHeight',
  'markerUnits',
  'markerWidth',
  'maskContentUnits',
  'maskUnits',
  'mediaCharacterEncoding',
  'mediaContentEncodings',
  'mediaSize',
  'mediaTime',
  'numOctaves',
  'pathLength',
  'patternContentUnits',
  'patternTransform',
  'patternUnits',
  'pointsAtX',
  'pointsAtY',
  'pointsAtZ',
  'preserveAlpha',
  'preserveAspectRatio',
  'primitiveUnits',
  'refX',
  'refY',
  'repeatCount',
  'repeatDur',
  'requiredExtensions',
  'requiredFeatures',
  'requiredFonts',
  'requiredFormats',
  'snapshotTime',
  'specularConstant',
  'specularExponent',
  'spreadMethod',
  'startOffset',
  'stdDeviation',
  'stitchTiles',
  'surfaceScale',
  'syncBehavior',
  'syncBehaviorDefault',
  'syncMaster',
  'syncTolerance',
  'syncToleranceDefault',
  'systemLanguage',
  'tableValues',
  'targetX',
  'targetY',
  'textLength',
  'transformBehavior',
  'viewBox',
  'viewTarget',
  'xChannelSelector',
  'yChannelSelector',
  'zoomAndPan',
])

/**
 * hast property name → DOM attribute name. hast camelCases (`dataBlockId`,
 * `colSpan`); the DOM wants `data-block-id` and `colspan`, and Vue passes
 * whatever key we give it straight to `setAttribute`. The exception is
 * {@link CASE_SENSITIVE_SVG_ATTRS}, which travels through untouched.
 */
export function attrName(key: string): string {
  const override = ATTR_NAME_OVERRIDES[key]
  if (override) return override
  // `data*` hyphenates at every capital; `aria*` is `aria-` plus ONE lowercase
  // word (`ariaDescribedBy` → `aria-describedby`), as property-information has it.
  if (/^aria[A-Z]/.test(key)) return 'aria-' + key.slice(4).toLowerCase()
  if (/^data[A-Z]/.test(key)) {
    return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  }
  if (CASE_SENSITIVE_SVG_ATTRS.has(key)) return key
  return key.toLowerCase()
}

/**
 * Every HTML attribute whose name starts with `on` is an event handler, and
 * there is no non-handler exception to carve out. Vue hands a lowercase
 * `onclick` straight to `setAttribute`, which makes it live.
 */
const EVENT_HANDLER = /^on/i

/**
 * hast properties → props for `h()`.
 *
 * Handlers are dropped here, not left to the sanitizer. The walker is the last
 * thing between a hast tree and the DOM, and it is reachable with the tree
 * unsanitized — `options.sanitize: false` is documented, and a host may build
 * its own hast — so passing `attrName('onClick') → 'onclick'` through would be
 * a one-word XSS, with the sanitizer as the single point of failure. Refusing
 * them unconditionally costs nothing: the components that need real listeners
 * attach them themselves, after this spread.
 */
export function toVueProps(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  if (!properties) return props
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null || value === false) continue
    if (EVENT_HANDLER.test(key)) continue
    const name = attrName(key)
    if (name === 'class') {
      props.class = Array.isArray(value) ? value.join(' ') : String(value)
    } else if (Array.isArray(value)) {
      props[name] = value.join(' ')
    } else {
      props[name] = value
    }
  }
  return props
}

/** Class list of a hast element, whatever shape `className` came in as. */
export function classList(node: HastNode): string[] {
  return classNames(node.properties)
}

/**
 * All text under a node, concatenated — for a fence's `<pre>`, its source.
 *
 * Exact for a code fence whatever the highlighter did to it: highlighting
 * splits the body into nested spans, and only the text nodes carry characters.
 */
export function hastNodeText(node: HastNode): string {
  if (node.type === 'text') return String(node.value ?? '')
  return (node.children ?? []).map(hastNodeText).join('')
}

/**
 * Route an element to an override, most specific first.
 *
 * Keys, in the order they are tried:
 *   `markdown-embed` · `lang:<fence-language>` · `math-inline` ·
 *   `a.wikilink` · `a.tag` · `div.callout` · `input.checkbox` · `<tagName>`
 *
 * `lang:` keys are how a host injects a block renderer for a fence language —
 * `{'lang:base': BasesBlock}` claims every ```base fence.
 */
export function matchOverride(
  node: HastNode,
  components: ComponentMap,
): { key: string; component: Component } | undefined {
  for (const key of routeKeys(node)) {
    const component = components[key]
    if (component) return { key, component }
  }
  return undefined
}

/**
 * Every override key this element could match, most specific first.
 *
 * The class routes come from `CLASS_ROUTES` rather than being spelled out
 * here, so provenance's strip table and this one are the same table.
 */
export function routeKeys(node: HastNode): string[] {
  const tag = node.tagName ?? ''
  const classes = classList(node)
  const keys: string[] = []

  if (tag === 'markdown-embed') keys.push('markdown-embed')
  if (tag === 'pre') {
    const lang = node.properties?.[FENCE_LANG_PROP]
    if (typeof lang === 'string' && lang) keys.push(`lang:${lang}`)
  }
  for (const route of CLASS_ROUTES) {
    if (tag === route.tag && classes.includes(route.className)) keys.push(route.key)
  }
  if (tag === 'input' && node.properties?.type === 'checkbox') keys.push('input.checkbox')
  if (tag) keys.push(tag)

  return keys
}

/** Render one hast node. Returns `null` for nodes with no visual output. */
export function renderNode(
  node: HastNode,
  context: RenderContext,
  key: string | number,
): VNode | string | null {
  if (node.type === 'text') return String(node.value ?? '')
  if (node.type !== 'element' || !node.tagName) return null

  const line = numericLine(node) ?? context.line
  // In the else branch `line` is always a number — it differs from
  // `context.line`, so `numericLine` must have produced it — but that is not
  // something the checker can narrow, and `line?: number` will not take an
  // explicit undefined.
  const childContext: RenderContext =
    line === context.line ? context : { ...context, ...(line !== undefined ? { line } : {}) }

  const routed = matchOverride(node, context.components)
  if (routed) {
    const props: Record<string, unknown> = { node, key }
    if (routed.key === 'input.checkbox') props.line = line
    return h(routed.component, props, {
      default: () => renderChildren(node.children, childContext),
    })
  }

  const props = toVueProps(node.properties)
  props.key = key
  const children = renderChildren(node.children, childContext)
  return VOID_ELEMENTS.has(node.tagName) ? h(node.tagName, props) : h(node.tagName, props, children)
}

/**
 * Render a child list, dropping nodes with no output.
 *
 * Keys come from the node, not its position. An index key makes a routed
 * component inherit a neighbour's instance whenever blocks shift: insert a
 * paragraph above a `MermaidBlock` and Vue patches the old instance's props
 * instead of unmounting it, so the rendered diagram, the copy-button state or
 * the loaded transclusion moves to a different block.
 */
export function renderChildren(
  children: HastNode[] | undefined,
  context: RenderContext,
): Array<VNode | string> {
  const out: Array<VNode | string> = []
  const seen = new Map<string, number>()
  ;(children ?? []).forEach((child, index) => {
    // Text renders to a bare string, which carries no key at all.
    const key = child.type === 'element' ? childKey(child, index, seen) : index
    const rendered = renderNode(child, context, key)
    if (rendered !== null) out.push(rendered)
  })
  return out
}

/**
 * A child's key: its identity in the source where it has one, else its tag
 * and position.
 *
 * `seen` de-duplicates within the parent. Keys that repeat are not just a Vue
 * warning but a mis-patch, and siblings CAN share an identity — a wrapping
 * list item leaves two `<li data-line="4">` next to each other.
 */
function childKey(node: HastNode, index: number, seen: Map<string, number>): string {
  const base = nodeKey(node, index)
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}~${count}`
}

/**
 * One node's key, for callers assembling their own child list —
 * `heading-sections.ts`'s `renderSections` does. `fallback` stands in when the node names
 * nothing in the source; give it something stable within the list.
 */
export function nodeKey(node: HastNode, fallback: string | number): string {
  return `${node.tagName ?? ''}:${sourceIdentity(node) ?? `#${fallback}`}`
}

/**
 * What names this node in the source: an explicit block id, an id, then the
 * `data-line` the pipeline stamps on every block — a source position, which is
 * the identity a block keeps as unrelated blocks come and go around it.
 */
function sourceIdentity(node: HastNode): string | undefined {
  const properties = node.properties
  if (!properties) return undefined
  const blockId = properties.dataBlockId
  if (typeof blockId === 'string' && blockId) return `b${blockId}`
  const id = properties.id
  if (typeof id === 'string' && id) return `i${id}`
  const line = properties.dataLine
  if (line !== undefined && line !== null && line !== '') return `l${String(line)}`
  return undefined
}

function numericLine(node: HastNode): number | undefined {
  const raw = node.properties?.dataLine
  if (raw === undefined || raw === null) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/** Elements that must not be given children. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])
