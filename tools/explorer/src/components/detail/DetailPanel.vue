<script setup lang="ts">
/** The side panel, or a bottom sheet on a narrow screen. The current view fills its body. */
defineProps<{ heading: string }>()

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <aside class="panel" :class="{ 'is-open': open }" aria-label="Details">
    <div class="panel__bar">
      <button
        type="button"
        class="panel__toggle"
        :aria-expanded="open"
        aria-controls="detail-panel-body"
        :title="open ? 'Hide details' : 'Show details'"
        @click="open = !open"
      >
        <span class="panel__chevron" aria-hidden="true">{{ open ? '›' : '‹' }}</span>
        <span class="panel__heading">{{ heading }}</span>
      </button>
    </div>
    <div v-show="open" id="detail-panel-body" class="panel__body">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--border);
  background: var(--surface);
}

.panel__bar {
  flex: none;
  border-bottom: 1px solid var(--border);
}

.panel__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.panel__chevron {
  font-size: 18px;
  line-height: 1;
}

.panel__heading {
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 24px;
}

/* Collapsed on a wide screen: a thin rail with the toggle. */
.panel:not(.is-open) .panel__heading {
  display: none;
}

.panel:not(.is-open) .panel__bar {
  border-bottom: 0;
}
</style>

<style scoped>
@media (max-width: 760px) {
  .panel {
    border-top: 1px solid var(--border);
    border-left: 0;
    box-shadow: 0 -4px 16px rgb(0 0 0 / 0.12);
  }

  .panel__chevron {
    transform: rotate(-90deg);
  }

  .panel:not(.is-open) .panel__heading {
    display: block;
  }
}
</style>
