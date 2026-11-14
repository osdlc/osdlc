<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { computed } from 'vue'
import { cardLabel } from '../../model/card'
import type { CardData } from '../../model/flow'
import { sourceHandleId, targetHandleId } from '../../model/flow'
import type { HandleSide } from '../../model/layout'
import ChangeTag from '../ChangeTag.vue'
import LanguageLogo from '../LanguageLogo.vue'

// Vue Flow passes many node props; only these are used, and the rest must not land on the DOM.
defineOptions({ inheritAttrs: false })

const props = defineProps<{ id: string; data: CardData }>()

const SIDES: { side: HandleSide; position: Position }[] = [
  { side: 'top', position: Position.Top },
  { side: 'bottom', position: Position.Bottom },
  { side: 'left', position: Position.Left },
  { side: 'right', position: Position.Right },
]

const logos = computed(() => props.data.members.filter((member) => member.logo !== null))
const label = computed(() => cardLabel(props.data))
const cardClasses = computed(() => [
  `card--${props.data.category}`,
  {
    'card--twin': props.data.members.length > 1,
    'is-selected': props.data.selected,
    'is-dimmed': props.data.dimmed,
    'is-match': props.data.matched,
  },
])
const cardStyle = computed(() => ({
  '--repo': props.data.repoIndex < 0 ? 'var(--repo-none)' : `var(--repo-${props.data.repoIndex % 6})`,
  '--logos': String(logos.value.length),
}))
const tagChange = computed(() =>
  props.data.category === 'going-away' ? 'removed' : props.data.category === 'to-make' ? 'added' : null,
)
const overlapTitle = computed(() =>
  props.data.overlaps === 1 ? 'Overlaps with 1 other node' : `Overlaps with ${props.data.overlaps} other nodes`,
)
</script>

<template>
  <div class="card" :class="cardClasses" :style="cardStyle" :title="label">
    <template v-for="handle in SIDES" :key="handle.side">
      <Handle :id="sourceHandleId(handle.side)" type="source" :position="handle.position" class="card__handle" />
      <Handle :id="targetHandleId(handle.side)" type="target" :position="handle.position" class="card__handle" />
    </template>
    <div v-if="logos.length > 0" class="card__logos">
      <span v-for="member in logos" :key="member.id" class="card__logo">
        <LanguageLogo :logo="member.logo!" :label="member.languageName" />
        <span v-if="member.badge" class="card__badge" :title="member.badge.text">
          <span aria-hidden="true">{{ member.badge.mark }}</span><span class="visually-hidden">{{ member.badge.text }}</span>
        </span>
      </span>
    </div>
    <div class="card__name">{{ data.title }}</div>
    <div v-if="data.subtitle" class="card__sub">{{ data.subtitle }}</div>
    <div class="card__meta">
      <span class="card__kind">{{ data.kind }}</span>
      <span v-if="data.versions" class="card__versions" :title="`Versions: ${data.versions}`">{{ data.versions }}</span>
      <span v-if="data.overlaps > 0" class="card__overlap" :title="overlapTitle">
        <span aria-hidden="true">≈</span><span class="visually-hidden">{{ overlapTitle }}</span>
      </span>
      <ChangeTag v-if="tagChange" :change="tagChange" class="card__change" />
    </div>
    <div v-if="data.move" class="card__move" :title="`Moves from ${data.move.from} to ${data.move.to}`">
      <span aria-hidden="true">⇢</span> moves: {{ data.move.from }} → {{ data.move.to }}
    </div>
    <div v-else class="card__repo">{{ data.repo }}</div>
  </div>
</template>

<style scoped>
.card {
  --logo-size: 28px;
  /* Room on the right of the top lines for the logos. */
  --logo-room: calc(var(--logos) * (var(--logo-size) + 3px));
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  width: 264px; /* NODE_WIDTH */
  height: 84px; /* NODE_HEIGHT */
  padding: 6px 8px 6px 14px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  text-align: left;
  transition: opacity 120ms ease;
}

/* The repo stripe: a second channel beside the repo name. */
.card::before {
  content: '';
  position: absolute;
  inset: 4px auto 4px 4px;
  width: 4px;
  border-radius: 2px;
  background: var(--repo);
}

/* Card colour groups: twin pair, kept, going away, to make. Dashes and a tag back up the last two. */
.card--twin {
  border-color: var(--twin);
  background: var(--twin-bg);
}

.card--kept {
  border-color: var(--kept);
  background: var(--kept-bg);
}

.card--going-away {
  border-style: dashed;
  border-color: var(--removed);
  background: var(--removed-bg);
}

.card--to-make {
  border-color: var(--added);
  background: var(--added-bg);
}

.card.is-match {
  box-shadow: 0 0 0 3px var(--match);
}

.card.is-selected {
  box-shadow: 0 0 0 3px var(--accent);
}

.card.is-dimmed {
  opacity: 0.35;
}

.card__logos {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 3px;
}

.card__logo {
  position: relative;
  width: var(--logo-size);
  height: var(--logo-size);
}

/* A member that differs from its twin: new, going away, or moving repo on its own. */
.card__badge {
  position: absolute;
  top: calc(100% + 1px);
  left: calc(50% - 8px);
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--border-strong);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.card__name,
.card__sub {
  padding-right: var(--logo-room);
}

/* On a single card the meta line still sits beside the logo; on a twin card it is below. */
.card:not(.card--twin) .card__meta {
  padding-right: var(--logo-room);
}

.card__name {
  overflow: hidden;
  font-weight: 600;
  font-size: 12.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card__sub {
  overflow: hidden;
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card__versions {
  flex: none;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 10.5px;
}

.card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
}

.card__kind {
  overflow: hidden;
  color: var(--muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card__change {
  margin-left: auto;
}

.card__overlap {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 16px;
  border: 1.5px dotted var(--overlap);
  border-radius: 4px;
  background: var(--overlap-bg);
  color: var(--overlap-text);
  font-weight: 700;
  font-size: 12px;
  line-height: 1;
}

.card__repo,
.card__move {
  overflow: hidden;
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card__move {
  align-self: flex-start;
  max-width: 100%;
  padding: 0 5px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: var(--text);
  background: var(--surface);
}

.card__handle {
  opacity: 0;
  pointer-events: none;
}
</style>
