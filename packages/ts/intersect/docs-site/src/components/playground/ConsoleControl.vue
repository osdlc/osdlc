<script setup>
// Ergonomic control panel for the pairwise Intersect question:
// "Do these two patterns describe overlapping sets of paths?"
// Pure L1 surface only — imported by name via the Vite alias, never `intersect/fs`.
import { ref, computed } from 'vue'
import { intersects, witness, whichMatch } from 'intersect'

// --- Inputs: one pattern per line (a line-set is a Patterns value) -----------
const DEFAULT_A = 'src/api/**'
const DEFAULT_B = 'src/**/*.ts'
const patternAText = ref(DEFAULT_A)
const patternBText = ref(DEFAULT_B)

// --- Matching options (globstarMatchesZero defaults ON) ----------------------
const DEFAULTS = { caseInsensitive: false, dot: false, globstarMatchesZero: true }
const caseInsensitive = ref(DEFAULTS.caseInsensitive)
const dot = ref(DEFAULTS.dot)
const globstarMatchesZero = ref(DEFAULTS.globstarMatchesZero)
const opts = computed(() => ({
  caseInsensitive: caseInsensitive.value,
  dot: dot.value,
  globstarMatchesZero: globstarMatchesZero.value,
}))

const toLines = (t) =>
  t
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
const setA = computed(() => toLines(patternAText.value))
const setB = computed(() => toLines(patternBText.value))

// --- The pairwise verdict ----------------------------------------------------
// state: "empty" | "overlap" | "disjoint" | "error"
const result = computed(() => {
  if (!setA.value.length || !setB.value.length) {
    return { state: 'empty', overlap: false, witness: null, error: null }
  }
  try {
    const overlap = intersects(setA.value, setB.value, opts.value)
    const w = overlap ? witness(setA.value, setB.value, opts.value) : null
    return { state: overlap ? 'overlap' : 'disjoint', overlap, witness: w, error: null }
  } catch (e) {
    return { state: 'error', overlap: false, witness: null, error: String((e && e.message) || e) }
  }
})

// Which patterns in each set the witness path actually matches (concrete feedback).
function matchedBy(set) {
  const w = result.value.witness
  if (result.value.state !== 'overlap' || !w) return []
  try {
    return whichMatch(w, set, opts.value)
  } catch {
    return []
  }
}
const matchedA = computed(() => matchedBy(setA.value))
const matchedB = computed(() => matchedBy(setB.value))

// --- Human-readable readout --------------------------------------------------
const pill = computed(() => {
  switch (result.value.state) {
    case 'overlap':
      return { label: 'Overlap', tone: 'yes' }
    case 'disjoint':
      return { label: 'Disjoint', tone: 'no' }
    case 'error':
      return { label: 'Error', tone: 'err' }
    default:
      return { label: 'Awaiting input', tone: 'idle' }
  }
})

const description = computed(() => {
  switch (result.value.state) {
    case 'overlap':
      return 'The two pattern sets overlap — at least one concrete path matches both. One such shared path is shown below.'
    case 'disjoint':
      return 'The two pattern sets are disjoint — no single path can ever match both at the same time.'
    case 'error':
      return 'A pattern could not be parsed. Fix it and the verdict updates automatically.'
    default:
      return 'Enter at least one pattern in each field. The panel compares them the moment you type.'
  }
})

// --- The equivalent call (shown subtly) --------------------------------------
const literal = (arr) => (arr.length === 1 ? JSON.stringify(arr[0]) : JSON.stringify(arr))
const optsLiteral = computed(() => {
  const parts = []
  if (caseInsensitive.value !== DEFAULTS.caseInsensitive)
    parts.push(`caseInsensitive: ${caseInsensitive.value}`)
  if (dot.value !== DEFAULTS.dot) parts.push(`dot: ${dot.value}`)
  if (globstarMatchesZero.value !== DEFAULTS.globstarMatchesZero)
    parts.push(`globstarMatchesZero: ${globstarMatchesZero.value}`)
  return parts.length ? `, { ${parts.join(', ')} }` : ''
})
const callText = computed(() => {
  if (!setA.value.length || !setB.value.length) return 'intersects(a, b)'
  return `intersects(${literal(setA.value)}, ${literal(setB.value)}${optsLiteral.value})`
})
const callReturns = computed(() => {
  switch (result.value.state) {
    case 'overlap':
      return 'true'
    case 'disjoint':
      return 'false'
    case 'error':
      return 'throws'
    default:
      return ''
  }
})

const isDefaults = computed(
  () =>
    patternAText.value === DEFAULT_A &&
    patternBText.value === DEFAULT_B &&
    caseInsensitive.value === DEFAULTS.caseInsensitive &&
    dot.value === DEFAULTS.dot &&
    globstarMatchesZero.value === DEFAULTS.globstarMatchesZero,
)
function reset() {
  patternAText.value = DEFAULT_A
  patternBText.value = DEFAULT_B
  caseInsensitive.value = DEFAULTS.caseInsensitive
  dot.value = DEFAULTS.dot
  globstarMatchesZero.value = DEFAULTS.globstarMatchesZero
}
</script>

