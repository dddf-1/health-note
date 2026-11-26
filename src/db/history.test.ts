import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type HealthNoteDB } from './db'
import { discardWorkout, finishWorkout, getWorkoutSets, setDone, startWorkout, updateSetValues } from './repo'
import { getExerciseProgress, getHomeStats, listExercisesWithHistory, listWorkoutHistory } from './history'

let db: HealthNoteDB
const DAY = 24 * 3600_000
// 2026-11-23 월요일 10시
const MON = new Date(2026, 10, 23, 10).getTime()

beforeEach(async () => {
  db = createDb(`test-${crypto.randomUUID()}`)
  await db.open()
})
afterEach(async () => {
  await db.delete()
})

async function doWorkout(routineId: number, startAt: number, weightKg: number, reps: number) {
  const id = await startWorkout(db, routineId, { now: startAt })
  let t = startAt
  for (const s of await getWorkoutSets(db, id)) {
    await updateSetValues(db, s.id, { weightKg, reps })
    await setDone(db, s.id, true, (t += 60_000))
  }
  await finishWorkout(db, id, { now: t + 60_000 })
  return id
}

describe('F-14 기록 목록', () => {
  it('완료한 운동만 최근 것부터, 볼륨·세트 수·종목 이름과 함께', async () => {
    const first = await doWorkout(1, MON - 7 * DAY, 50, 10)
    const second = await doWorkout(2, MON - 5 * DAY, 40, 10)
    await startWorkout(db, 3, { now: MON }) // 진행 중은 빠진다

    const list = await listWorkoutHistory(db)
    expect(list.map((w) => w.workoutId)).toEqual([second, first])
    expect(list[0].routineName).toBe('등·이두')
    expect(list[0].setCount).toBeGreaterThan(0)
    expect(list[0].totalVolumeKg).toBe(40 * 10 * list[0].setCount)
    expect(list[0].exerciseNames.length).toBeGreaterThan(0)
  })

  it('운동을 지우면 목록과 성장 기록에서 빠진다', async () => {
    const id = await doWorkout(1, MON, 50, 10)
    const exerciseId = (await getWorkoutSets(db, id))[0].exerciseId
    await discardWorkout(db, id)
    expect(await listWorkoutHistory(db)).toEqual([])
    expect(await getExerciseProgress(db, exerciseId)).toEqual([])
  })
})

describe('F-15 성장 그래프', () => {
  it('종목별로 운동마다 최고 무게·추정 1RM·볼륨 (오래된 것부터)', async () => {
    await doWorkout(1, MON - 7 * DAY, 50, 10)
    const latest = await doWorkout(1, MON, 55, 8)
    const exerciseId = (await getWorkoutSets(db, latest))[0].exerciseId

    const points = await getExerciseProgress(db, exerciseId)
    expect(points.map((p) => p.topWeightKg)).toEqual([50, 55])
    expect(points[1].e1rmKg).toBeCloseTo(55 * (1 + 8 / 30))
    expect(points[1].workoutId).toBe(latest)

    const exercises = await listExercisesWithHistory(db)
    const item = exercises.find((e) => e.exerciseId === exerciseId)
    expect(item?.sessionCount).toBe(2)
  })
})

describe('F-03·F-04 홈 요약', () => {
  it('이번 주(월~일) 운동한 날짜 수와 주간 목표', async () => {
    await doWorkout(1, MON - 2 * DAY, 50, 10) // 지난주
    await doWorkout(2, MON, 40, 10)
    await doWorkout(3, MON + 1 * 3600_000, 40, 10) // 같은 날 두 번
    await doWorkout(1, MON + DAY, 50, 10)

    const stats = await getHomeStats(db, MON + 2 * DAY)
    expect(stats.weeklyDays).toBe(2)
    expect(stats.weeklyGoal).toBe(4)
  })

  it('지난 운동의 종목별 최고 무게를 그 전 기록과 비교', async () => {
    await doWorkout(1, MON - 7 * DAY, 50, 10)
    await doWorkout(1, MON, 52.5, 10)

    const stats = await getHomeStats(db, MON + DAY)
    expect(stats.last?.routineName).toBe('가슴·삼두')
    expect(stats.last?.trends.length).toBeGreaterThan(0)
    expect(stats.last?.trends.every((t) => t.trend === 'up' && t.diffKg === 2.5)).toBe(true)
  })

  it('기록이 없으면 지난 운동 없음, 처음 한 종목은 비교에서 빠진다', async () => {
    expect((await getHomeStats(db, MON)).last).toBeUndefined()
    await doWorkout(1, MON, 50, 10)
    expect((await getHomeStats(db, MON)).last?.trends).toEqual([])
  })
})
