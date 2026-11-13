/**
 * Search over the whole corpus. The index, `data/search.json`, is fetched the first time the
 * box has text or takes focus, not with the page. The query is kept in `?q=`.
 */
import { computed, defineComponent, h, onMounted, shallowRef, useId, type VNodeChild } from 'vue'
import { fetchData } from '../client.ts'
import type { SearchData } from '../data-types.ts'
import { prepareSearch, search, type SearchIndex } from '../search.ts'

/** Text with its matches marked. */
function marked(text: string, marks: [number, number][]): VNodeChild[] {
  const out: VNodeChild[] = []
  let at = 0
  for (const [start, end] of marks) {
    if (start > at) out.push(text.slice(at, start))
    out.push(h('mark', text.slice(start, end)))
    at = end
  }
  out.push(text.slice(at))
  return out
}

export const SearchApp = defineComponent({
  name: 'CorpusSearchApp',
  props: {
    /** The address of `data/search.json`. */
    indexUrl: { type: String, required: true },
    placeholder: { type: String, default: 'Search every record' },
    /** The most results shown. */
    limit: { type: Number, default: 50 },
  },
  setup(props) {
    const query = shallowRef('')
    const index = shallowRef<SearchIndex | null>(null)
    const error = shallowRef<Error | null>(null)
    const inputId = useId()
    let asked = false

    const load = (): void => {
      if (asked) return
      asked = true
      fetchData<SearchData>(props.indexUrl).then(
        (data) => (index.value = prepareSearch(data)),
        (reason: unknown) => {
          asked = false
          error.value = reason instanceof Error ? reason : new Error(String(reason))
        },
      )
    }
    const setQuery = (text: string): void => {
      query.value = text
      if (text.trim() !== '') load()
      const url = new URL(window.location.href)
      if (text.trim() === '') url.searchParams.delete('q')
      else url.searchParams.set('q', text)
      window.history.replaceState(window.history.state, '', url)
    }
    onMounted(() => {
      const initial = new URLSearchParams(window.location.search).get('q') ?? ''
      query.value = initial
      if (initial.trim() !== '') load()
    })

    const result = computed(() =>
      index.value === null ? null : search(index.value, query.value, { limit: props.limit }),
    )
    const status = computed(() => {
      if (query.value.trim() === '') return 'Type to search titles, fields and text.'
      if (error.value !== null)
        return `The search index could not be loaded: ${error.value.message}`
      if (result.value === null) return 'Loading the search index…'
      const { total, hits } = result.value
      if (total === 0) return 'No records match.'
      return total > hits.length
        ? `${total} records match. The first ${hits.length} are shown.`
        : `${total} ${total === 1 ? 'record matches' : 'records match'}.`
    })

    return () =>
      h('div', { class: 'cs-search-app' }, [
        h('label', { for: inputId, class: 'cs-sr' }, 'Search'),
        h('input', {
          id: inputId,
          class: 'cs-input cs-search-input',
          type: 'search',
          value: query.value,
          placeholder: props.placeholder,
          autocomplete: 'off',
          onFocus: load,
          onInput: (event: Event) => setQuery((event.target as HTMLInputElement).value),
        }),
        h('p', { class: 'cs-result-count', role: 'status', 'aria-live': 'polite' }, status.value),
        h(
          'ol',
          { class: 'cs-hits' },
          (query.value.trim() === '' ? [] : (result.value?.hits ?? [])).map((hit) =>
            h('li', { key: hit.url, class: 'cs-hit' }, [
              h('a', { href: hit.url, class: 'cs-hit-title' }, hit.title),
              h('span', { class: 'cs-hit-type' }, hit.type),
              hit.summary === ''
                ? null
                : h('p', { class: 'cs-hit-summary' }, marked(hit.summary, hit.summaryMarks)),
              hit.snippet === ''
                ? null
                : h('p', { class: 'cs-hit-snippet' }, marked(hit.snippet, hit.marks)),
            ]),
          ),
        ),
      ])
  },
})
