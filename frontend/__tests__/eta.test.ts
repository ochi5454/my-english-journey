/**
 * ETA ユーティリティのテスト
 */
import { loadSpeed, saveSpeed, updateSpeedEma, estimateEtaSeconds, EtaTrackerState } from '../app/utils/eta'

describe('ETA Utility Functions', () => {
  let getItemSpy: jest.SpyInstance
  let setItemSpy: jest.SpyInstance

  beforeEach(() => {
    // localStorage をスパイでモック
    getItemSpy = jest.spyOn(Storage.prototype, 'getItem')
    setItemSpy = jest.spyOn(Storage.prototype, 'setItem')
    jest.spyOn(Storage.prototype, 'clear')
    localStorage.clear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('loadSpeed', () => {
    it('returns default speed when localStorage is empty', () => {
      getItemSpy.mockReturnValue(null)

      expect(loadSpeed()).toBe(1200) // DEFAULT_SPEED
    })

    it('returns stored speed when valid', () => {
      getItemSpy.mockReturnValue('2000')

      expect(loadSpeed()).toBe(2000)
    })

    it('returns default speed when stored value is invalid', () => {
      getItemSpy.mockReturnValue('invalid')

      expect(loadSpeed()).toBe(1200)
    })

    it('returns default speed when stored value is zero', () => {
      getItemSpy.mockReturnValue('0')

      expect(loadSpeed()).toBe(1200)
    })

    it('returns default speed when stored value is negative', () => {
      getItemSpy.mockReturnValue('-100')

      expect(loadSpeed()).toBe(1200)
    })
  })

  describe('saveSpeed', () => {
    it('saves valid speed to localStorage', () => {
      saveSpeed(1500)

      expect(setItemSpy).toHaveBeenCalledWith('export_rows_per_sec', '1500')
    })

    it('does not save invalid speed (NaN)', () => {
      saveSpeed(NaN)

      expect(setItemSpy).not.toHaveBeenCalled()
    })

    it('does not save zero speed', () => {
      saveSpeed(0)

      expect(setItemSpy).not.toHaveBeenCalled()
    })

    it('does not save negative speed', () => {
      saveSpeed(-100)

      expect(setItemSpy).not.toHaveBeenCalled()
    })

    it('rounds speed to integer', () => {
      saveSpeed(1234.56)

      expect(setItemSpy).toHaveBeenCalledWith('export_rows_per_sec', '1235')
    })
  })

  describe('updateSpeedEma', () => {
    it('calculates exponential moving average', () => {
      const result = updateSpeedEma(1000, 2000, 0.3)

      // 1000 * 0.7 + 2000 * 0.3 = 700 + 600 = 1300
      expect(result).toBe(1300)
    })

    it('returns old speed when measured is invalid', () => {
      expect(updateSpeedEma(1000, NaN)).toBe(1000)
      expect(updateSpeedEma(1000, 0)).toBe(1000)
      expect(updateSpeedEma(1000, -100)).toBe(1000)
    })

    it('uses default speed when old speed is invalid', () => {
      const result = updateSpeedEma(NaN, 2000, 0.3)

      // DEFAULT_SPEED (1200) * 0.7 + 2000 * 0.3 = 840 + 600 = 1440
      expect(result).toBe(1440)
    })

    it('handles zero old speed', () => {
      const result = updateSpeedEma(0, 2000, 0.3)

      // Uses DEFAULT_SPEED: 1200 * 0.7 + 2000 * 0.3 = 1440
      expect(result).toBe(1440)
    })
  })

  describe('estimateEtaSeconds', () => {
    let originalPerformanceNow: () => number

    beforeEach(() => {
      originalPerformanceNow = performance.now
    })

    afterEach(() => {
      performance.now = originalPerformanceNow
    })

    it('returns 0 when totalRows is 0', () => {
      const state: EtaTrackerState = {
        totalRows: 0,
        startAt: 1000,
        processed: 0,
      }

      expect(estimateEtaSeconds(state, 1000)).toBe(0)
    })

    it('returns 0 when startAt is 0', () => {
      const state: EtaTrackerState = {
        totalRows: 1000,
        startAt: 0,
        processed: 0,
      }

      expect(estimateEtaSeconds(state, 1000)).toBe(0)
    })

    it('calculates ETA based on progress', () => {
      // performance.now を 11000ms にモック（開始から11秒後）
      performance.now = jest.fn().mockReturnValue(11000)

      const state: EtaTrackerState = {
        totalRows: 1000,
        startAt: 1000, // 開始時刻 1000ms
        processed: 500, // 500行処理済み
      }

      // 10秒で500行 = 50行/秒
      // 残り500行 / 50行/秒 = 10秒
      const eta = estimateEtaSeconds(state, 100)

      expect(eta).toBe(10)
    })

    it('uses provided speed when no progress yet', () => {
      performance.now = jest.fn().mockReturnValue(1000)

      const state: EtaTrackerState = {
        totalRows: 1000,
        startAt: 1000,
        processed: 0,
      }

      // 0秒経過、処理済みなし
      // 1000行 / 100行/秒 = 10秒
      const eta = estimateEtaSeconds(state, 100)

      expect(eta).toBe(10)
    })

    it('returns 0 when all rows are processed', () => {
      performance.now = jest.fn().mockReturnValue(11000)

      const state: EtaTrackerState = {
        totalRows: 1000,
        startAt: 1000,
        processed: 1000, // 全て処理済み
      }

      expect(estimateEtaSeconds(state, 100)).toBe(0)
    })
  })
})
