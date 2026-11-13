<script setup lang="ts">
import type { Band } from '../../model/layout'
import { BAND_GUTTER } from '../../model/layout'

defineProps<{ bands: Band[] }>()

function bandStyle(band: Band) {
  return {
    left: `${band.x}px`,
    top: `${band.y}px`,
    width: `${band.width}px`,
    height: `${band.height}px`,
  }
}
</script>

<template>
  <div class="bands" aria-hidden="true">
    <div v-for="band in bands" :key="band.id" class="band" :style="bandStyle(band)">
      <div v-if="band.label" class="band__label" :style="{ width: `${BAND_GUTTER - 24}px` }">
        <strong>{{ band.label }}</strong>
        <span class="band__summary">{{ band.summary }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bands {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}

.band {
  position: absolute;
  border-top: 1px solid var(--border);
  background: var(--band-a);
}

.band:nth-child(even) {
  background: var(--band-b);
}

.band__label {
  position: absolute;
  top: 10px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--band-label);
  font-size: 12px;
  line-height: 1.3;
}

.band__summary {
  display: -webkit-box;
  overflow: hidden;
  font-size: 11px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
</style>
