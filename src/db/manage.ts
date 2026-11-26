// 관리 기능 — 기능 정의서 F-01·F-09·F-13·F-16·F-17
import type { HealthNoteDB } from './db'
import { BODY_PART_LABELS, DEFAULT_SETTINGS } from './types'
import type { BodyPart, Exercise, RoutineItem, Settings, WeightUnit, WorkoutSet } from './types'
import { autofillValue } from '../domain/rules'
import {
  getPreviousSessionSets,
  getSettings,
  getWorkoutSets,
  ROUTINE_SETS_MAX,
  ROUTINE_SETS_MIN,
  validateRoutineInput,
  ValidationError,
} from './repo'
import type { RoutineInput } from './repo'

// ── F-17 설정 ─────────────────────────────────────────

export const REST_MIN = 15
export const REST_MAX = 600
export const GOAL_MIN = 1
export const GOAL_MAX = 7
export const WEIGHT_STEPS: Record<WeightUnit, number[]> = {
  kg: [1, 1.25, 2.5, 5],
  lb: [2.5, 5, 10],
}
export const DEFAULT_STEP: Record<WeightUnit, number> = { kg: 2.5, lb: 5 }

/** 설정 바꾸기. 단위를 바꾸면 증감 단위도 그 단위의 기본값으로 */
export async function updateSettings(
  db: HealthNoteDB,
  patch: Partial<Omit<Settings, 'id'>>,
): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const current = await getSettings(db)
    const next: Settings = { ...DEFAULT_SETTINGS, ...current, ...patch, id: 'app' }
    if (patch.unit && patch.unit !== current.unit && patch.weightStep === undefined) {
      next.weightStep = DEFAULT_STEP[patch.unit]
    }
    if (!WEIGHT_STEPS[next.unit].includes(next.weightStep)) {
      throw new ValidationError('무게 증감 단위를 다시 골라 주세요')
    }
    if (!Number.isInteger(next.restSeconds) || next.restSeconds < REST_MIN || next.restSeconds > REST_MAX) {
      throw new ValidationError(`휴식 시간은 ${REST_MIN}초~${REST_MAX / 60}분 사이로 정해 주세요`)
    }
    if (!Number.isInteger(next.weeklyGoal) || next.weeklyGoal < GOAL_MIN || next.weeklyGoal > GOAL_MAX) {
      throw new ValidationError(`주간 목표는 ${GOAL_MIN}~${GOAL_MAX}일 사이로 정해 주세요`)
    }
    await db.settings.put(next)
    return next
  })
}

// ── F-16 종목 ─────────────────────────────────────────

export const EXERCISE_NAME_MAX = 20

/** 직접 종목 추가. 같은 이름(공백 무시)이 있으면 막는다 */
export async function createExercise(
  db: HealthNoteDB,
  input: { name: string; bodyPart: BodyPart },
): Promise<number> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length === 0) throw new ValidationError('종목 이름을 입력해 주세요')
  if (name.length > EXERCISE_NAME_MAX) {
    throw new ValidationError(`종목 이름은 ${EXERCISE_NAME_MAX}자까지예요`)
  }
  return db.transaction('rw', db.exercises, async () => {
    const key = name.replace(/\s/g, '')
    if ((await db.exercises.filter((e) => e.name.replace(/\s/g, '') === key).count()) > 0) {
      throw new ValidationError('같은 이름의 종목이 있어요')
    }
    return db.exercises.add({ name, bodyPart: input.bodyPart, isCustom: true } as Exercise)
  })
}

const PART_ORDER = Object.keys(BODY_PART_LABELS)

/** 종목 목록 (부위: 가슴 → 등 → … 순, 같은 부위는 이름 순) */
export async function listExercises(db: HealthNoteDB): Promise<Exercise[]> {
  const list = await db.exercises.toArray()
  return list.sort(
    (a, b) => PART_ORDER.indexOf(a.bodyPart) - PART_ORDER.indexOf(b.bodyPart) || a.name.localeCompare(b.name, 'ko'),
  )
}

// ── F-13 루틴 고치기 ──────────────────────────────────

export async function getRoutineItems(db: HealthNoteDB, routineId: number): Promise<RoutineItem[]> {
  return db.routineItems.where('routineId').equals(routineId).sortBy('order')
}

/** 루틴 이름·종목·세트 수 바꾸기 (과거 기록은 그대로) */
export async function updateRoutine(
  db: HealthNoteDB,
  routineId: number,
  input: RoutineInput,
): Promise<void> {
  const name = validateRoutineInput(input)
  await db.transaction('rw', [db.routines, db.routineItems], async () => {
    const routine = await db.routines.get(routineId)
    if (!routine) throw new ValidationError('루틴을 찾을 수 없어요')
    if ((await db.routines.filter((r) => r.name === name && r.id !== routineId).count()) > 0) {
      throw new ValidationError('같은 이름의 루틴이 있어요')
    }
    await db.routines.put({
      id: routineId,
      name,
      order: routine.order,
      ...(input.restSeconds !== undefined ? { restSeconds: input.restSeconds } : {}),
    })
    await db.routineItems.where('routineId').equals(routineId).delete()
    await db.routineItems.bulkAdd(
      input.items.map((item, order) => ({
        routineId,
        exerciseId: item.exerciseId,
        order,
        defaultSets: item.defaultSets,
      })) as RoutineItem[],
    )
  })
}

/** 추천 순서에서 위/아래로 한 칸 */
export async function moveRoutine(db: HealthNoteDB, routineId: number, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.routines, async () => {
    const list = await db.routines.orderBy('order').toArray()
    const i = list.findIndex((r) => r.id === routineId)
    const j = i + direction
    if (i === -1 || j < 0 || j >= list.length) return
    await db.routines.update(list[i].id, { order: list[j].order })
    await db.routines.update(list[j].id, { order: list[i].order })
  })
}

// ── F-09 운동 중 종목 추가 ────────────────────────────

/** 진행 중 운동 맨 뒤에 종목 추가. 지난 기록이 있으면 자동 채움 */
export async function addExerciseToWorkout(
  db: HealthNoteDB,
  workoutId: number,
  exerciseId: number,
  setCount = 3,
): Promise<void> {
  if (!Number.isInteger(setCount) || setCount < ROUTINE_SETS_MIN || setCount > ROUTINE_SETS_MAX) {
    throw new ValidationError(`세트 수는 ${ROUTINE_SETS_MIN}~${ROUTINE_SETS_MAX} 사이로 정해 주세요`)
  }
  await db.transaction('rw', [db.workouts, db.workoutSets], async () => {
    const workout = await db.workouts.get(workoutId)
    if (!workout || workout.status !== 'active') throw new ValidationError('진행 중인 운동이 아니에요')
    const sets = await getWorkoutSets(db, workoutId)
    const exerciseOrder = sets.reduce((max, s) => Math.max(max, s.exerciseOrder), -1) + 1
    const previous = await getPreviousSessionSets(db, exerciseId, workoutId)
    const added: Omit<WorkoutSet, 'id'>[] = []
    for (let setNumber = 1; setNumber <= setCount; setNumber++) {
      const value = autofillValue(previous, setNumber)
      added.push({
        workoutId,
        exerciseId,
        exerciseOrder,
        setNumber,
        weightKg: value?.weightKg ?? null,
        reps: value?.reps ?? null,
        done: false,
      })
    }
    await db.workoutSets.bulkAdd(added as WorkoutSet[])
  })
}
