/**
 * The browser side: fetch a site's data files, filter a type's records, keep the view in the
 * query string, and search. A page of your own can build on these and on the components.
 */
import {
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue'
import type {
  CorpusData,
  DataField,
  DataRecord,
  RecordData,
  SearchData,
  TypeData,
} from './data-types.ts'
import {
  emptyState,
  facetCounts,
  filterRecords,
  paginate,
  setFilter,
  type FilterState,
  type FilterValue,
  type SortState,
} from './filter.ts'
import { prepareSearch, type SearchIndex } from './search.ts'
import { formatState, parseState } from './url-state.ts'

export * from './data-types.ts'
export * from './filter.ts'
export * from './format.ts'
export * from './search.ts'
export * from './url-state.ts'
export * from './value-text.ts'
export type { BadgeColor, ControlKind, DocLink, FieldFormat } from './config.ts'
export type { FieldKind } from './schema.ts'

const FETCHED = new Map<string, Promise<unknown>>()

/** Fetch a JSON data file once per page: a second call for the same address shares the first. */
export function fetchData<T>(url: string): Promise<T> {
  let pending = FETCHED.get(url) as Promise<T> | undefined
  if (pending === undefined) {
    pending = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
      return response.json() as Promise<T>
    })
    // A failed fetch is not kept, so a retry asks again.
    pending.catch(() => FETCHED.delete(url))
    FETCHED.set(url, pending)
  }
  return pending
}

const dataDir = (base: string): string => `${base.replace(/\/*$/, '/')}data/`

/** `data/corpus.json` of the site served under `base`. */
export const fetchCorpusData = (base: string): Promise<CorpusData> =>
  fetchData(`${dataDir(base)}corpus.json`)

/** `data/types/<slug>.json` of the site served under `base`: the records of one type. */
export const fetchTypeData = (base: string, slug: string): Promise<TypeData> =>
  fetchData(`${dataDir(base)}types/${slug}.json`)

/** `data/records/<type slug>/<record slug>.json`: one record, whole. */
export const fetchRecordData = (base: string, type: string, record: string): Promise<RecordData> =>
  fetchData(`${dataDir(base)}records/${type}/${record}.json`)

/** `data/search.json` of the site served under `base`, ready for `search`. */
export const fetchSearchIndex = (base: string): Promise<SearchIndex> =>
  fetchData<SearchData>(`${dataDir(base)}search.json`).then(prepareSearch)

/** A data file as reactive state. */
export interface DataState<T> {
  data: Readonly<ShallowRef<T | null>>
  error: Readonly<ShallowRef<Error | null>>
  loading: Readonly<ShallowRef<boolean>>
}

/**
 * The data file at `url` as reactive state, fetched when the component mounts and again when
 * `url` changes. Nothing is fetched while rendering on the server.
 */
export function useData<T>(url: MaybeRefOrGetter<string>): DataState<T> {
  const data = shallowRef<T | null>(null)
  const error = shallowRef<Error | null>(null)
  const loading = shallowRef(false)
  let current = 0
  const load = (address: string): void => {
    const mine = ++current
    loading.value = true
    error.value = null
    fetchData<T>(address).then(
      (value) => {
        if (mine !== current) return
        data.value = value
        loading.value = false
      },
      (reason: unknown) => {
        if (mine !== current) return
        error.value = reason instanceof Error ? reason : new Error(String(reason))
        loading.value = false
      },
    )
  }
  onMounted(() => {
    watch(() => toValue(url), load, { immediate: true })
  })
  return { data, error, loading }
}

/** The records of one type as reactive state: `useData` for a `data/types/<slug>.json`. */
export const useTypeData = (url: MaybeRefOrGetter<string>): DataState<TypeData> => useData(url)

/** Options for `useFilterState`. */
export interface FilterStateOptions {
  /** The sort when the query string names none. */
  defaultSort?: SortState | null
  /** Keep the state in the page's query string. Default true. */
  url?: boolean
  /** The filters a reader starts with, by field name, as the page's address writes them. */
  defaults?: Record<string, string[]>
}

/** A type index's filter state, with the actions that change it. */
export interface FilterStateApi {
  state: Readonly<ShallowRef<FilterState>>
  /** Replace the whole state. */
  set: (state: FilterState) => void
  /** Set one field's filter, or remove it with null. */
  setFilter: (field: string, value: FilterValue | null) => void
  setQuery: (query: string) => void
  /** Sort by a field: ascending, then descending on a second call for the same field. */
  toggleSort: (field: string) => void
  setPage: (page: number) => void
  /** Remove every filter and the search text. */
  clear: () => void
}

/**
 * The filter state of a type index. With `url` on, it is read from the query string when the
 * component mounts, written back with `history.replaceState` on each change, and read again on
 * back and forward. On the server and before mounting it is the default view.
 */
export function useFilterState(
  fields: MaybeRefOrGetter<DataField[]>,
  options: FilterStateOptions = {},
): FilterStateApi {
  const defaultSort = options.defaultSort ?? null
  const syncUrl = options.url ?? true
  const defaults = options.defaults ?? {}
  const state = shallowRef<FilterState>(parseState('', toValue(fields), defaultSort, defaults))

  const read = (): void => {
    state.value = parseState(window.location.search, toValue(fields), defaultSort, defaults)
  }
  const set = (next: FilterState): void => {
    state.value = next
    if (!syncUrl || typeof window === 'undefined') return
    const query = formatState(next, toValue(fields), defaultSort, defaults)
    const url = `${window.location.pathname}${query === '' ? '' : `?${query}`}${window.location.hash}`
    window.history.replaceState(window.history.state, '', url)
  }
  if (syncUrl) {
    onMounted(() => {
      read()
      window.addEventListener('popstate', read)
    })
    onUnmounted(() => window.removeEventListener('popstate', read))
  }
  return {
    state,
    set,
    setFilter: (field, value) => set(setFilter(state.value, field, value)),
    setQuery: (query) => set({ ...state.value, query, page: 1 }),
    toggleSort: (field) => {
      const sort = state.value.sort
      set({
        ...state.value,
        sort: { field, descending: sort?.field === field ? !sort.descending : false },
        page: 1,
      })
    },
    setPage: (page) => set({ ...state.value, page }),
    clear: () => set({ ...emptyState(), sort: state.value.sort }),
  }
}

/** The result of a filter state over a type's records. */
export interface TypeQuery {
  /** Every record that passes, sorted. Empty until the data has loaded. */
  matches: ComputedRef<DataRecord[]>
  /** The current page of `matches`. */
  page: ComputedRef<{ page: number; pages: number; start: number; rows: DataRecord[] }>
  /** Per filter field, how many records hold each value under the other filters. */
  facets: ComputedRef<Record<string, Record<string, number>>>
}

/** Filter, sort, page and count the records of `data` by `state`, recomputed when either changes. */
export function useTypeQuery(
  data: MaybeRefOrGetter<TypeData | null>,
  state: MaybeRefOrGetter<FilterState>,
  pageSize: MaybeRefOrGetter<number> = 50,
): TypeQuery {
  const matches = computed(() => {
    const loaded = toValue(data)
    return loaded === null ? [] : filterRecords(loaded, toValue(state))
  })
  const page = computed(() => paginate(matches.value, toValue(state).page, toValue(pageSize)))
  const facets = computed(() => {
    const loaded = toValue(data)
    return loaded === null ? {} : facetCounts(loaded, toValue(state))
  })
  return { matches, page, facets }
}
