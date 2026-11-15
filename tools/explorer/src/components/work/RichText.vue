<script setup lang="ts">
import { computed } from 'vue'
import { textSegments } from '../../model/richText'

/** Plan text with its markdown links and inline code drawn, without v-html. */
const props = defineProps<{ text: string }>()

const segments = computed(() => textSegments(props.text))
</script>

<template>
  <p class="rich-text">
    <template v-for="(segment, i) in segments" :key="i">
      <a v-if="segment.type === 'link'" :href="segment.url" target="_blank" rel="noopener">{{ segment.text }}</a>
      <code v-else-if="segment.type === 'code'" class="rich-text__code">{{ segment.text }}</code>
      <template v-else>{{ segment.text }}</template>
    </template>
  </p>
</template>

<style scoped>
.rich-text {
  margin: 0;
  overflow-wrap: anywhere;
}

.rich-text__code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: 0.9em;
}
</style>
