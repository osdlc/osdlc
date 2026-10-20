<script setup>
// "Inline expression" console variant — the primitive rendered as a live,
// editable formula. Pure L1 surface only; theme-aware via Starlight vars.
import { ref, computed } from 'vue'
import { intersects, witness } from 'intersect'

const a = ref('src/api/**')
const b = ref('src/**/*.ts')

const caseInsensitive = ref(false)
const dot = ref(false)
const globstarMatchesZero = ref(true)
const opts = computed(() => ({
  caseInsensitive: caseInsensitive.value,
  dot: dot.value,
  globstarMatchesZero: globstarMatchesZero.value,
}))

const result = computed(() => {
  try {
    return {
      ok: intersects(a.value, b.value, opts.value),
      witness: witness(a.value, b.value, opts.value),
      error: null,
    }
  } catch (e) {
    return { ok: null, witness: null, error: String((e && e.message) || e) }
  }
})

// Auto-size the inline inputs to their content.
const sizeFor = (s) => Math.min(42, Math.max(6, (s ? s.length : 0) + 1))
</script>

<template>
  <div class="ci">
    <div class="expr" :class="{ err: result.error }">
      <span class="fn">intersects</span>
      <span class="punct">(</span>
      <input class="arg" v-model="a" :size="sizeFor(a)" spellcheck="false" aria-label="pattern A" />
      <span class="punct">,</span>
      <input class="arg" v-model="b" :size="sizeFor(b)" spellcheck="false" aria-label="pattern B" />
      <span class="punct">)</span>
      <span class="eq">=</span>
      <span v-if="result.error" class="val err-val">error</span>
      <span v-else class="val" :class="result.ok ? 'yes' : 'no'">{{ result.ok }}</span>
    </div>

    <div v-if="result.error" class="errline">{{ result.error }}</div>
    <div v-else class="secondary">
      <span class="fn">witness</span>
      <span class="punct">(a, b)</span>
      <span class="eq">=</span>
      <span class="val">
        {{ result.witness === null ? 'null' : JSON.stringify(result.witness) }}
      </span>
      <span class="hint">
        {{ result.witness === null ? '— disjoint' : '— a concrete path both match' }}
      </span>
    </div>

    <div class="opts">
      <label>
        <input type="checkbox" v-model="caseInsensitive" />
        caseInsensitive
      </label>
      <label>
        <input type="checkbox" v-model="dot" />
        dot
      </label>
      <label>
        <input type="checkbox" v-model="globstarMatchesZero" />
        globstarMatchesZero
      </label>
    </div>
  </div>
</template>

<style scoped>
.ci {
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.6rem;
  padding: 1.1rem 1.2rem;
  background: var(--sl-color-bg);
  font-family: var(--sl-font-mono, ui-monospace, monospace);
}
.expr {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  font-size: 1.1rem;
  line-height: 2;
}
.fn {
  color: var(--sl-color-accent-high);
  font-weight: 600;
}
.punct {
  color: var(--sl-color-gray-3);
}
.eq {
  color: var(--sl-color-gray-3);
  margin: 0 0.2rem;
}
.arg {
  font: inherit;
  color: var(--sl-color-text);
  background: var(--sl-color-bg-sidebar, var(--sl-color-gray-6));
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.3rem;
  padding: 0.05rem 0.4rem;
}
.arg:focus {
  outline: 2px solid var(--sl-color-accent);
  outline-offset: 0;
}
.val {
  font-weight: 700;
}
.val.yes {
  color: #16a34a;
}
.val.no {
  color: var(--sl-color-gray-2);
}
.err-val,
.errline {
  color: #dc2626;
}
.errline {
  margin-top: 0.5rem;
  font-size: 0.85rem;
}
.secondary {
  margin-top: 0.75rem;
  font-size: 0.95rem;
  color: var(--sl-color-gray-2);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}
.secondary .val {
  color: var(--sl-color-text);
  font-weight: 600;
}
.hint {
  color: var(--sl-color-gray-3);
  font-style: italic;
  font-family: var(--sl-font-system, system-ui, sans-serif);
}
.opts {
  margin-top: 1.1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  font-family: var(--sl-font-system, system-ui, sans-serif);
  font-size: 0.82rem;
  color: var(--sl-color-gray-2);
}
.opts label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
}
</style>
