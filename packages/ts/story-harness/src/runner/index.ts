/**
 * Host-side tools over a built Storybook: capture stories to PNG files for
 * docs, serve a static build on the loopback interface, and pick story ids
 * from its `index.json`. The baseline
 * check itself is the `story-shots` command.
 */
export {
  captureCli,
  captureStories,
  type CaptureCliDefaults,
  type CaptureOptions,
} from './capture.ts'
export { serveStatic } from './serve-static.ts'
export { selectStories, type StoryFilter, type StoryIndex } from './story.ts'
