import { describe, expect, it } from 'vitest'
import { applyTheme, loadTheme, nextTheme, saveTheme, THEME_KEY } from '../src/model/theme'

describe('nextTheme', () => {
  it('cycles system, light, dark', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })
})

describe('loadTheme and saveTheme', () => {
  it('round-trips a choice through storage', () => {
    const map = new Map<string, string>()
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) }
    expect(loadTheme(storage)).toBe('system')
    saveTheme(storage, 'dark')
    expect(map.get(THEME_KEY)).toBe('dark')
    expect(loadTheme(storage)).toBe('dark')
  })

  it('ignores an unknown saved value', () => {
    expect(loadTheme({ getItem: () => 'purple' })).toBe('system')
  })

  it('survives storage that throws or is missing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadTheme(broken)).toBe('system')
    expect(() => saveTheme(broken, 'light')).not.toThrow()
    expect(loadTheme(undefined)).toBe('system')
    expect(() => saveTheme(undefined, 'light')).not.toThrow()
  })
})

describe('applyTheme', () => {
  it('sets data-theme for light and dark and removes it for system', () => {
    const attrs = new Map<string, string>()
    const root = {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    }
    applyTheme(root, 'dark')
    expect(attrs.get('data-theme')).toBe('dark')
    applyTheme(root, 'light')
    expect(attrs.get('data-theme')).toBe('light')
    applyTheme(root, 'system')
    expect(attrs.has('data-theme')).toBe(false)
  })
})
