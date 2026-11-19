/** A small type data file, for the filter and the component tests. */
import type { DataField, TypeData } from '../src/data-types.ts'

const field = (name: string, over: Partial<DataField>): DataField => ({
  name,
  label: name.charAt(0).toUpperCase() + name.slice(1),
  kind: 'text',
  list: false,
  control: 'search',
  column: true,
  filter: true,
  help: null,
  note: null,
  info: null,
  link: null,
  format: { kind: 'text' },
  options: [],
  ...over,
})

const option = (value: string, label: string, count: number) => ({
  value,
  label,
  description: null,
  color: null,
  count,
})

/** Five tasks: an enum, a list enum, a reference, a number, a date, a boolean and a text field. */
export function tasks(): TypeData {
  return {
    version: 1,
    type: 'tasks',
    label: 'Tasks',
    count: 5,
    fields: [
      field('status', {
        kind: 'enum',
        control: 'chips',
        format: { kind: 'badge' },
        options: [
          option('todo', 'To do', 2),
          option('doing', 'Doing', 2),
          option('done', 'Done', 1),
        ],
      }),
      field('tags', {
        kind: 'enum',
        list: true,
        control: 'select',
        options: [option('ui', 'UI', 2), option('api', 'API', 3)],
      }),
      field('owner', { kind: 'reference', control: 'select' }),
      field('points', { kind: 'number', control: 'range', format: { kind: 'number' } }),
      field('due', { kind: 'date', control: 'range', format: { kind: 'date' } }),
      field('urgent', { kind: 'boolean', control: 'toggle' }),
      field('note', {}),
      field('q', { column: false }),
    ],
    columns: ['status', 'owner', 'due', 'points', 'tags', 'urgent', 'note'],
    records: [
      {
        id: 'T-1',
        url: '/tasks/t-1/',
        title: 'Draw the table',
        summary: null,
        values: {
          status: 'todo',
          tags: ['ui'],
          owner: 'people/ada',
          points: 3,
          due: '2026-01-10',
          urgent: true,
          note: 'Columns first',
        },
      },
      {
        id: 'T-2',
        url: '/tasks/t-2/',
        title: 'Add the filters',
        summary: null,
        values: {
          status: 'doing',
          tags: ['ui', 'api'],
          owner: 'people/ada',
          points: 8,
          due: '2026-02-01',
          q: 'odd name',
        },
      },
      {
        id: 'T-3',
        url: '/tasks/t-3/',
        title: 'Write the index',
        summary: 'For search',
        values: {
          status: 'doing',
          tags: ['api'],
          owner: 'people/grace',
          points: 5,
          due: '2026-02-20T09:00:00Z',
        },
      },
      {
        id: 'T-4',
        url: '/tasks/t-4/',
        title: 'Ship it',
        summary: null,
        values: {
          status: 'done',
          tags: ['api'],
          owner: 'people/grace',
          points: 1,
          due: '2025-12-24',
          urgent: false,
        },
      },
      {
        id: 'T-5',
        url: '/tasks/t-5/',
        title: 'Someday',
        summary: null,
        values: { status: 'todo' },
      },
    ],
    targets: {
      'people/ada': { title: 'Ada Lovelace', url: '/people/ada/' },
      'people/grace': { title: 'Grace Hopper', url: '/people/grace/' },
    },
  }
}

/** The ids of records, for short assertions. */
export const ids = (records: { id: string }[]): string[] => records.map((r) => r.id)
