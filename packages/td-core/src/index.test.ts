import { describe, expect, it } from 'vitest'
import { Hello, version } from './index'

describe('td-core scaffold', () => {
  it('exposes a version string', () => {
    expect(version).toBe('0.0.0')
  })

  it('exports the Hello component', () => {
    expect(typeof Hello).toBe('function')
  })
})
