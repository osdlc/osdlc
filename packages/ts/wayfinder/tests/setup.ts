/**
 * Run before every test file. A session saves its view without waiting, so
 * each test waits for those writes here, before any afterAll removes the
 * directories they write into.
 */
import { afterEach } from 'vitest'

import { flushViews } from '../src/core/saved-view.ts'

afterEach(flushViews)
