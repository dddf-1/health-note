import { describe, expect, it } from 'vitest'
import {
  autofillValue,
  bestE1RM,
  clampDisplayWeight,
  clampReps,
  compareTrend,
  estimate1RM,
  fromDisplayWeight,
  isPersonalRecord,
  isStaleActive,
  nextRoutineId,
  stepReps,
  stepWeight,
  toDisplayWeight,
  topSetWeight,
  totalVolume,
  weeklyWorkoutDays,
} from './rules'

describe('입력 범위 (F-06)', () => {
  it('무게는 0~500, 소수 둘째 자리', () => {
    expect(clampDisplayWeight(-5)).toBe(0)
    expect(clampDisplayWeight(612)).toBe(500)
    expect(clampDisplayWeight(62.499)).toBe(62.5)
    expect(clampDisplayWeight(Number.NaN)).toBe(0)
  })
  it('횟수는 0~100 정수', () => {
    expect(clampReps(-1)).toBe(0)
    expect(clampReps(150)).toBe(100)
    expect(clampReps(8.6)).toBe(9)
  })
})

describe('+/− 버튼', () => {
  it('kg: 2.5kg 단위로 증감', () => {
    expect(stepWeight(60, 1, 2.5, 'kg')).toBe(62.5)
    expect(stepWeight(60, -1, 2.5, 'kg')).toBe(57.5)
  })
  it('빈 칸에서 + 누르면 증감 단위부터', () => {
    expect(stepWeight(null, 1, 2.5, 'kg')).toBe(2.5)
  })
  it('0 아래로 내려가지 않음', () => {
    expect(stepWeight(1, -1, 2.5, 'kg')).toBe(0)
  })
  it('lb: 표시 단위로 5lb 증감 후 kg 로 저장', () => {
    const kg = stepWeight(fromDisplayWeight(135, 'lb'), 1, 5, 'lb')
    expect(toDisplayWeight(kg, 'lb')).toBe(140)
  })
  it('횟수 ±1', () => {
    expect(stepReps(10, 1)).toBe(11)
    expect(stepReps(null, 1)).toBe(1)
    expect(stepReps(0, -1)).toBe(0)
  })
})

describe('자동 채움 (12-3)', () => {
  const prev = [
    { setNumber: 1, weightKg: 60, reps: 10 },
    { setNumber: 2, weightKg: 60, reps: 10 },
    { setNumber: 3, weightKg: 60, reps: 8 },
  ]
  it('같은 세트 번호 값을 가져온다', () => {
    expect(autofillValue(prev, 3)).toEqual({ weightKg: 60, reps: 8 })
  })
  it('세트 번호가 없으면 마지막 세트 값', () => {
    expect(autofillValue(prev, 5)).toEqual({ weightKg: 60, reps: 8 })
  })
  it('기록이 없으면 빈칸(null)', () => {
    expect(autofillValue([], 1)).toBeNull()
  })
})

describe('볼륨·1RM·PR (12-3)', () => {
  it('총 볼륨은 완료 세트만', () => {
    expect(
      totalVolume([
        { weightKg: 60, reps: 10, done: true },
        { weightKg: 60, reps: 8, done: true },
        { weightKg: 100, reps: 10, done: false },
      ]),
    ).toBe(1080)
  })
  it('Epley 공식, 1회는 무게 그대로, 13회 이상은 제외', () => {
    expect(estimate1RM(62.5, 8)).toBeCloseTo(79.17, 2)
    expect(estimate1RM(100, 1)).toBe(100)
    expect(estimate1RM(40, 13)).toBeNull()
    expect(estimate1RM(null, 5)).toBeNull()
    expect(estimate1RM(60, 0)).toBeNull()
  })
  it('최고 1RM 은 완료 세트 중에서', () => {
    expect(
      bestE1RM([
        { weightKg: 60, reps: 10, done: true },
        { weightKg: 80, reps: 5, done: false },
      ]),
    ).toBeCloseTo(80, 5)
  })
  it('PR 은 이전 최고보다 클 때만, 첫 기록은 PR 아님', () => {
    expect(isPersonalRecord(81, 80)).toBe(true)
    expect(isPersonalRecord(80, 80)).toBe(false)
    expect(isPersonalRecord(80, null)).toBe(false)
  })
})

describe('지난번 대비', () => {
  it('최고 무게 세트를 비교', () => {
    const latest = topSetWeight([
      { weightKg: 62.5, reps: 8, done: true },
      { weightKg: 60, reps: 10, done: true },
    ])
    expect(latest).toBe(62.5)
    expect(compareTrend(latest, 60)).toBe('up')
    expect(compareTrend(60, 60)).toBe('same')
    expect(compareTrend(57.5, 60)).toBe('down')
    expect(compareTrend(60, null)).toBeNull()
  })
})

describe('주간 운동일', () => {
  // 2026-11-26(목) 기준 → 그 주 월요일은 11-23
  const now = new Date(2026, 10, 26, 20, 0).getTime()
  it('월~일, 같은 날 여러 번은 하루', () => {
    const finished = [
      new Date(2026, 10, 23, 19, 0).getTime(), // 월
      new Date(2026, 10, 23, 21, 0).getTime(), // 월 (같은 날)
      new Date(2026, 10, 25, 19, 0).getTime(), // 수
      new Date(2026, 10, 22, 19, 0).getTime(), // 지난주 일요일 → 제외
    ]
    expect(weeklyWorkoutDays(finished, now)).toBe(2)
  })
})

describe('오늘의 루틴 추천 (F-02)', () => {
  const routines = [
    { id: 10, order: 0 }, // 가슴
    { id: 11, order: 1 }, // 등
    { id: 12, order: 2 }, // 하체
  ]
  it('등을 완료하면 하체 추천', () => {
    expect(nextRoutineId(routines, 11)).toBe(12)
  })
  it('마지막 다음은 처음으로 순환', () => {
    expect(nextRoutineId(routines, 12)).toBe(10)
  })
  it('기록이 없거나 지워진 루틴이면 첫 루틴', () => {
    expect(nextRoutineId(routines, undefined)).toBe(10)
    expect(nextRoutineId(routines, 99)).toBe(10)
  })
  it('루틴이 없으면 null', () => {
    expect(nextRoutineId([], undefined)).toBeNull()
  })
})

describe('12시간 지난 진행 중 운동 (F-10)', () => {
  it('12시간 초과면 안내 대상', () => {
    const start = 0
    expect(isStaleActive(start, 12 * 3600_000)).toBe(false)
    expect(isStaleActive(start, 12 * 3600_000 + 1)).toBe(true)
  })
})
