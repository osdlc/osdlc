import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, mergeConfig } from '../../src/viewmodel/defaults.ts'

describe('DEFAULT_CONFIG', () => {
  it('should have all required fields', () => {
    expect(DEFAULT_CONFIG.resizeBoundary).toBe(8)
    expect(DEFAULT_CONFIG.minNodeWidth).toBe(100)
    expect(DEFAULT_CONFIG.minNodeHeight).toBe(50)
    expect(DEFAULT_CONFIG.snapThreshold).toBe(8)
    expect(DEFAULT_CONFIG.snapEnabled).toBe(true)
    expect(DEFAULT_CONFIG.minScale).toBe(0.1)
    expect(DEFAULT_CONFIG.maxScale).toBe(3.0)
    expect(DEFAULT_CONFIG.zoomSpeed).toBe(0.1)
    expect(DEFAULT_CONFIG.defaultNodeWidth).toBe(200)
    expect(DEFAULT_CONFIG.defaultNodeHeight).toBe(100)
  })

  it('should have sensible viewport constraints', () => {
    expect(DEFAULT_CONFIG.minScale).toBeLessThan(1)
    expect(DEFAULT_CONFIG.maxScale).toBeGreaterThan(1)
    expect(DEFAULT_CONFIG.zoomSpeed).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.zoomSpeed).toBeLessThan(1)
  })

  it('should have positive size constraints', () => {
    expect(DEFAULT_CONFIG.minNodeWidth).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.minNodeHeight).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.defaultNodeWidth).toBeGreaterThanOrEqual(DEFAULT_CONFIG.minNodeWidth)
    expect(DEFAULT_CONFIG.defaultNodeHeight).toBeGreaterThanOrEqual(DEFAULT_CONFIG.minNodeHeight)
  })
})

describe('mergeConfig', () => {
  it('should return defaults when called with undefined', () => {
    const config = mergeConfig(undefined)
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('should return defaults when called with empty object', () => {
    const config = mergeConfig({})
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('should override single value', () => {
    const config = mergeConfig({ snapThreshold: 16 })
    expect(config.snapThreshold).toBe(16)
    // Other values should remain default
    expect(config.resizeBoundary).toBe(8)
    expect(config.minScale).toBe(0.1)
  })

  it('should override multiple values', () => {
    const config = mergeConfig({
      snapThreshold: 12,
      snapEnabled: false,
      minScale: 0.25,
      maxScale: 2.0,
    })

    expect(config.snapThreshold).toBe(12)
    expect(config.snapEnabled).toBe(false)
    expect(config.minScale).toBe(0.25)
    expect(config.maxScale).toBe(2.0)
    // Unchanged values
    expect(config.resizeBoundary).toBe(8)
    expect(config.zoomSpeed).toBe(0.1)
  })

  it('should override all values', () => {
    const customConfig = {
      resizeBoundary: 10,
      minNodeWidth: 150,
      minNodeHeight: 75,
      snapThreshold: 12,
      snapEnabled: false,
      minScale: 0.2,
      maxScale: 4.0,
      zoomSpeed: 0.15,
      defaultNodeWidth: 250,
      defaultNodeHeight: 120,
    }

    const config = mergeConfig(customConfig)
    expect(config).toEqual(customConfig)
  })

  it('should not mutate DEFAULT_CONFIG', () => {
    const originalSnapshot = { ...DEFAULT_CONFIG }
    mergeConfig({ snapThreshold: 999 })
    expect(DEFAULT_CONFIG).toEqual(originalSnapshot)
  })

  it('should return a new object each time', () => {
    const config1 = mergeConfig({})
    const config2 = mergeConfig({})
    expect(config1).not.toBe(config2)
    expect(config1).toEqual(config2)
  })

  it('should handle boundary value overrides', () => {
    const config = mergeConfig({
      minScale: 0,
      maxScale: 10,
      snapThreshold: 0,
    })

    expect(config.minScale).toBe(0)
    expect(config.maxScale).toBe(10)
    expect(config.snapThreshold).toBe(0)
  })
})
