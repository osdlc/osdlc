<script setup lang="ts" generic="T extends string">
defineProps<{
  label: string
  options: { value: T; count: number }[]
  labelFor: (value: T) => string
}>()

const selected = defineModel<T[]>({ required: true })

function toggle(value: T) {
  selected.value = selected.value.includes(value)
    ? selected.value.filter((v) => v !== value)
    : [...selected.value, value]
}
</script>

<template>
  <fieldset class="facet">
    <legend class="facet__label">{{ label }}</legend>
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="facet__chip"
      :aria-pressed="selected.includes(option.value)"
      @click="toggle(option.value)"
    >
      {{ labelFor(option.value) }}<span class="facet__count">{{ option.count }}</span>
    </button>
  </fieldset>
</template>

<style scoped>
.facet {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.facet__label {
  float: left;
  margin-right: 4px;
  padding: 0;
  font-size: 12px;
  color: var(--muted);
}

.facet__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font-size: 12px;
  cursor: pointer;
}

.facet__chip[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}

.facet__chip[aria-pressed='true']::before {
  content: '✓';
}

.facet__count {
  color: var(--muted);
  font-size: 11px;
  font-weight: 400;
}
</style>
