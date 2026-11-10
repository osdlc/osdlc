<script setup lang="ts">
import type { ViewMode } from '../../model/types'
import { VIEW_LABEL } from '../../model/view'

defineProps<{ view: ViewMode }>()
</script>

<template>
  <div class="legend">
    <span class="legend__title">Legend</span>
    <ul v-if="view === 'compare'" class="legend__list">
      <li><span class="swatch swatch--both" />In both states</li>
      <li><span class="swatch swatch--removed">−</span>Going away</li>
      <li><span class="swatch swatch--added">+</span>New</li>
      <li><span class="badge">⇢ moves</span>Changes repo</li>
      <li>
        <svg class="line" viewBox="0 0 36 8" aria-hidden="true"><line x1="0" y1="4" x2="36" y2="4" class="line--both" /></svg>
        Edge in both
      </li>
      <li>
        <svg class="line" viewBox="0 0 36 8" aria-hidden="true"><line x1="0" y1="4" x2="36" y2="4" class="line--removed" /></svg>
        Edge going away
      </li>
      <li>
        <svg class="line" viewBox="0 0 36 8" aria-hidden="true"><line x1="0" y1="4" x2="36" y2="4" class="line--added" /></svg>
        New edge
      </li>
    </ul>
    <span v-else class="legend__note">Showing the {{ VIEW_LABEL[view].toLowerCase() }} state only. Switch to Compare to see what changes.</span>
    <span class="legend__item">
      <svg class="line" viewBox="0 0 36 8" aria-hidden="true"><line x1="2" y1="4" x2="34" y2="4" class="line--overlap" /></svg>
      <span class="badge badge--overlap">≈</span>Overlap: two things do some of the same job (no arrow)
    </span>
    <span class="legend__note">Arrows point from a node to what it uses, implements or checks. A card with a TypeScript and a Rust logo is a twin pair. The left stripe is the repo.</span>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  font-size: 12px;
}

.legend__title {
  color: var(--muted);
}

.legend__list {
  display: contents;
  list-style: none;
}

.legend__list li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend__item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend__note {
  color: var(--muted);
}

.swatch {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 14px;
  border: 1.5px solid var(--border-strong);
  border-radius: 3px;
  background: var(--surface);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.swatch--removed {
  border-style: dashed;
  border-color: var(--removed);
  background: var(--removed-bg);
  color: var(--removed);
}

.swatch--added {
  border-color: var(--added);
  background: var(--added-bg);
  color: var(--added);
}

.badge {
  padding: 0 4px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  font-size: 10.5px;
  white-space: nowrap;
}

.line {
  flex: none;
  width: 30px;
  height: 8px;
}

.line line {
  stroke-width: 2;
}

.line--both {
  stroke: var(--edge-both);
}

.line--removed {
  stroke: var(--removed);
  stroke-dasharray: 5 3;
}

.line .line--overlap {
  stroke: var(--overlap);
  stroke-width: 3;
  stroke-dasharray: 0.5 5;
  stroke-linecap: round;
}

.badge--overlap {
  border: 1.5px dotted var(--overlap);
  background: var(--overlap-bg);
  color: var(--overlap-text);
  font-weight: 700;
}

.line--added {
  stroke: var(--added);
  stroke-width: 2.5;
}
</style>
