<script setup lang="ts" generic="T extends string">
/** A row of buttons of which exactly one is pressed. */
defineProps<{
  label: string
  options: readonly { value: T; label: string }[]
}>()

const selected = defineModel<T>({ required: true })
</script>

<template>
  <div class="view-switch" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="view-switch__option"
      :aria-pressed="selected === option.value"
      @click="selected = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.view-switch {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
}

.view-switch__option {
  padding: 4px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.view-switch__option[aria-pressed='true'] {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  box-shadow: var(--shadow);
}
</style>
