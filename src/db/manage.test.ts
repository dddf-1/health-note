import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type HealthNoteDB } from './db'
import {
  createRoutine,
  finishWorkout,
  getSettings,
  getWorkoutSets,
  listRoutines,
  setDone,
  startWorkout,
  updateSetValues,
  ValidationError,
} from './repo'
import {
  addExerciseToWorkout,
  createExercise,
  getRoutineItems,
  moveRoutine,
  updateRoutine,
  updateSettings,
} from './manage'

let db: HealthNoteDB

beforeEach(async () => {
  db = createDb(`test-${crypto.randomUUID()}`)
  await db.open()
})
afterEach(async () => {
  await db.delete()
})

describe('F-17 설정', () => {
  it('값을 바꾸고, 단위를 바꾸면 증감 단위도 그 단위 기본값으로', async () => {
    await updateSettings(db, { restSeconds: 120, weeklyGoal: 3 })
    expect(await getSettings(db)).toMatchObject({ restSeconds: 120, weeklyGoal: 3, unit: 'kg', weightStep: 2.5 })
    await updateSettings(db, { unit: 'lb' })
    expect(await getSettings(db)).toMatchObject({ unit: 'lb', weightStep: 5 })
  })

  it('범위를 벗어나면 저장하지 않는다', async () => {
    await expect(updateSettings(db, { restSeconds: 5 })).rejects.toThrow(ValidationError)
    await expect(updateSettings(db, { weeklyGoal: 8 })).rejects.toThrow(ValidationError)
    await expect(updateSettings(db, { weightStep: 3 })).rejects.toThrow(ValidationError)
    expect((await getSettings(db)).restSeconds).toBe(90)
  })
})

describe('F-16 종목 추가', () => {
  it('직접 추가, 같은 이름(공백 무시)은 막는다', async () => {
    const id = await createExercise(db, { name: '  힙 쓰러스트 ', bodyPart: 'legs' })
    expect(await db.exercises.get(id)).toMatchObject({ name: '힙 쓰러스트', isCustom: true })
    await expect(createExercise(db, { name: '힙쓰러스트', bodyPart: 'legs' })).rejects.toThrow('같은 이름')
    await expect(createExercise(db, { name: '벤치 프레스', bodyPart: 'chest' })).rejects.toThrow('같은 이름')
    await expect(createExercise(db, { name: ' ', bodyPart: 'chest' })).rejects.toThrow(ValidationError)
  })
})

describe('F-13 루틴 고치기', () => {
  it('이름·종목·세트 수를 바꾸고, 다른 루틴과 이름이 같으면 막는다', async () => {
    await updateRoutine(db, 1, { name: '가슴 데이', items: [{ exerciseId: 2, defaultSets: 5 }] })
    expect((await db.routines.get(1))?.name).toBe('가슴 데이')
    expect((await getRoutineItems(db, 1)).map((i) => [i.exerciseId, i.defaultSets])).toEqual([[2, 5]])
    await expect(
      updateRoutine(db, 1, { name: '등·이두', items: [{ exerciseId: 2, defaultSets: 3 }] }),
    ).rejects.toThrow('같은 이름')
    // 자기 이름 그대로는 괜찮다
    await updateRoutine(db, 1, { name: '가슴 데이', items: [{ exerciseId: 1, defaultSets: 3 }] })
  })

  it('추천 순서를 위아래로 바꾼다 (끝에서는 그대로)', async () => {
    await createRoutine(db, { name: '팔', items: [{ exerciseId: 18, defaultSets: 3 }] })
    await moveRoutine(db, 1, 1)
    expect((await listRoutines(db)).map((r) => r.name)).toEqual(['등·이두', '가슴·삼두', '하체·어깨', '팔'])
    await moveRoutine(db, 2, -1)
    expect((await listRoutines(db))[0].name).toBe('등·이두')
  })
})

describe('F-09 운동 중 종목 추가', () => {
  it('맨 뒤에 추가하고 지난 기록으로 채운다', async () => {
    // 지난번에 랫풀다운(9) 50kg×12
    const first = await startWorkout(db, 1)
    await addExerciseToWorkout(db, first, 9, 2)
    for (const s of (await getWorkoutSets(db, first)).filter((x) => x.exerciseId === 9)) {
      await updateSetValues(db, s.id, { weightKg: 50, reps: 12 })
      await setDone(db, s.id, true)
    }
    await finishWorkout(db, first)

    const second = await startWorkout(db, 1)
    const before = await getWorkoutSets(db, second)
    await addExerciseToWorkout(db, second, 9, 3)
    const added = (await getWorkoutSets(db, second)).filter((s) => s.exerciseId === 9)
    expect(added).toHaveLength(3)
    expect(added[0].exerciseOrder).toBe(Math.max(...before.map((s) => s.exerciseOrder)) + 1)
    expect(added.map((s) => [s.weightKg, s.reps])).toEqual([
      [50, 12],
      [50, 12],
      [50, 12],
    ])
  })

  it('끝난 운동에는 추가할 수 없다', async () => {
    const id = await startWorkout(db, 1)
    const s = (await getWorkoutSets(db, id))[0]
    await updateSetValues(db, s.id, { weightKg: 50, reps: 10 })
    await setDone(db, s.id, true)
    await finishWorkout(db, id)
    await expect(addExerciseToWorkout(db, id, 9)).rejects.toThrow(ValidationError)
  })
})
