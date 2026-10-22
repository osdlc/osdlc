<script setup>
// Visual match-grid playground for Intersect.
// Pure L1 surface only — imported by name via the Vite alias, never `intersect/fs`.
import { ref, computed } from 'vue'
import { matches, whichMatch, overlapping, witness, intersects } from '@osdlc/intersect'

const mode = ref('membership') // "membership" | "overlap"

// --- Matching options (globstarMatchesZero defaults ON) ---------------------
const caseInsensitive = ref(false)
const dot = ref(false)
const globstarMatchesZero = ref(true)
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

// --- Membership matrix -------------------------------------------------------
const patternsText = ref(['src/api/**', 'src/**/*.ts', '**/*.test.ts', 'docs/**'].join('\n'))
const pathsText = ref(
  [
    'src/api/handler.ts',
    'src/api/user.test.ts',
    'src/web/page.ts',
    'docs/intro.md',
    'README.md',
  ].join('\n'),
)

const patterns = computed(() => toLines(patternsText.value))
const paths = computed(() => toLines(pathsText.value))

function cell(path, pattern) {
  try {
    return { ok: matches(path, pattern, opts.value), error: null }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
}

const rows = computed(() =>
  paths.value.map((p) => {
    const cells = patterns.value.map((pat) => ({ pattern: pat, ...cell(p, pat) }))
    return { path: p, cells, inScope: cells.some((c) => c.ok) }
  }),
)

const scopedCount = computed(() => rows.value.filter((r) => r.inScope).length)

// Click a cell to inspect the pair.
const selected = ref(null) // { path, pattern }
function select(path, pattern) {
  const s = selected.value
  selected.value = s && s.path === path && s.pattern === pattern ? null : { path, pattern }
}
const detail = computed(() => {
  if (!selected.value) return null
  const { path, pattern } = selected.value
  try {
    const ok = matches(path, pattern, opts.value)
    return {
      path,
      pattern,
      ok,
      witness: ok ? witness(pattern, path, opts.value) : null,
      all: whichMatch(path, patterns.value, opts.value),
      error: null,
    }
  } catch (e) {
    return {
      path,
      pattern,
      ok: false,
      witness: null,
      all: [],
      error: String((e && e.message) || e),
    }
  }
})

// --- Set-overlap mode --------------------------------------------------------
const setAText = ref(['src/api/**', 'src/db/schema.ts'].join('\n'))
const setBText = ref(['src/api/routes/*.ts', 'docs/**'].join('\n'))
const setA = computed(() => toLines(setAText.value))
const setB = computed(() => toLines(setBText.value))

const overlap = computed(() => {
  try {
    return {
      aInB: overlapping(setA.value, setB.value, opts.value), // A members overlapping B
      bInA: overlapping(setB.value, setA.value, opts.value), // B members overlapping A
      any: intersects(setA.value, setB.value, opts.value),
      witness: witness(setA.value, setB.value, opts.value),
      error: null,
    }
  } catch (e) {
    return { aInB: [], bInA: [], any: false, witness: null, error: String((e && e.message) || e) }
  }
})
const inA = (p) => overlap.value.aInB.includes(p)
const inB = (p) => overlap.value.bInA.includes(p)
</script>

<template>
  <div class="grid-pg">
    <div class="toolbar">
      <div class="modes" role="tablist">
        <button
          role="tab"
          :class="{ active: mode === 'membership' }"
          :aria-selected="mode === 'membership'"
          @click="mode = 'membership'"
        >
          Membership grid
        </button>
        <button
          role="tab"
          :class="{ active: mode === 'overlap' }"
          :aria-selected="mode === 'overlap'"
          @click="mode = 'overlap'"
        >
          Set overlap
        </button>
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

    <!-- Membership grid -->
    <template v-if="mode === 'membership'">
      <div class="inputs">
        <label class="field">
          <span>
            Patterns
            <small>one per line</small>
          </span>
          <textarea v-model="patternsText" rows="4" spellcheck="false"></textarea>
        </label>
        <label class="field">
          <span>
            Paths
            <small>one per line</small>
          </span>
          <textarea v-model="pathsText" rows="4" spellcheck="false"></textarea>
        </label>
      </div>

      <p v-if="!patterns.length || !paths.length" class="empty">
        Enter at least one pattern and one path.
      </p>

      <div v-else class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="corner">path \ pattern</th>
              <th v-for="pat in patterns" :key="pat" class="pat">
                <code>{{ pat }}</code>
              </th>
              <th class="scope-h">in scope?</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.path">
              <th class="path">
                <code>{{ row.path }}</code>
              </th>
              <td
                v-for="c in row.cells"
                :key="c.pattern"
                class="cell"
                :class="{
                  hit: c.ok,
                  err: c.error,
                  sel: selected && selected.path === row.path && selected.pattern === c.pattern,
                }"
                :title="c.error || (c.ok ? 'match' : 'no match')"
                @click="select(row.path, c.pattern)"
              >
                <span v-if="c.error">!</span>
                <span v-else-if="c.ok" class="dot">●</span>
                <span v-else class="miss">·</span>
              </td>
              <td class="scope" :class="{ yes: row.inScope }">
                {{ row.inScope ? '✓' : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="summary">
        {{ scopedCount }} / {{ rows.length }} path{{ rows.length === 1 ? '' : 's' }} fall in scope
        (match at least one pattern).
      </p>

      <div v-if="detail" class="detail">
        <div class="detail-head">
          <span class="badge" :class="detail.ok ? 'ok' : 'no'">
            {{ detail.error ? 'error' : detail.ok ? 'matches' : 'no match' }}
          </span>
          <code>matches("{{ detail.path }}", "{{ detail.pattern }}")</code>
        </div>
        <p v-if="detail.error" class="detail-err">{{ detail.error }}</p>
        <template v-else>
          <p v-if="detail.witness">
            witness:
            <code>{{ detail.witness }}</code>
          </p>
          <p>
            all patterns matching
            <code>{{ detail.path }}</code>
            :
            <template v-if="detail.all.length">
              <code v-for="p in detail.all" :key="p" class="chip">{{ p }}</code>
            </template>
            <em v-else>none</em>
          </p>
        </template>
      </div>
    </template>

    <!-- Set overlap -->
    <template v-else>
      <div class="inputs">
        <label class="field">
          <span>
            Set A
            <small>one pattern per line</small>
          </span>
          <textarea v-model="setAText" rows="4" spellcheck="false"></textarea>
        </label>
        <label class="field">
          <span>
            Set B
            <small>one pattern per line</small>
          </span>
          <textarea v-model="setBText" rows="4" spellcheck="false"></textarea>
        </label>
      </div>

      <div class="overlap-head">
        <span class="badge" :class="overlap.any ? 'ok' : 'no'">
          {{ overlap.error ? 'error' : overlap.any ? 'overlap' : 'disjoint' }}
        </span>
        <span v-if="overlap.witness">
          shared path:
          <code>{{ overlap.witness }}</code>
        </span>
        <span v-else-if="!overlap.error" class="muted">no shared path</span>
      </div>
      <p v-if="overlap.error" class="detail-err">{{ overlap.error }}</p>

      <div class="sets">
        <div class="set">
          <h4>
            Set A
            <small>lit = overlaps B</small>
          </h4>
          <ul>
            <li v-for="p in setA" :key="p" :class="{ hit: inA(p) }">
              <span class="dot">{{ inA(p) ? '●' : '·' }}</span>
              <code>{{ p }}</code>
            </li>
          </ul>
        </div>
        <div class="set">
          <h4>
            Set B
            <small>lit = overlaps A</small>
          </h4>
          <ul>
            <li v-for="p in setB" :key="p" :class="{ hit: inB(p) }">
              <span class="dot">{{ inB(p) ? '●' : '·' }}</span>
              <code>{{ p }}</code>
            </li>
          </ul>
        </div>
      </div>
      <p class="summary">
        <code>overlapping(A, B)</code>
        returns the
        <strong>A</strong>
        members that overlap B (and vice-versa);
        <code>witness</code>
        names one concrete path both sets match.
      </p>
    </template>
  </div>
</template>

<style scoped>
.grid-pg {
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.6rem;
  padding: 1rem;
  background: var(--sl-color-bg);
  font-size: 0.9rem;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.modes {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.5rem;
  overflow: hidden;
}
.modes button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  line-height: 1.2;
  border: 0;
  background: transparent;
  color: var(--sl-color-gray-2);
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font: inherit;
}
.modes button.active {
  background: var(--sl-color-accent);
  color: var(--sl-color-white);
}
.opts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.9rem;
  font-size: 0.8rem;
  color: var(--sl-color-gray-2);
}
.opts label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
}

.inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
@media (max-width: 34rem) {
  .inputs {
    grid-template-columns: 1fr;
  }
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.field span {
  font-weight: 600;
}
.field small {
  font-weight: 400;
  color: var(--sl-color-gray-3);
  margin-left: 0.35rem;
}
textarea {
  font-family: var(--sl-font-mono, ui-monospace, monospace);
  font-size: 0.82rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.4rem;
  background: var(--sl-color-bg-sidebar, var(--sl-color-bg));
  color: var(--sl-color-text);
  resize: vertical;
}

.matrix-wrap {
  overflow-x: auto;
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.4rem;
}
.matrix {
  border-collapse: collapse;
  width: 100%;
  font-family: var(--sl-font-mono, ui-monospace, monospace);
}
.matrix th,
.matrix td {
  border: 1px solid var(--sl-color-hairline);
  padding: 0.3rem 0.5rem;
}
.matrix thead th {
  background: var(--sl-color-gray-6);
  font-weight: 600;
  white-space: nowrap;
  font-size: 0.8rem;
}
.matrix .corner {
  text-align: left;
  color: var(--sl-color-gray-3);
  font-weight: 400;
}
.matrix th.pat code,
.matrix th.path code {
  background: none;
  padding: 0;
}
.matrix th.path {
  text-align: left;
  background: var(--sl-color-gray-6);
  white-space: nowrap;
  font-weight: 500;
}
.cell {
  text-align: center;
  cursor: pointer;
  min-width: 2.2rem;
  color: var(--sl-color-gray-4);
}
.cell .miss {
  opacity: 0.5;
}
.cell.hit {
  background: var(--sl-color-accent-low);
}
.cell.hit .dot {
  color: var(--sl-color-accent-high);
}
.cell.err {
  background: #f59e0b33;
  color: #b45309;
  font-weight: 700;
}
.cell.sel {
  outline: 2px solid var(--sl-color-accent-high);
  outline-offset: -2px;
}
.scope-h {
  white-space: nowrap;
}
.scope {
  text-align: center;
  color: var(--sl-color-gray-4);
}
.scope.yes {
  color: var(--sl-color-accent-high);
  font-weight: 700;
  background: var(--sl-color-accent-low);
}

.summary {
  margin: 0.8rem 0 0;
  color: var(--sl-color-gray-2);
  font-size: 0.83rem;
}
.empty {
  color: var(--sl-color-gray-3);
  font-style: italic;
}

.detail {
  margin-top: 1rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.4rem;
  background: var(--sl-color-bg-sidebar, var(--sl-color-bg));
}
.detail-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.4rem;
}
.detail p {
  margin: 0.25rem 0;
}
.detail-err {
  color: #b45309;
  font-family: var(--sl-font-mono, monospace);
  font-size: 0.82rem;
}
.chip {
  margin-right: 0.3rem;
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.badge.ok {
  background: var(--sl-color-accent);
  color: var(--sl-color-white);
}
.badge.no {
  background: var(--sl-color-gray-5);
  color: var(--sl-color-gray-1);
}

.overlap-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.9rem;
}
.muted {
  color: var(--sl-color-gray-3);
}
.sets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem;
}
@media (max-width: 34rem) {
  .sets {
    grid-template-columns: 1fr;
  }
}
.set {
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.4rem;
  padding: 0.6rem 0.75rem;
}
.set h4 {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
}
.set h4 small {
  font-weight: 400;
  color: var(--sl-color-gray-3);
  margin-left: 0.35rem;
}
.set ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.set li {
  color: var(--sl-color-gray-3);
  font-family: var(--sl-font-mono, monospace);
  font-size: 0.82rem;
}
.set li.hit {
  color: var(--sl-color-text);
}
.set li.hit .dot {
  color: var(--sl-color-accent-high);
}
.set .dot {
  display: inline-block;
  width: 1rem;
}
</style>
