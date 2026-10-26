/**
 * Run before every test file. A session saves its view and the store without waiting, so
 * each test waits for those writes here, before any afterAll removes the
 * directories they write into.
 */
import { afterEach } from 'vitest'

import { flushWrites } from '../src/core/writes.ts'

afterEach(flushWrites)