<template>
  <section class="panel" :class="`state-${result.state}`">
    <header class="panel-head">
      <div>
        <h3 class="panel-title">Pattern overlap</h3>
        <p class="panel-sub">Do these two path patterns describe overlapping sets?</p>
      </div>
      <button class="reset" type="button" :disabled="isDefaults" @click="reset">Reset</button>
    </header>

    <!-- Two pattern fields -->
    <div class="fields">
      <label class="field">
        <span class="field-label">Pattern A</span>
        <textarea
          v-model="patternAText"
          rows="2"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          placeholder="e.g. src/api/**"
        ></textarea>
        <span class="field-hint">one pattern per line</span>
      </label>

      <div class="vs" aria-hidden="true">
        <span>vs</span>
      </div>

      <label class="field">
        <span class="field-label">Pattern B</span>
        <textarea
          v-model="patternBText"
          rows="2"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          placeholder="e.g. src/**/*.ts"
        ></textarea>
        <span class="field-hint">one pattern per line</span>
      </label>
    </div>

    <!-- Options as toggle switches -->
    <fieldset class="options">
      <legend>Match options</legend>
      <label class="switch">
        <input type="checkbox" v-model="caseInsensitive" />
        <span class="track"><span class="knob"></span></span>
        <span class="switch-text">
          <span class="switch-name">Case-insensitive</span>
          <span class="switch-note">ignore letter casing</span>
        </span>
      </label>
      <label class="switch">
        <input type="checkbox" v-model="dot" />
        <span class="track"><span class="knob"></span></span>
        <span class="switch-text">
          <span class="switch-name">Dotfiles</span>
          <span class="switch-note">let * and ** match .names</span>
        </span>
      </label>
      <label class="switch">
        <input type="checkbox" v-model="globstarMatchesZero" />
        <span class="track"><span class="knob"></span></span>
        <span class="switch-text">
          <span class="switch-name">Globstar matches zero</span>
          <span class="switch-note">** may span zero segments</span>
        </span>
      </label>
    </fieldset>

    <!-- Result readout -->
    <div class="readout" :class="`tone-${pill.tone}`">
      <div class="readout-top">
        <span class="status" :class="`tone-${pill.tone}`">{{ pill.label }}</span>
        <code v-if="callReturns" class="call">
          {{ callText }}
          <span class="arrow">→</span>
          <b>{{ callReturns }}</b>
        </code>
      </div>

      <p class="explain">{{ description }}</p>

      <p v-if="result.state === 'error'" class="error-line">{{ result.error }}</p>

      <div v-else-if="result.witness" class="witness">
        <span class="witness-label">Shared path</span>
        <code class="witness-path">{{ result.witness }}</code>
        <div class="witness-from">
          <span class="from-a">
            matched in A by
            <code v-for="p in matchedA" :key="'a-' + p" class="chip">{{ p }}</code>
          </span>
          <span class="from-b">
            matched in B by
            <code v-for="p in matchedB" :key="'b-' + p" class="chip">{{ p }}</code>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.75rem;
  padding: 1.25rem 1.35rem 1.35rem;
  background: var(--sl-color-bg);
  color: var(--sl-color-text);
  font-size: 0.9rem;
  line-height: 1.5;
}

/* ---- Header --------------------------------------------------------------- */
.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.15rem;
}
.panel-title {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.panel-sub {
  margin: 0.2rem 0 0;
  color: var(--sl-color-gray-3);
  font-size: 0.83rem;
}
.reset {
  flex: none;
  border: 1px solid var(--sl-color-hairline);
  background: transparent;
  color: var(--sl-color-gray-2);
  border-radius: 0.45rem;
  padding: 0.3rem 0.7rem;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}
.reset:hover:not(:disabled) {
  color: var(--sl-color-text);
  border-color: var(--sl-color-gray-4);
  background: var(--sl-color-gray-6);
}
.reset:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ---- Pattern fields ------------------------------------------------------- */
.fields {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}
.field-label {
  font-weight: 600;
  font-size: 0.85rem;
}
.field-hint {
  color: var(--sl-color-gray-3);
  font-size: 0.75rem;
}
textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--sl-font-mono, ui-monospace, monospace);
  font-size: 0.84rem;
  line-height: 1.5;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.5rem;
  background: var(--sl-color-bg-sidebar, var(--sl-color-bg));
  color: var(--sl-color-text);
  resize: vertical;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
