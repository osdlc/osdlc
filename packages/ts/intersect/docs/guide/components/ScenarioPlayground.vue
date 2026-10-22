<script setup>
// Guided-scenarios playground for Intersect: pick a workflow, edit the
// pre-filled inputs, read a verdict that updates live.
// Pure L1 surface only — imported by name via the Vite alias, never `intersect/fs`.
// Everything here is synchronous and SSR-safe: no window/document at setup top level.
import { reactive, ref, computed } from 'vue'
import { overlapping, witness, index, matches } from '@osdlc/intersect'

/* ------------------------------------------------------------------ tabs */

const tabs = [
  {
    key: 'conflict',
    label: 'Will these collide?',
    blurb:
      "Two ready work items each claim the paths they'll touch — as globs, not a fixed file list. Intersect predicts a merge conflict before either one is dispatched.",
  },
  {
    key: 'guideline',
    label: 'Which guidelines apply?',
    blurb:
      "A registry of labeled pattern-sets — guidelines, standards, policies. Ask which ones govern the place you're about to work, returned in priority order.",
  },
  {
    key: 'subtree',
    label: 'Exact vs subtree',
    blurb:
      'A bare path means the path itself; a trailing ** opts into everything beneath it. One toggle, and the difference stops being a footgun.',
  },
]
const active = ref('conflict')
const activeTab = computed(() => tabs.find((t) => t.key === active.value))

/* ------------------------------------------------ helpers */

