/**
 * GFM pipe tables as strings and offsets. A backslash escapes the next
 * character, as in the GFM spec, Lezer and micromark. No parser, DOM or
 * editor dependency: callers find tables themselves and pass row text.
 */

export * from './cell-text.ts'
export * from './delimited.ts'
export * from './grid.ts'
export * from './row.ts'
export * from './splices.ts'
export * from './table.ts'
