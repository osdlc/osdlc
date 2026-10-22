<script setup>
// Plain-unix-shell playground for Intersect: type two patterns, see whether
// their match-sets intersect and one concrete path that witnesses it.
// Pure L1 surface only — imported by name via the Vite alias, never `intersect/fs`.
import { ref, computed } from 'vue'
import { intersects, witness } from '@osdlc/intersect'

// --- Two patterns, pre-filled so the shell demos itself ----------------------
const patternA = ref('src/api/**')
const patternB = ref('src/**/*.ts')

// --- Options (globstarMatchesZero defaults ON) -------------------------------
const caseInsensitive = ref(false)
const dot = ref(false)
const globstarMatchesZero = ref(true)
const opts = computed(() => ({
  caseInsensitive: caseInsensitive.value,
  dot: dot.value,
  globstarMatchesZero: globstarMatchesZero.value,
}))

// --- Evaluate quietly; surface throws instead of crashing --------------------
const result = computed(() => {
  const a = patternA.value.trim()
  const b = patternB.value.trim()
  if (!a || !b) return { state: 'empty' }
  try {
    const ok = intersects(a, b, opts.value)
    return { state: 'ok', ok, witness: ok ? witness(a, b, opts.value) : null }
  } catch (e) {
    return { state: 'error', message: String((e && e.message) || e) }
  }
})

// --- The equivalent call, shown quietly (only non-default opts appear) -------
const callText = computed(() => {
  const a = JSON.stringify(patternA.value.trim())
  const b = JSON.stringify(patternB.value.trim())
  const changed = []
  if (caseInsensitive.value) changed.push('caseInsensitive: true')
  if (dot.value) changed.push('dot: true')
  if (!globstarMatchesZero.value) changed.push('globstarMatchesZero: false')
  return changed.length
    ? `intersects(${a}, ${b}, { ${changed.join(', ')} })`
    : `intersects(${a}, ${b})`
})

const flags = [
  { key: caseInsensitive, label: 'caseInsensitive' },
  { key: dot, label: 'dot' },
  { key: globstarMatchesZero, label: 'globstarMatchesZero' },
]
</script>

<template>
  <div class="console" role="group" aria-label="intersects shell">
    <!-- input line: prompt glyph, verb, two compact pattern fields -->
    <div class="line">
      <span class="prompt" aria-hidden="true">&#10095;</span>
      <span class="verb">intersects</span>
      <label class="arg">
        <span class="tag" aria-hidden="true">a</span>
        <input
          v-model="patternA"
          type="text"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          aria-label="pattern a"
        />
      </label>
      <label class="arg">
        <span class="tag" aria-hidden="true">b</span>
        <input
          v-model="patternB"
          type="text"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          aria-label="pattern b"
        />
      </label>
    </div>

    <!-- result line -->
    <div class="out" aria-live="polite">
      <template v-if="result.state === 'empty'">
        <span class="hint">type a pattern in both a and b</span>
      </template>

      <template v-else-if="result.state === 'error'">
        <div class="res err">
          <span class="arrow" aria-hidden="true">&#8594;</span>
          <span class="val">error</span>
        </div>
        <div class="note err-msg">{{ result.message }}</div>
      </template>

      <template v-else>
        <div class="res" :class="result.ok ? 'yes' : 'no'">
          <span class="arrow" aria-hidden="true">&#8594;</span>
          <span class="val">{{ result.ok }}</span>
        </div>
        <div class="note">
          <template v-if="result.ok">
            <span class="k">witness</span>
            <code class="w">{{ result.witness }}</code>
          </template>
          <template v-else>
            <span class="k disjoint">disjoint</span>
            <span class="dim">— no path matches both</span>
          </template>
        </div>
      </template>
    </div>

    <!-- the call, shown quietly -->
    <code class="call">{{ callText }}</code>

    <!-- three inline option flags -->
    <div class="flags">
      <button
        v-for="f in flags"
        :key="f.label"
        type="button"
        class="flag"
        :class="{ on: f.key.value }"
        :aria-pressed="f.key.value"
        @click="f.key.value = !f.key.value"
      >
        <span class="box" aria-hidden="true">{{ f.key.value ? 'x' : ' ' }}</span>
        {{ f.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.console {
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.5rem;
  padding: 0.9rem 1rem;
  background: var(--sl-color-bg);
  color: var(--sl-color-text);
  font-family: var(--sl-font-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: 0.9rem;
  line-height: 1.5;
}

/* input line -------------------------------------------------------------- */
.line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.prompt {
  color: var(--sl-color-accent);
  font-weight: 700;
  user-select: none;
}
.verb {
  color: var(--sl-color-gray-2);
}
.arg {
  display: inline-flex;
  align-items: stretch;
  flex: 1 1 12rem;
  min-width: 9rem;
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.35rem;
  background: var(--sl-color-bg-sidebar, var(--sl-color-bg));
  overflow: hidden;
}
.arg:focus-within {
  border-color: var(--sl-color-accent);
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 0 0.5rem;
  background: var(--sl-color-gray-6);
  color: var(--sl-color-gray-3);
  border-right: 1px solid var(--sl-color-hairline);
  font-size: 0.78rem;
  user-select: none;
}
.arg input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: none;
  padding: 0.35rem 0.55rem;
  background: transparent;
  color: var(--sl-color-text);
  font: inherit;
}

/* result ------------------------------------------------------------------ */
.out {
  margin-top: 0.9rem;
  min-height: 2.6rem;
}
.res {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.arrow {
  color: var(--sl-color-gray-4);
}
.val {
  font-weight: 700;
}
.res.yes .val {
  color: var(--sl-color-accent-high);
}
.res.no .val {
  color: var(--sl-color-gray-3);
}
.res.err .val {
  color: var(--sl-color-red, #d14343);
}
.note {
  margin-top: 0.2rem;
  padding-left: 1.1rem;
  font-size: 0.84rem;
  color: var(--sl-color-gray-2);
}
.k {
  color: var(--sl-color-gray-3);
}
.k.disjoint {
  color: var(--sl-color-gray-2);
  font-weight: 600;
}
.w {
  color: var(--sl-color-text);
  background: var(--sl-color-accent-low);
  padding: 0.05rem 0.35rem;
  border-radius: 0.25rem;
}
.dim {
  color: var(--sl-color-gray-4);
}
.hint {
  color: var(--sl-color-gray-4);
  font-style: italic;
}
.err-msg {
  color: var(--sl-color-red, #d14343);
  white-space: pre-wrap;
  word-break: break-word;
}

/* the quiet call ---------------------------------------------------------- */
.call {
  display: block;
  margin-top: 0.4rem;
  padding: 0.4rem 0;
  color: var(--sl-color-gray-4);
  font-size: 0.82rem;
  white-space: pre-wrap;
  word-break: break-word;
  background: none;
}

/* option flags ------------------------------------------------------------ */
.flags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.75rem;
  margin-top: 0.7rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--sl-color-hairline);
}
.flag {
  border: 0;
  background: none;
  padding: 0.1rem 0;
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
  color: var(--sl-color-gray-3);
}
.flag:hover {
  color: var(--sl-color-text);
}
.flag.on {
  color: var(--sl-color-text);
}
.flag .box {
  color: var(--sl-color-gray-4);
  white-space: pre;
}
.flag .box::before {
  content: '[';
}
.flag .box::after {
  content: ']';
}
.flag.on .box {
  color: var(--sl-color-accent-high);
}
</style>
