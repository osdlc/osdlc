<script setup lang="ts">
import { BaseEdge, type EdgeProps } from '@vue-flow/core'
import { computed } from 'vue'

/** An edge that leaves the top of one card and arcs down onto the top of another in the same row. */
const props = defineProps<EdgeProps>()

const RISE = 46

const path = computed(() => {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = props
  return `M ${sx},${sy} C ${sx},${sy - RISE} ${tx},${ty - RISE} ${tx},${ty}`
})
</script>

<template>
  <BaseEdge :id="id" :path="path" :marker-end="markerEnd" :style="style" />
</template>