textarea:focus {
  outline: none;
  border-color: var(--sl-color-accent);
  box-shadow: 0 0 0 3px var(--sl-color-accent-low);
}
.vs {
  align-self: center;
  padding-top: 1.35rem; /* nudge to line up with the textareas */
  color: var(--sl-color-gray-4);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* ---- Options / toggle switches -------------------------------------------- */
.options {
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.6rem;
  padding: 0.85rem 1rem 0.95rem;
  margin: 0 0 1.25rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.75rem 1.25rem;
  background: var(--sl-color-bg-sidebar, var(--sl-color-bg));
}
.options legend {
  padding: 0 0.4rem;
  color: var(--sl-color-gray-3);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.switch {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  user-select: none;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.track {
  flex: none;
  position: relative;
  width: 2.35rem;
  height: 1.3rem;
  border-radius: 999px;
  background: var(--sl-color-gray-5);
  border: 1px solid var(--sl-color-hairline);
  transition: background 0.16s ease;
}
.knob {
  position: absolute;
  top: 50%;
  left: 0.16rem;
  transform: translateY(-50%);
  width: 0.94rem;
  height: 0.94rem;
  border-radius: 50%;
  background: var(--sl-color-white, #fff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  transition: left 0.16s ease;
}
.switch input:checked + .track {
  background: var(--sl-color-accent);
  border-color: var(--sl-color-accent);
}
.switch input:checked + .track .knob {
  left: 1.13rem;
}
.switch input:focus-visible + .track {
  box-shadow: 0 0 0 3px var(--sl-color-accent-low);
}
.switch-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.switch-name {
  font-weight: 550;
  font-size: 0.84rem;
}
.switch-note {
  color: var(--sl-color-gray-3);
  font-size: 0.73rem;
}

/* ---- Result readout ------------------------------------------------------- */
.readout {
  border: 1px solid var(--sl-color-hairline);
  border-left-width: 3px;
  border-radius: 0.6rem;
  padding: 0.95rem 1.05rem 1.05rem;
  background: var(--sl-color-bg);
  transition: border-color 0.15s;
}
.readout.tone-yes {
  border-left-color: var(--sl-color-accent);
  background: var(--sl-color-accent-low);
}
.readout.tone-no {
  border-left-color: var(--sl-color-gray-4);
}
.readout.tone-err {
  border-left-color: #d97706;
}
.readout.tone-idle {
  border-left-color: var(--sl-color-gray-5);
}

.readout-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.65rem 0.85rem;
  margin-bottom: 0.55rem;
}
.status {
  display: inline-block;
  padding: 0.22rem 0.7rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.status.tone-yes {
  background: var(--sl-color-accent);
  color: var(--sl-color-white, #fff);
}
.status.tone-no {
  background: var(--sl-color-gray-5);
  color: var(--sl-color-gray-1);
}
.status.tone-err {
  background: #d97706;
  color: #fff;
}
.status.tone-idle {
  background: transparent;
  color: var(--sl-color-gray-3);
  border: 1px dashed var(--sl-color-gray-4);
}
.call {
  font-family: var(--sl-font-mono, ui-monospace, monospace);
  font-size: 0.78rem;
  color: var(--sl-color-gray-2);
  background: var(--sl-color-bg-sidebar, var(--sl-color-bg));
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.4rem;
  padding: 0.2rem 0.5rem;
  overflow-x: auto;
  max-width: 100%;
}
.call .arrow {
  color: var(--sl-color-gray-4);
}
.call b {
  color: var(--sl-color-text);
  font-weight: 700;
}

.explain {
  margin: 0;
  color: var(--sl-color-text);
  font-size: 0.86rem;
}

.error-line {
  margin: 0.65rem 0 0;
  font-family: var(--sl-font-mono, monospace);
  font-size: 0.8rem;
  color: #b45309;
  background: #f59e0b1a;
  border-radius: 0.4rem;
  padding: 0.5rem 0.6rem;
}

.witness {
  margin-top: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.witness-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sl-color-gray-3);
}
.witness-path {
  align-self: flex-start;
  font-family: var(--sl-font-mono, ui-monospace, monospace);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--sl-color-accent-high);
  background: var(--sl-color-bg);
  border: 1px solid var(--sl-color-accent);
  border-radius: 0.4rem;
  padding: 0.3rem 0.6rem;
}
.witness-from {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1.1rem;
  font-size: 0.78rem;
  color: var(--sl-color-gray-2);
}
.witness-from .chip {
  font-family: var(--sl-font-mono, monospace);
  font-size: 0.76rem;
  background: var(--sl-color-gray-6);
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.3rem;
  padding: 0.05rem 0.35rem;
  margin-left: 0.3rem;
  color: var(--sl-color-text);
}

/* ---- Responsive ----------------------------------------------------------- */
@media (max-width: 32rem) {
  .fields {
    grid-template-columns: 1fr;
  }
  .vs {
    padding-top: 0;
    padding: 0.1rem 0;
  }
  .readout-top {
    align-items: flex-start;
  }
}
</style>
