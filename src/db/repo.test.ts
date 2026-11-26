import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type HealthNoteDB } from './db'
import {
  ActiveWorkoutExistsError,
  ValidationError,
  addSet,
  createRoutine,
  deleteRoutine,
  deleteSet,
  finishWorkout,
  getActiveWorkout,
  getSettings,
  getWorkoutSets,
  listRoutines,
  recommendRoutine,
  restoreSet,
  setDone,
  startWorkout,
  updateSetValues,
} from './repo'
import { SEED_EXERCISES, SEED_ROUTINES } from './seed'

let db: HealthNoteDB
let dbName: string
const HOUR = 3600_000

beforeEach(async () => {
  dbName = `test-${crypto.randomUUID()}`
  db = createDb(dbName)
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

/** 루틴으로 운동 시작 → 모든 세트에 값을 넣고 체크 → 완료 */
async function doWorkout(routineId: number, startAt: number, weightKg: number, reps: number) {
  const id = await startWorkout(db, routineId, { now: startAt })
  const sets = await getWorkoutSets(db, id)
  let t = startAt
  for (const s of sets) {
    await updateSetValues(db, s.id, { weightKg, reps })
    await setDone(db, s.id, true, (t += 60_000))
  }
  await finishWorkout(db, id, { now: t + 60_000 })
  return id
}

describe('처음 열 때 기본 데이터', () => {
  it('설정·기본 종목·예시 3분할 루틴이 들어 있다', async () => {
    expect(await getSettings(db)).toMatchObject({ unit: 'kg', weightStep: 2.5, restSeconds: 90 })
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
    expect((await listRoutines(db)).map((r) => r.name)).toEqual(SEED_ROUTINES.map((r) => r.name))
  })
})

describe('F-05 운동 시작', () => {
  it('루틴의 종목 순서·기본 세트 수만큼 세트가 생기고, 첫 운동은 빈칸', async () => {
    const id = await startWorkout(db, 1)
    const sets = await getWorkoutSets(db, id)
    expect(sets).toHaveLength(4 + 3 + 3 + 3 + 3) // 가슴·삼두 루틴
    expect(sets[0]).toMatchObject({ exerciseOrder: 0, setNumber: 1, weightKg: null, reps: null })
    expect(sets.every((s) => !s.done)).toBe(true)
  })

  it('두 번째 운동은 지난 기록으로 자동 채움', async () => {
    const first = await startWorkout(db, 1, { now: 0 })
    const bench = (await getWorkoutSets(db, first)).filter((s) => s.exerciseOrder === 0)
    const values: Array<[number, number]> = [
      [60, 10],
      [60, 10],
      [60, 8],
    ]
    // 4세트 중 3세트만 하고 완료
    for (const [i, [w, r]] of values.entries()) {
      await updateSetValues(db, bench[i].id, { weightKg: w, reps: r })
      await setDone(db, bench[i].id, true, 1000 + i)
    }
    await finishWorkout(db, first, { now: 2000 })

    const second = await startWorkout(db, 1, { now: 24 * HOUR })
    const next = (await getWorkoutSets(db, second)).filter((s) => s.exerciseOrder === 0)
    expect(next.map((s) => [s.weightKg, s.reps])).toEqual([
      [60, 10],
      [60, 10],
      [60, 8],
      [60, 8], // 4세트는 지난번에 없어서 마지막 세트 값
    ])
  })

  it('진행 중 운동이 있으면 막고, 새로 시작을 고르면 기존 진행을 지운다', async () => {
    const first = await startWorkout(db, 1)
    await expect(startWorkout(db, 2)).rejects.toBeInstanceOf(ActiveWorkoutExistsError)
    const second = await startWorkout(db, 2, { replaceActive: true })
    expect(await db.workouts.get(first)).toBeUndefined()
    expect(await getWorkoutSets(db, first)).toHaveLength(0)
    expect((await getActiveWorkout(db))?.id).toBe(second)
  })
})

describe('F-06·F-10 세트 기록과 자동 저장', () => {
  it('체크 즉시 저장 — DB 를 닫았다 다시 열어도(강제 종료) 남아 있다', async () => {
    const id = await startWorkout(db, 1)
    const [first] = await getWorkoutSets(db, id)
    await updateSetValues(db, first.id, { weightKg: 60, reps: 10 })
    await setDone(db, first.id, true)

    db.close()
    const reopened = createDb(dbName)
    await reopened.open()
    const active = await getActiveWorkout(reopened)
    expect(active?.id).toBe(id)
    const [saved] = await getWorkoutSets(reopened, id)
    expect(saved).toMatchObject({ weightKg: 60, reps: 10, done: true })
    reopened.close()
    await db.open()
  })

  it('입력 범위를 넘으면 고정값으로 저장', async () => {
    const id = await startWorkout(db, 1)
    const [first] = await getWorkoutSets(db, id)
    await updateSetValues(db, first.id, { weightKg: 999, reps: -3 })
    expect(await db.workoutSets.get(first.id)).toMatchObject({ weightKg: 500, reps: 0 })
  })

  it('체크 해제하면 완료 시각도 지운다', async () => {
    const id = await startWorkout(db, 1)
    const [first] = await getWorkoutSets(db, id)
    await setDone(db, first.id, true, 123)
    await setDone(db, first.id, false)
    const saved = await db.workoutSets.get(first.id)
    expect(saved?.done).toBe(false)
    expect(saved?.doneAt).toBeUndefined()
  })

  it('12시간 넘은 진행 중 운동은 표시해 준다', async () => {
    await startWorkout(db, 1, { now: 0 })
    expect((await getActiveWorkout(db, 13 * HOUR))?.isStale).toBe(true)
  })
})

describe('F-12 최고 기록', () => {
  it('첫 기록은 PR 아님, 이전보다 추정 1RM 이 크면 PR', async () => {
    await doWorkout(1, 0, 60, 10)

    const id = await startWorkout(db, 1, { now: 24 * HOUR })
    const [bench1, bench2] = await getWorkoutSets(db, id)
    await updateSetValues(db, bench1.id, { weightKg: 60, reps: 10 })
    expect((await setDone(db, bench1.id, true, 24 * HOUR + 1)).isPR).toBe(false)
    await updateSetValues(db, bench2.id, { weightKg: 62.5, reps: 10 })
    expect((await setDone(db, bench2.id, true, 24 * HOUR + 2)).isPR).toBe(true)
  })

  it('맨 처음 운동은 PR 표시 없음', async () => {
    const id = await startWorkout(db, 1)
    const [first] = await getWorkoutSets(db, id)
    await updateSetValues(db, first.id, { weightKg: 60, reps: 10 })
    expect((await setDone(db, first.id, true)).isPR).toBe(false)
  })
})

describe('F-07 세트 추가·삭제', () => {
  it('추가하면 마지막 세트를 복사', async () => {
    const id = await startWorkout(db, 1)
    const bench = (await getWorkoutSets(db, id)).filter((s) => s.exerciseOrder === 0)
    await updateSetValues(db, bench[3].id, { weightKg: 55, reps: 12 })
    const newId = await addSet(db, id, bench[3].exerciseId)
    expect(await db.workoutSets.get(newId)).toMatchObject({
      setNumber: 5,
      weightKg: 55,
      reps: 12,
      done: false,
    })
  })

  it('삭제하면 뒤 세트 번호를 당기고, 되돌리면 원래 자리로', async () => {
    const id = await startWorkout(db, 1)
    const bench = (await getWorkoutSets(db, id)).filter((s) => s.exerciseOrder === 0)
    await updateSetValues(db, bench[1].id, { weightKg: 70, reps: 5 })

    const deleted = await deleteSet(db, bench[1].id)
    let now = (await getWorkoutSets(db, id)).filter((s) => s.exerciseOrder === 0)
    expect(now.map((s) => s.setNumber)).toEqual([1, 2, 3])

    await restoreSet(db, deleted!)
    now = (await getWorkoutSets(db, id)).filter((s) => s.exerciseOrder === 0)
    expect(now.map((s) => s.setNumber)).toEqual([1, 2, 3, 4])
    expect(now[1]).toMatchObject({ id: bench[1].id, weightKg: 70, reps: 5 })
  })
})

describe('F-11 운동 완료', () => {
  it('체크한 세트가 없으면 바꾸지 않고 empty', async () => {
    const id = await startWorkout(db, 1)
    const result = await finishWorkout(db, id)
    expect(result.status).toBe('empty')
    expect((await db.workouts.get(id))?.status).toBe('active')
  })

  it('미체크 세트는 지우고 요약(시간·볼륨·세트 수·PR)을 돌려준다', async () => {
    await doWorkout(1, 0, 60, 10)

    const id = await startWorkout(db, 1, { now: 24 * HOUR })
    const [b1, b2] = await getWorkoutSets(db, id)
    await updateSetValues(db, b1.id, { weightKg: 62.5, reps: 8 })
    await setDone(db, b1.id, true, 24 * HOUR + 1)
    await updateSetValues(db, b2.id, { weightKg: 65, reps: 8 })
    await setDone(db, b2.id, true, 24 * HOUR + 2)

    const result = await finishWorkout(db, id, { memo: '  컨디션 좋음  ', now: 25 * HOUR })
    expect(result.status).toBe('done')
    if (result.status !== 'done') return
    expect(result.droppedCount).toBe(16 - 2)
    expect(result.summary).toMatchObject({
      durationMs: HOUR,
      totalVolumeKg: 62.5 * 8 + 65 * 8,
      doneSetCount: 2,
    })
    expect(result.summary.records).toEqual([
      { exerciseId: b1.exerciseId, weightKg: 65, reps: 8, e1rm: 65 * (1 + 8 / 30) },
    ])
    expect(await db.workouts.get(id)).toMatchObject({ status: 'done', memo: '컨디션 좋음' })
    expect(await getWorkoutSets(db, id)).toHaveLength(2)
  })
})

describe('F-13 루틴·F-02 추천', () => {
  it('루틴 만들기 규칙', async () => {
    const make = (name: string, sets = 3, items = [{ exerciseId: 1, defaultSets: sets }]) =>
      createRoutine(db, { name, items })
    await expect(make('  ')).rejects.toBeInstanceOf(ValidationError)
    await expect(make('가'.repeat(21))).rejects.toBeInstanceOf(ValidationError)
    await expect(make('새 루틴', 0)).rejects.toBeInstanceOf(ValidationError)
    await expect(make('새 루틴', 11)).rejects.toBeInstanceOf(ValidationError)
    await expect(make('새 루틴', 3, [])).rejects.toBeInstanceOf(ValidationError)
    await expect(make('가슴·삼두')).rejects.toBeInstanceOf(ValidationError) // 중복

    const id = await make('  상체 전체  ')
    const routines = await listRoutines(db)
    expect(routines.at(-1)).toMatchObject({ id, name: '상체 전체', order: 3 })
    // 만든 루틴으로 운동 시작 가능
    expect(await startWorkout(db, id)).toBeGreaterThan(0)
  })

  it('루틴을 지워도 과거 운동 기록은 남는다', async () => {
    const workoutId = await doWorkout(1, 0, 60, 10)
    await deleteRoutine(db, 1)
    expect(await db.routines.get(1)).toBeUndefined()
    expect(await db.workouts.get(workoutId)).toMatchObject({ status: 'done' })
    expect((await getWorkoutSets(db, workoutId)).length).toBeGreaterThan(0)
  })

  it('가슴 → 등 → 하체 순서로 추천', async () => {
    expect((await recommendRoutine(db))?.name).toBe('가슴·삼두')
    await doWorkout(1, 0, 60, 10)
    expect((await recommendRoutine(db))?.name).toBe('등·이두')
    await doWorkout(2, 24 * HOUR, 50, 10)
    expect((await recommendRoutine(db))?.name).toBe('하체·어깨')
    await doWorkout(3, 48 * HOUR, 80, 8)
    expect((await recommendRoutine(db))?.name).toBe('가슴·삼두')
  })
})
