<script setup lang="ts">
import { computed } from 'vue'
import { emptyFilters, hasFilters, type Facets } from '../../model/filters'
import { RELATION_LABEL, type Relation } from '../../model/relations'
import { languageLabel, repoLabel } from '../../model/view'
import type { Repo } from '../../model/types'
import FacetGroup from './FacetGroup.vue'

const props = defineProps<{
  facets: Facets
  repos: Repo[]
  matchCount: number
}>()

const query = defineModel<string>('query', { required: true })
const languages = defineModel<string[]>('languages', { required: true })
const kinds = defineModel<string[]>('kinds', { required: true })
const repoIds = defineModel<string[]>('repoIds', { required: true })
const relations = defineModel<Relation[]>('relations', { required: true })

const filtered = computed(() =>
  hasFilters({
    query: query.value,
    languages: languages.value,
    kinds: kinds.value,
    repos: repoIds.value,
    relations: relations.value,
  }),
)
const repoName = (id: string) => repoLabel(props.repos, id)
const kindName = (kind: string) => kind
const relationName = (relation: Relation) => RELATION_LABEL[relation]

function reset() {
  const empty = emptyFilters()
  query.value = empty.query
  languages.value = empty.languages
  kinds.value = empty.kinds
  repoIds.value = empty.repos
  relations.value = empty.relations
}
</script>

<template>
  <div class="filter-bar">
    <label class="filter-bar__search">
      <span class="visually-hidden">Search nodes</span>
      <input v-model="query" type="search" placeholder="Search name, purpose, path" />
      <span v-if="query.trim() !== ''" class="filter-bar__matches" aria-live="polite">
        {{ matchCount }} {{ matchCount === 1 ? 'match' : 'matches' }}
      </span>
    </label>
    <FacetGroup v-model="languages" label="Language" :options="facets.languages" :label-for="languageLabel" />
    <FacetGroup v-model="kinds" label="Kind" :options="facets.kinds" :label-for="kindName" />
    <FacetGroup v-model="repoIds" label="Repo" :options="facets.repos" :label-for="repoName" />
    <FacetGroup v-model="relations" label="Relations" :options="facets.relations" :label-for="relationName" />
    <button v-if="filtered" type="button" class="filter-bar__reset" @click="reset">Clear filters</button>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 18px;
}

.filter-bar__search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.filter-bar__search input {
  width: 220px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.filter-bar__matches {
  font-size: 12px;
  color: var(--muted);
}

.filter-bar__reset {
  padding: 2px 8px;
  border: 0;
  background: none;
  color: var(--accent);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}
</style>