// Globs may contain commas inside `{a,b}` alternation, so never split on commas.
// Whitespace is safe: real path globs don't contain spaces.
function splitPatterns(str) {
  return str
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/* ----------------------------------------- scenario 1: conflict detection */

const s1 = reactive({
  a: { id: 'T-1', claims: ['src/api/**', 'src/db/schema.ts'] },
  b: { id: 'T-2', claims: ['src/api/routes/*.ts', 'docs/**'] },
})
const s1items = computed(() => [s1.a, s1.b])

function addClaim(item) {
  item.claims.push('')
}
function removeClaim(item, i) {
  item.claims.splice(i, 1)
}

const s1View = computed(() => {
  const idA = s1.a.id.trim() || 'Item A'
  const idB = s1.b.id.trim() || 'Item B'
  const claimsA = s1.a.claims.map((c) => c.trim()).filter(Boolean)
  const claimsB = s1.b.claims.map((c) => c.trim()).filter(Boolean)
  if (!claimsA.length || !claimsB.length) {
    return {
      tone: 'neutral',
      badge: 'Waiting for claims',
      sentence: `Give both ${idA} and ${idB} at least one path claim to compare.`,
    }
  }
  try {
    const overlaps = overlapping(claimsA, claimsB)
    const call = `overlapping(${idA}.claims, ${idB}.claims)`
    if (overlaps.length) {
      const example = witness(claimsA, claimsB)
      return {
        tone: 'warn',
        badge: 'Conflict predicted',
        sentence: example
          ? `${idA} and ${idB} both reach ${example} — they'd collide at merge. Serialize them (or warn) instead of dispatching in parallel.`
          : `${idA} and ${idB} share overlapping claims — treat this as a likely conflict.`,
        overlaps,
        example,
        call,
      }
    }
    return {
      tone: 'good',
      badge: 'Safe to parallelize',
      sentence: `No shared path — ${idA} and ${idB} touch different parts of the tree, so they're safe to run in parallel.`,
      overlaps: [],
      example: null,
      call,
    }
  } catch (e) {
    return { tone: 'error', badge: 'Pattern error', sentence: String(e) }
  }
})

/* --------------------------------------- scenario 2: guideline resolution */

const s2 = reactive({
  mode: 'scope', // "scope" -> applicableTo | "path" -> matching
  scope: 'src/siteA/components/**',
  entries: [
    { id: 'guidelines/UI', patterns: '**/*.{vue,html,jsx}' },
    { id: 'guidelines/UI/vue', patterns: '**/*.vue' },
    { id: 'guidelines/api', patterns: 'src/api/**' },
  ],
})

function addEntry() {
  s2.entries.push({ id: '', patterns: '' })
}
function removeEntry(i) {
  s2.entries.splice(i, 1)
}

const s2View = computed(() => {
  const scope = s2.scope.trim()
  const entries = s2.entries
    .map((e) => ({ id: e.id.trim(), patterns: splitPatterns(e.patterns) }))
    .filter((e) => e.id && e.patterns.length)
  if (!entries.length || !scope) {
    return {
      tone: 'neutral',
      badge: 'Waiting for input',
      sentence: 'Add at least one labeled pattern-set and a target to resolve.',
    }
  }
  try {
    const reg = index(entries)
    const ids = s2.mode === 'scope' ? reg.applicableTo(scope) : reg.matching(scope)
    const byId = Object.fromEntries(entries.map((e) => [e.id, e.patterns]))
    const call =
      s2.mode === 'scope'
        ? `registry.applicableTo(${JSON.stringify(scope)})`
        : `registry.matching(${JSON.stringify(scope)})`
    if (!ids.length) {
      return {
        tone: 'neutral',
        badge: 'Nothing applies',
        sentence:
          s2.mode === 'scope'
            ? `Nothing in the registry overlaps ${scope}.`
            : `No pattern-set matches the file ${scope}.`,
        ids: [],
        byId,
        call,
      }
    }
    const last = ids[ids.length - 1]
    return {
      tone: 'info',
      badge: `${ids.length} ${ids.length === 1 ? 'applies' : 'apply'}`,
      sentence:
        s2.mode === 'scope'
          ? `For work under ${scope}, these apply in priority order — general first, specific last. The most specific, ${last}, wins when guidance conflicts.`
          : `For the file ${scope}, these match in registration order. ${last} is the most specific.`,
      ids,
      byId,
      call,
    }
  } catch (e) {
    return { tone: 'error', badge: 'Registry error', sentence: String(e) }
  }
})

/* ------------------------------------------ scenario 3: exact vs subtree */

const s3 = reactive({
  dir: 'src/api',
  path: 'src/api/routes/list.ts',
})

const s3View = computed(() => {
  const dir = s3.dir.trim().replace(/\/+$/, '')
  const path = s3.path.trim()
  if (!dir || !path) {
    return {
      tone: 'neutral',
      badge: 'Waiting for input',
      sentence: 'Enter a directory and a path to compare.',
    }
  }
  try {
    const exactPat = dir
    const subtreePat = `${dir}/**`
    const exactMatch = matches(path, exactPat)
    const subtreeMatch = matches(path, subtreePat)
    const selfMatch = matches(dir, exactPat)
    return {
      tone: 'info',
      badge: 'Exact vs subtree',
      exactPat,
      subtreePat,
      exactMatch,
      subtreeMatch,
      selfMatch,
      path,
      sentence: `A bare ${exactPat} is an exact match — it matches ${exactPat} itself but not files beneath it. Add /** to opt into the whole subtree.`,
    }
  } catch (e) {
    return { tone: 'error', badge: 'Pattern error', sentence: String(e) }
  }
})
</script>

<template>
  <div class="scenario-playground" role="region" aria-label="Intersect guided scenarios">
    <header class="sp-head">
      <h2 class="sp-title">Try it on a real workflow</h2>
      <p class="sp-sub">
        Pick a scenario, edit the pre-filled inputs, and watch Intersect explain the outcome in
        plain English.
      </p>
    </header>

    <nav class="sp-tabs" role="tablist" aria-label="Scenarios">
      <button
        v-for="t in tabs"
        :key="t.key"
        role="tab"
        type="button"
        :aria-selected="active === t.key"
        :class="['sp-tab', { 'is-active': active === t.key }]"
        @click="active = t.key"
      >
        {{ t.label }}
      </button>
    </nav>

    <p class="sp-blurb">{{ activeTab.blurb }}</p>

    <!-- =============================================== conflict detection -->
    <section v-if="active === 'conflict'" class="sp-card" aria-label="Conflict detection">
      <div class="conflict-grid">
        <div v-for="(item, idx) in s1items" :key="idx" class="workitem">
          <label class="mini-label">
            Work item
            <input
              v-model="item.id"
              class="id-input"
              type="text"
              spellcheck="false"
              aria-label="Work item id"
            />
          </label>
          <div class="claims">
            <div class="claims-label">claims these paths</div>
            <div v-for="(claim, ci) in item.claims" :key="ci" class="claim-row">
              <input
                v-model="item.claims[ci]"
                class="glob-input"
                type="text"
                spellcheck="false"
                autocapitalize="off"
                placeholder="src/api/**"
                aria-label="Claimed glob"
              />
              <button
                type="button"
                class="icon-btn"
                aria-label="Remove claim"
                @click="removeClaim(item, ci)"
              >
                &times;
              </button>
            </div>
            <button type="button" class="add-btn" @click="addClaim(item)">+ add a claim</button>
          </div>
        </div>
      </div>

      <div class="sp-result" :class="'tone-' + s1View.tone">
        <div class="verdict-head">
          <span class="badge">
            <span class="dot" />
            {{ s1View.badge }}
          </span>
        </div>
        <p class="verdict-sentence">{{ s1View.sentence }}</p>

        <div v-if="s1View.overlaps && s1View.overlaps.length" class="detail-block">
          <span class="detail-label">overlapping claim(s)</span>
          <span class="chips">
            <code v-for="o in s1View.overlaps" :key="o" class="chip">{{ o }}</code>
          </span>
        </div>
        <div v-if="s1View.example" class="detail-block">
          <span class="detail-label">witness path</span>
          <code class="chip strong">{{ s1View.example }}</code>
        </div>
        <p v-if="s1View.call" class="ran-line">
          ran
          <code>{{ s1View.call }}</code>
        </p>
      </div>
    </section>

    <!-- ============================================ guideline resolution -->
    <section v-else-if="active === 'guideline'" class="sp-card" aria-label="Guideline resolution">
      <div class="registry-editor">
        <div class="reg-head-row">
          <span class="col-id">id</span>
          <span class="col-pat">
            patterns
            <em>(space-separated)</em>
          </span>
          <span class="col-x" aria-hidden="true" />
        </div>
        <div v-for="(e, i) in s2.entries" :key="i" class="reg-row">
          <input
            v-model="e.id"
            class="glob-input col-id"
            type="text"
            spellcheck="false"
            placeholder="guidelines/UI"
            aria-label="Registry id"
          />
          <input
            v-model="e.patterns"
            class="glob-input col-pat"
            type="text"
            spellcheck="false"
            placeholder="**/*.vue"
            aria-label="Registry patterns"
          />
          <button
            type="button"
            class="icon-btn col-x"
            aria-label="Remove entry"
            @click="removeEntry(i)"
          >
            &times;
          </button>
        </div>
        <button type="button" class="add-btn" @click="addEntry">+ add a pattern-set</button>
        <p class="order-hint">
          Registration order is the priority: register general first, specific last.
        </p>
      </div>

      <div class="target-row">
        <div class="mode-toggle" role="group" aria-label="Query mode">
          <button
            type="button"
            :class="{ 'is-active': s2.mode === 'scope' }"
            @click="s2.mode = 'scope'"
          >
            a scope
          </button>
          <button
            type="button"
            :class="{ 'is-active': s2.mode === 'path' }"
            @click="s2.mode = 'path'"
          >
            a concrete file
          </button>
        </div>
        <label class="target-label">
          {{ s2.mode === 'scope' ? 'working under' : 'editing the file' }}
          <input
            v-model="s2.scope"
            class="glob-input"
            type="text"
            spellcheck="false"
            :placeholder="
              s2.mode === 'scope' ? 'src/siteA/components/**' : 'src/siteA/components/Button.vue'
            "
            aria-label="Target scope or path"
          />
        </label>
      </div>

      <div class="sp-result" :class="'tone-' + s2View.tone">
        <div class="verdict-head">
          <span class="badge">
            <span class="dot" />
            {{ s2View.badge }}
          </span>
        </div>
        <p class="verdict-sentence">{{ s2View.sentence }}</p>

        <ol v-if="s2View.ids && s2View.ids.length" class="applies-list">
          <li v-for="(id, i) in s2View.ids" :key="id">
            <span class="prio">{{ i + 1 }}</span>
            <code class="chip strong">{{ id }}</code>
            <span class="apply-pats">{{ (s2View.byId[id] || []).join('  ') }}</span>
            <span v-if="i === s2View.ids.length - 1" class="tag">most specific</span>
          </li>
        </ol>
        <p v-if="s2View.call" class="ran-line">
          ran
          <code>{{ s2View.call }}</code>
        </p>
      </div>
    </section>

    <!-- ================================================= exact vs subtree -->
    <section v-else class="sp-card" aria-label="Exact versus subtree">
      <div class="subtree-inputs">
        <label class="target-label">
          directory
          <input
            v-model="s3.dir"
            class="glob-input"
            type="text"
            spellcheck="false"
            placeholder="src/api"
            aria-label="Directory"
          />
        </label>
        <label class="target-label">
          a file
          <input
            v-model="s3.path"
            class="glob-input"
            type="text"
            spellcheck="false"
            placeholder="src/api/routes/list.ts"
            aria-label="Concrete file path"
          />
        </label>
      </div>

      <div class="sp-result" :class="'tone-' + s3View.tone">
        <div class="verdict-head">
          <span class="badge">
            <span class="dot" />
            {{ s3View.badge }}
          </span>
        </div>

        <div v-if="s3View.exactPat" class="s3-compare">
          <div class="s3-row">
            <code class="chip">{{ s3View.exactPat }}</code>
            <span class="s3-arrow">matches</span>
            <code class="path-code">{{ s3View.path }}</code>
            <span class="v-pill" :class="s3View.exactMatch ? 'yes' : 'no'">
              {{ s3View.exactMatch ? 'yes' : 'no' }}
            </span>
          </div>
          <div class="s3-row">
            <code class="chip">{{ s3View.subtreePat }}</code>
            <span class="s3-arrow">matches</span>
            <code class="path-code">{{ s3View.path }}</code>
            <span class="v-pill" :class="s3View.subtreeMatch ? 'yes' : 'no'">
              {{ s3View.subtreeMatch ? 'yes' : 'no' }}
            </span>
          </div>
        </div>

        <p class="verdict-sentence">{{ s3View.sentence }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Theme tokens. Base = light; the dark block below flips the palette. Text and
   the outer surface lean on Starlight's own vars so the card blends with the
   page; semantic accents are restrained and tuned for contrast in both themes. */
.scenario-playground {
  --sp-muted: #5b6472;
  --sp-border: #e4e8f0;
  --sp-surface: #ffffff;
  --sp-panel: #f7f9fc;
  --sp-accent: #6d5efc;
  --sp-accent-ink: #4f46e5;
  --sp-accent-soft: #eeecff;
  --sp-code-bg: #eef1f7;

  --sp-good-fg: #0a7d54;
  --sp-good-bg: #e9fbf3;
  --sp-good-bd: #b5ecd5;
  --sp-warn-fg: #b45309;
  --sp-warn-bg: #fff7ec;
  --sp-warn-bd: #fbdca4;
  --sp-info-fg: var(--sp-accent-ink);
  --sp-info-bg: #f1f0ff;
  --sp-info-bd: #d9d5ff;
  --sp-err-fg: #b42318;
  --sp-err-bg: #fef3f2;
  --sp-err-bd: #fdccc6;

  color: var(--sl-color-text, #1f2430);
  font-size: 0.94rem;
  line-height: 1.55;
  border: 1px solid var(--sp-border);
  border-radius: 16px;
  padding: 1.25rem 1.35rem 1.4rem;
  background: var(--sp-surface);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 8px 24px rgba(15, 23, 42, 0.05);
  max-width: 100%;
}

:global(:root[data-theme='dark']) .scenario-playground {
  --sp-muted: #9aa4b2;
  --sp-border: rgba(255, 255, 255, 0.11);
  --sp-surface: rgba(255, 255, 255, 0.022);
  --sp-panel: rgba(255, 255, 255, 0.04);
  --sp-accent: #a99bff;
  --sp-accent-ink: #c7bcff;
  --sp-accent-soft: rgba(124, 92, 255, 0.16);
  --sp-code-bg: rgba(255, 255, 255, 0.08);

  --sp-good-fg: #4ade80;
  --sp-good-bg: rgba(52, 211, 153, 0.1);
  --sp-good-bd: rgba(52, 211, 153, 0.3);
  --sp-warn-fg: #fbbf24;
  --sp-warn-bg: rgba(251, 191, 36, 0.09);
  --sp-warn-bd: rgba(251, 191, 36, 0.3);
  --sp-info-bg: rgba(124, 92, 255, 0.12);
  --sp-info-bd: rgba(124, 92, 255, 0.32);
  --sp-err-fg: #f87171;
  --sp-err-bg: rgba(248, 113, 113, 0.1);
  --sp-err-bd: rgba(248, 113, 113, 0.32);

  box-shadow: none;
}

.scenario-playground * {
  box-sizing: border-box;
}

/* ---------------------------------------------------------------- header */
.sp-head {
  margin-bottom: 1rem;
}
.sp-title {
  font-size: 1.15rem;
  font-weight: 650;
  margin: 0 0 0.2rem;
  line-height: 1.3;
}
.sp-sub {
  margin: 0;
  color: var(--sp-muted);
  font-size: 0.9rem;
}

/* ------------------------------------------------------------------ tabs */
.sp-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.35rem;
  padding: 0.3rem;
  background: var(--sp-panel);
  border: 1px solid var(--sp-border);
  border-radius: 12px;
}
.sp-tab {
  flex: 1 1 auto;
  min-width: max-content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.2;
  border: 0;
  background: transparent;
  color: var(--sp-muted);
  font: inherit;
  font-size: 0.86rem;
  font-weight: 550;
  padding: 0.42rem 0.9rem;
  border-radius: 9px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.sp-tab:hover {
  color: var(--sl-color-text, #1f2430);
}
.sp-tab.is-active {
  background: var(--sp-surface);
  color: var(--sp-accent-ink);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
:global(:root[data-theme='dark']) .sp-tab.is-active {
  background: rgba(255, 255, 255, 0.09);
  box-shadow: none;
}

.sp-blurb {
  margin: 0.85rem 0.1rem 1rem;
  color: var(--sp-muted);
  font-size: 0.9rem;
}

/* ------------------------------------------------------------------ card */
.sp-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* -------------------------------------------------------- shared inputs */
.glob-input,
.id-input {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.84rem;
  color: inherit;
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
.glob-input::placeholder {
  color: var(--sp-muted);
  opacity: 0.65;
}
.glob-input:focus,
.id-input:focus {
  outline: none;
  border-color: var(--sp-accent);
  box-shadow: 0 0 0 3px var(--sp-accent-soft);
}

.mini-label,
.target-label,
.claims-label {
  display: block;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--sp-muted);
}

.add-btn {
  align-self: flex-start;
  border: 1px dashed var(--sp-border);
  background: transparent;
  color: var(--sp-accent-ink);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 550;
  padding: 0.3rem 0.6rem;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.add-btn:hover {
  background: var(--sp-accent-soft);
  border-color: var(--sp-accent);
}

.icon-btn {
  flex: 0 0 auto;
  width: 1.7rem;
  height: 1.7rem;
  border: 1px solid var(--sp-border);
  background: var(--sp-surface);
  color: var(--sp-muted);
  border-radius: 8px;
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
}
.icon-btn:hover {
  color: var(--sp-err-fg);
  border-color: var(--sp-err-bd);
  background: var(--sp-err-bg);
}

/* -------------------------------------------------- scenario 1: conflict */
.conflict-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.9rem;
}
.workitem {
  background: var(--sp-panel);
  border: 1px solid var(--sp-border);
  border-radius: 12px;
  padding: 0.85rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.id-input {
  margin-top: 0.25rem;
  font-weight: 600;
}
.claims {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.claims-label {
  margin-bottom: 0.1rem;
}
.claim-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

/* ------------------------------------------------ scenario 2: registry */
.registry-editor {
  background: var(--sp-panel);
  border: 1px solid var(--sp-border);
  border-radius: 12px;
  padding: 0.85rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.reg-head-row,
.reg-row {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr) 1.7rem;
  gap: 0.5rem;
  align-items: center;
}
.reg-head-row {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--sp-muted);
  padding: 0 0.1rem;
}
.reg-head-row em {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.8;
}
.order-hint {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: var(--sp-muted);
}

.target-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.7rem 1rem;
}
.mode-toggle {
  display: inline-flex;
  padding: 0.22rem;
  gap: 0.2rem;
  background: var(--sp-panel);
  border: 1px solid var(--sp-border);
  border-radius: 9px;
}
.mode-toggle button {
  border: 0;
  background: transparent;
  color: var(--sp-muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 550;
  padding: 0.3rem 0.6rem;
  border-radius: 7px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.mode-toggle button.is-active {
  background: var(--sp-surface);
  color: var(--sp-accent-ink);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
:global(:root[data-theme='dark']) .mode-toggle button.is-active {
  background: rgba(255, 255, 255, 0.09);
  box-shadow: none;
}
.target-label {
  flex: 1 1 240px;
}
.target-label .glob-input {
  margin-top: 0.28rem;
}

/* ----------------------------------------------- scenario 3: subtree */
.subtree-inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.8rem;
}
.subtree-inputs .glob-input {
  margin-top: 0.28rem;
}

/* ---------------------------------------------------------- result panel */
.sp-result {
  border: 1px solid var(--sp-info-bd);
  background: var(--sp-info-bg);
  border-radius: 12px;
  padding: 0.9rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.sp-result.tone-good {
  border-color: var(--sp-good-bd);
  background: var(--sp-good-bg);
}
.sp-result.tone-warn {
  border-color: var(--sp-warn-bd);
  background: var(--sp-warn-bg);
}
.sp-result.tone-error {
  border-color: var(--sp-err-bd);
  background: var(--sp-err-bg);
}
.sp-result.tone-neutral {
  border-color: var(--sp-border);
  background: var(--sp-panel);
}

.verdict-head {
  display: flex;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--sp-info-fg);
}
.tone-good .badge {
  color: var(--sp-good-fg);
}
.tone-warn .badge {
  color: var(--sp-warn-fg);
}
.tone-error .badge {
  color: var(--sp-err-fg);
}
.tone-neutral .badge {
  color: var(--sp-muted);
}
.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: currentColor;
  flex: 0 0 auto;
}

.verdict-sentence {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
}
.tone-error .verdict-sentence {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
  color: var(--sp-err-fg);
}

.detail-block {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.detail-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--sp-muted);
}
.chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.chip {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  background: var(--sp-code-bg);
  border-radius: 6px;
  padding: 0.12rem 0.4rem;
  white-space: nowrap;
}
.chip.strong {
  font-weight: 600;
  color: var(--sp-accent-ink);
  background: var(--sp-accent-soft);
}

.ran-line {
  margin: 0.1rem 0 0;
  font-size: 0.78rem;
  color: var(--sp-muted);
}
.ran-line code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.76rem;
  background: var(--sp-code-bg);
  border-radius: 5px;
  padding: 0.08rem 0.35rem;
}

/* applies list (scenario 2) */
.applies-list {
  list-style: none;
  margin: 0.1rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.applies-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.prio {
  flex: 0 0 auto;
  width: 1.35rem;
  height: 1.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 50%;
  background: var(--sp-accent);
  color: #fff;
}
.apply-pats {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.76rem;
  color: var(--sp-muted);
}
.tag {
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--sp-accent-ink);
  background: var(--sp-accent-soft);
  border-radius: 5px;
  padding: 0.1rem 0.4rem;
}

/* comparison rows (scenario 3) */
.s3-compare {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.s3-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.s3-arrow {
  font-size: 0.78rem;
  color: var(--sp-muted);
}
.path-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  color: var(--sp-muted);
}
.v-pill {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border-radius: 6px;
  padding: 0.12rem 0.5rem;
}
.v-pill.yes {
  color: var(--sp-good-fg);
  background: var(--sp-good-bg);
  border: 1px solid var(--sp-good-bd);
}
.v-pill.no {
  color: var(--sp-muted);
  background: var(--sp-panel);
  border: 1px solid var(--sp-border);
}
</style>
