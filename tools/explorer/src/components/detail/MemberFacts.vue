<script setup lang="ts">
import { computed } from 'vue'
import { logoOf } from '../../model/card'
import type { EcoNode, Ecosystem, State } from '../../model/types'
import { STATES } from '../../model/types'
import { changeOf, languageLabel, languageName, movesRepo, repoLabel } from '../../model/view'
import ChangeTag from '../ChangeTag.vue'
import LanguageLogo from '../LanguageLogo.vue'

/** One node's facts. On a twin card there is one of these per member, each with its own heading. */
const props = defineProps<{ node: EcoNode; eco: Ecosystem; heading: boolean }>()

const PLAN_URL = 'https://github.com/osdlc/markdown/blob/main/docs/ecosystem-plan.md'
const STATE_LABEL: Record<State, string> = { present: 'Present', target: 'Target' }

const change = computed(() => changeOf(props.node.states))
const logo = computed(() => logoOf(props.node.language))
const layer = computed(() => props.eco.layers.find((l) => l.id === props.node.layer)?.label ?? props.node.layer)
const moves = computed(() => movesRepo(props.node))
const places = computed(() =>
  STATES.map((state) => {
    const repoId = props.node.repo[state]
    return {
      state,
      label: STATE_LABEL[state],
      present: props.node.states.includes(state),
      repo: repoLabel(props.eco.repos, repoId),
      repoUrl: props.eco.repos.find((r) => r.id === repoId)?.url ?? null,
      path: props.node.path[state],
    }
  }),
)
</script>

<template>
  <section class="member" :class="{ 'member--headed': heading }">
    <header v-if="heading" class="member__head">
      <span v-if="logo" class="member__logo"><LanguageLogo :logo="logo" :label="languageName(node.language)" /></span>
      <h3 class="member__name">{{ node.name }}</h3>
      <ChangeTag :change="change" />
    </header>
    <p v-if="node.purpose" class="member__purpose">{{ node.purpose }}</p>

    <dl class="facts">
      <dt>Kind</dt>
      <dd>{{ node.kind }}</dd>
      <dt>Language</dt>
      <dd>{{ languageLabel(node.language) }}</dd>
      <dt>Layer</dt>
      <dd>{{ layer }}</dd>
      <dt>Status</dt>
      <dd>{{ node.status }}</dd>
      <dt>Version</dt>
      <dd>
        <template v-if="node.version">{{ node.version }}</template>
        <template v-else>none published</template>
        <a v-if="node.registry" :href="node.registry" target="_blank" rel="noopener" class="facts__link">registry</a>
      </dd>
    </dl>

    <div class="where">
      <h4 class="section-title">
        Where it lives
        <span v-if="moves" class="where__moves">⇢ moves repo</span>
      </h4>
      <table class="where__table">
        <tbody>
          <tr v-for="place in places" :key="place.state">
            <th scope="row">{{ place.label }}</th>
            <td v-if="!place.present" class="where__absent">not there</td>
            <td v-else>
              <a v-if="place.repoUrl" :href="place.repoUrl" target="_blank" rel="noopener">{{ place.repo }}</a>
              <template v-else>{{ place.repo }}</template>
              <code v-if="place.path" class="where__path">{{ place.path }}</code>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="node.notes.length > 0">
      <h4 class="section-title">Notes</h4>
      <ul class="plain-list">
        <li v-for="(note, index) in node.notes" :key="index">{{ note }}</li>
      </ul>
    </div>

    <div v-if="node.tasks.length > 0">
      <h4 class="section-title">Plan tasks</h4>
      <p class="tasks">
        <a v-for="task in node.tasks" :key="task" :href="PLAN_URL" target="_blank" rel="noopener">Task {{ task }}</a>
      </p>
    </div>

    <div v-if="node.links.length > 0">
      <h4 class="section-title">Links</h4>
      <ul class="plain-list">
        <li v-for="link in node.links" :key="link.url">
          <a :href="link.url" target="_blank" rel="noopener">{{ link.label }}</a>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.member {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.member--headed {
  padding: 10px 12px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.member__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.member__logo {
  flex: none;
  width: 24px;
  height: 24px;
}

.member__name {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 15px;
  overflow-wrap: anywhere;
}

.member__purpose {
  margin: 0;
}

.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: 13px;
}

.facts dt {
  color: var(--muted);
}

.facts dd {
  margin: 0;
}

.facts__link {
  margin-left: 8px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 13px;
}

.where__moves {
  padding: 0 5px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 400;
}

.where__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.where__table th {
  width: 64px;
  padding: 3px 8px 3px 0;
  color: var(--muted);
  font-weight: 400;
  text-align: left;
  vertical-align: top;
}

.where__table td {
  padding: 3px 0;
}

.where__absent {
  color: var(--muted);
  font-style: italic;
}

.where__path {
  display: block;
  font-family: var(--mono);
  font-size: 11.5px;
  overflow-wrap: anywhere;
}

.plain-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
}

.tasks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
}
</style>
