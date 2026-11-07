/**
 * Host-side tools over a built Storybook: capture stories to PNG files for
 * docs, and serve a static build on the loopback interface. The baseline
 * check itself is the `story-shots` command.
 */
export {
  captureCli,
  captureStories,
  type CaptureCliDefaults,
  type CaptureOptions,
} from './capture.ts'
export { serveStatic } from './serve-static.ts'
