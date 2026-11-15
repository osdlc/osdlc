<script setup lang="ts">
// A small app over the site's data: it fetches the books' data file, the one the type index
// uses, and counts with the same filter logic.
import { computed } from 'vue'
import { filterRecords, parseState, useTypeData } from '@osdlc/corpus-site/client'

const props = defineProps<{
  /** The address of data/types/books.json. */
  dataUrl: string
}>()

const { data } = useTypeData(() => props.dataUrl)

const count = (query: string): number | null =>
  data.value === null
    ? null
    : filterRecords(data.value, parseState(query, data.value.fields)).length

const stats = computed(() => [
  { label: 'books on the shelf', value: count('') },
  { label: 'finished', value: count('status=finished') },
  { label: 'being read', value: count('status=reading') },
  { label: 'written before 1850', value: count('year=..1849') },
])
</script>

<template>
  <ul class="shelf-stats">
    <li v-for="stat in stats" :key="stat.label">
      <strong>{{ stat.value ?? '–' }}</strong>
      <span>{{ stat.label }}</span>
    </li>
  </ul>
</template>
