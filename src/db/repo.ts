// 저장·조회 함수 — 기능 정의서 F-05·F-06·F-07·F-10·F-11·F-12·F-13
import type { HealthNoteDB } from './db'
import { DEFAULT_SETTINGS } from './types'
import type { Routine, Settings, Workout, WorkoutSet } from './types'
import {
  autofillValue,
  bestE1RM,
  clampDisplayWeight,
  clampReps,
  estimate1RM,
  isPersonalRecord,
  isStaleActive,
  nextRoutineId,
  stepReps,
  stepWeight,
  totalVolume,
} from '../domain/rules'

export const ROUTINE_NAME_MAX = 20
export const ROUTINE_SETS_MIN = 1
export const ROUTINE_SETS_MAX = 10
export const MEMO_MAX = 200

/** 진행 중인 운동이 이미 있을 때 (UI 에서 "이어하기 / 새로 시작" 선택) */
export class ActiveWorkoutExistsError extends Error {
  readonly workoutId: number
  constructor(workoutId: number) {
    super('진행 중인 운동이 있어요')
    this.name = 'ActiveWorkoutExistsError'
    this.workoutId = workoutId
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// ── 설정 ──────────────────────────────────────────────

export async function getSettings(db: HealthNoteDB): Promise<Settings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS
}

// ── 진행 중 운동 ───────────────────────────────────────

export async function getActiveWorkout(
  db: HealthNoteDB,
  now = Date.now(),
): Promise<(Workout & { isStale: boolean }) | undefined> {
  const w = await db.workouts.where('status').equals('active').first()
  return w && { ...w, isStale: isStaleActive(w.startedAt, now) }
}

/** 운동 안의 세트를 종목 순서 → 세트 번호 순으로 */
export async function getWorkoutSets(db: HealthNoteDB, workoutId: number): Promise<WorkoutSet[]> {
  const sets = await db.workoutSets.where('workoutId').equals(workoutId).toArray()
  return sets.sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setNumber - b.setNumber)
}

/** 진행 중 운동과 그 세트를 모두 지운다 */
export async function discardWorkout(db: HealthNoteDB, workoutId: number): Promise<void> {
  await db.transaction('rw', [db.workouts, db.workoutSets], async () => {
    await db.workoutSets.where('workoutId').equals(workoutId).delete()
    await db.workouts.delete(workoutId)
  })
}

// ── 자동 채움용: 직전 운동의 세트 ──────────────────────

/** 이 종목이 들어간 가장 최근 "완료" 운동의 완료 세트 (세트 번호 순) */
export async function getPreviousSessionSets(
  db: HealthNoteDB,
  exerciseId: number,
  excludeWorkoutId?: number,
): Promise<WorkoutSet[]> {
  const sets = await db.workoutSets
    .where('exerciseId')
    .equals(exerciseId)
    .filter((s) => s.done && s.workoutId !== excludeWorkoutId)
    .toArray()
  if (sets.length === 0) return []

  const workoutIds = [...new Set(sets.map((s) => s.workoutId))]
  const workouts = (await db.workouts.bulkGet(workoutIds)).filter(
    (w): w is Workout => w !== undefined && w.status === 'done',
  )
  if (workouts.length === 0) return []

  const latest = workouts.reduce((a, b) => ((b.finishedAt ?? 0) > (a.finishedAt ?? 0) ? b : a))
  return sets.filter((s) => s.workoutId === latest.id).sort((a, b) => a.setNumber - b.setNumber)
}

// ── F-05 운동 시작 ─────────────────────────────────────

export async function startWorkout(
  db: HealthNoteDB,
  routineId: number,
  options: { replaceActive?: boolean; now?: number } = {},
): Promise<number> {
  const now = options.now ?? Date.now()
  return db.transaction(
    'rw',
    [db.workouts, db.workoutSets, db.routines, db.routineItems],
    async () => {
      const active = await db.workouts.where('status').equals('active').first()
      if (active) {
        if (!options.replaceActive) throw new ActiveWorkoutExistsError(active.id)
        await db.workoutSets.where('workoutId').equals(active.id).delete()
        await db.workouts.delete(active.id)
      }

      const routine = await db.routines.get(routineId)
      if (!routine) throw new ValidationError('루틴을 찾을 수 없어요')
      const items = await db.routineItems.where('routineId').equals(routineId).sortBy('order')

      const workoutId = await db.workouts.add({ routineId, startedAt: now, status: 'active' })
      const sets: Omit<WorkoutSet, 'id'>[] = []
      for (const [exerciseOrder, item] of items.entries()) {
        const previous = await getPreviousSessionSets(db, item.exerciseId)
        for (let setNumber = 1; setNumber <= item.defaultSets; setNumber++) {
          const value = autofillValue(previous, setNumber)
          sets.push({
            workoutId,
            exerciseId: item.exerciseId,
            exerciseOrder,
            setNumber,
            weightKg: value?.weightKg ?? null,
            reps: value?.reps ?? null,
            done: false,
          })
        }
      }
      await db.workoutSets.bulkAdd(sets)
      return workoutId
    },
  )
}

// ── F-06 세트 기록 ─────────────────────────────────────

/**
 * 무게(kg)·횟수 수정. 범위를 넘으면 고정값으로.
 * 표시 단위(lb) 기준 0~500 제한은 화면에서 stepWeight·clampDisplayWeight 로 먼저 적용한다.
 */
export async function updateSetValues(
  db: HealthNoteDB,
  setId: number,
  patch: { weightKg?: number | null; reps?: number | null },
): Promise<void> {
  const changes: Partial<WorkoutSet> = {}
  if (patch.weightKg !== undefined) {
    changes.weightKg = patch.weightKg === null ? null : clampDisplayWeight(patch.weightKg)
  }
  if (patch.reps !== undefined) {
    changes.reps = patch.reps === null ? null : clampReps(patch.reps)
  }
  await db.workoutSets.update(setId, changes)
}

/**
 * +/− 버튼. 화면에 보이는 값이 아니라 DB 의 현재 값에서 증감해서,
 * 화면이 갱신되기 전에 연타해도 누른 횟수만큼 정확히 반영된다.
 */
export async function stepSetValue(
  db: HealthNoteDB,
  setId: number,
  field: 'weight' | 'reps',
  direction: 1 | -1,
  settings: Pick<Settings, 'unit' | 'weightStep'>,
): Promise<void> {
  await db.transaction('rw', db.workoutSets, async () => {
    const set = await db.workoutSets.get(setId)
    if (!set) return
    await db.workoutSets.update(
      setId,
      field === 'weight'
        ? { weightKg: stepWeight(set.weightKg, direction, settings.weightStep, settings.unit) }
        : { reps: stepReps(set.reps, direction) },
    )
  })
}

/** ✓ 체크/해제. 체크하면 즉시 저장하고 최고 기록(PR)인지 돌려준다 */
export async function setDone(
  db: HealthNoteDB,
  setId: number,
  done: boolean,
  now = Date.now(),
): Promise<{ isPR: boolean }> {
  if (!done) {
    await db.workoutSets.update(setId, { done: false, doneAt: undefined })
    return { isPR: false }
  }
  await db.workoutSets.update(setId, { done: true, doneAt: now })
  const set = await db.workoutSets.get(setId)
  if (!set) return { isPR: false }
  await carryForward(db, set)
  return { isPR: await isSetPR(db, set) }
}

/**
 * 처음 하는 종목처럼 뒤 세트가 비어 있으면, 방금 체크한 세트 값을 바로 다음 빈 세트에 채운다.
 * (무게·횟수 둘 다 빈 세트만. 이미 값이 있는 세트는 건드리지 않음)
 */
async function carryForward(db: HealthNoteDB, set: WorkoutSet): Promise<void> {
  if (set.reps === null) return
  const next = (await getWorkoutSets(db, set.workoutId)).find(
    (s) =>
      s.exerciseId === set.exerciseId &&
      s.setNumber === set.setNumber + 1 &&
      !s.done &&
      s.weightKg === null &&
      s.reps === null,
  )
  if (next) await db.workoutSets.update(next.id, { weightKg: set.weightKg, reps: set.reps })
}

/** F-12: 이 세트 이전에 완료한 같은 종목의 모든 세트보다 추정 1RM 이 클 때 PR */
export async function isSetPR(db: HealthNoteDB, set: WorkoutSet): Promise<boolean> {
  if (!set.done || set.doneAt === undefined) return false
  const doneAt = set.doneAt
  const earlier = await db.workoutSets
    .where('exerciseId')
    .equals(set.exerciseId)
    .filter((s) => s.id !== set.id && s.done && s.doneAt !== undefined && s.doneAt < doneAt)
    .toArray()
  return isPersonalRecord(estimate1RM(set.weightKg, set.reps), bestE1RM(earlier))
}

// ── F-07 세트 추가·삭제 ────────────────────────────────

/** 이 종목의 마지막 세트를 복사해 새 세트를 추가 */
export async function addSet(
  db: HealthNoteDB,
  workoutId: number,
  exerciseId: number,
): Promise<number> {
  return db.transaction('rw', db.workoutSets, async () => {
    const sets = (await getWorkoutSets(db, workoutId)).filter((s) => s.exerciseId === exerciseId)
    const last = sets[sets.length - 1]
    if (!last) throw new ValidationError('운동에 없는 종목이에요')
    return db.workoutSets.add({
      workoutId,
      exerciseId,
      exerciseOrder: last.exerciseOrder,
      setNumber: last.setNumber + 1,
      weightKg: last.weightKg,
      reps: last.reps,
      done: false,
    })
  })
}

/** 세트 삭제 후 뒤 세트 번호를 당긴다. 되돌리기용으로 지운 세트를 돌려준다 */
export async function deleteSet(db: HealthNoteDB, setId: number): Promise<WorkoutSet | undefined> {
  return db.transaction('rw', db.workoutSets, async () => {
    const target = await db.workoutSets.get(setId)
    if (!target) return undefined
    await db.workoutSets.delete(setId)
    const after = (await getWorkoutSets(db, target.workoutId)).filter(
      (s) => s.exerciseId === target.exerciseId && s.setNumber > target.setNumber,
    )
    for (const s of after) await db.workoutSets.update(s.id, { setNumber: s.setNumber - 1 })
    return target
  })
}

/** 되돌리기: 지운 세트를 원래 자리로 */
export async function restoreSet(db: HealthNoteDB, deleted: WorkoutSet): Promise<void> {
  await db.transaction('rw', db.workoutSets, async () => {
    const after = (await getWorkoutSets(db, deleted.workoutId)).filter(
      (s) => s.exerciseId === deleted.exerciseId && s.setNumber >= deleted.setNumber,
    )
    for (const s of after) await db.workoutSets.update(s.id, { setNumber: s.setNumber + 1 })
    await db.workoutSets.add(deleted)
  })
}

// ── F-11 운동 완료·요약 ────────────────────────────────

export interface PersonalRecord {
  exerciseId: number
  weightKg: number
  reps: number
  e1rm: number
}

export interface WorkoutSummary {
  workoutId: number
  durationMs: number
  totalVolumeKg: number
  doneSetCount: number
  /** 종목별로 이번 운동에서 가장 높은 PR 하나 */
  records: PersonalRecord[]
}

export type FinishResult =
  | { status: 'empty'; uncheckedCount: number }
  | { status: 'done'; droppedCount: number; summary: WorkoutSummary }

/**
 * 운동 완료. 체크 안 된 세트는 지우고 저장한다.
 * 체크된 세트가 하나도 없으면 아무것도 바꾸지 않고 'empty' (UI 에서 삭제 여부를 묻는다).
 */
export async function finishWorkout(
  db: HealthNoteDB,
  workoutId: number,
  options: { memo?: string; now?: number } = {},
): Promise<FinishResult> {
  const now = options.now ?? Date.now()
  const result = await db.transaction('rw', [db.workouts, db.workoutSets], async () => {
    const workout = await db.workouts.get(workoutId)
    if (!workout) throw new ValidationError('운동을 찾을 수 없어요')
    const sets = await getWorkoutSets(db, workoutId)
    const unchecked = sets.filter((s) => !s.done)
    if (unchecked.length === sets.length) {
      return { status: 'empty', uncheckedCount: unchecked.length } as const
    }
    await db.workoutSets.bulkDelete(unchecked.map((s) => s.id))
    const memo = options.memo?.trim().slice(0, MEMO_MAX)
    await db.workouts.update(workoutId, {
      status: 'done',
      finishedAt: now,
      ...(memo ? { memo } : {}),
    })
    return { status: 'done', droppedCount: unchecked.length } as const
  })
  if (result.status === 'empty') return result
  return { ...result, summary: await getWorkoutSummary(db, workoutId) }
}

/** 완료 요약 화면에서 메모 저장 (최대 200자, 비우면 삭제) */
export async function updateWorkoutMemo(
  db: HealthNoteDB,
  workoutId: number,
  memo: string,
): Promise<void> {
  const trimmed = memo.trim().slice(0, MEMO_MAX)
  await db.workouts.update(workoutId, { memo: trimmed === '' ? undefined : trimmed })
}

export async function getWorkoutSummary(
  db: HealthNoteDB,
  workoutId: number,
): Promise<WorkoutSummary> {
  const workout = await db.workouts.get(workoutId)
  if (!workout) throw new ValidationError('운동을 찾을 수 없어요')
  const done = (await getWorkoutSets(db, workoutId)).filter((s) => s.done)

  const best = new Map<number, PersonalRecord>()
  for (const s of done) {
    if (!(await isSetPR(db, s))) continue
    const e1rm = estimate1RM(s.weightKg, s.reps)
    if (e1rm === null || s.weightKg === null || s.reps === null) continue
    const current = best.get(s.exerciseId)
    if (!current || e1rm > current.e1rm) {
      best.set(s.exerciseId, { exerciseId: s.exerciseId, weightKg: s.weightKg, reps: s.reps, e1rm })
    }
  }

  return {
    workoutId,
    durationMs: (workout.finishedAt ?? Date.now()) - workout.startedAt,
    totalVolumeKg: totalVolume(done),
    doneSetCount: done.length,
    records: [...best.values()],
  }
}

// ── F-13 루틴 ─────────────────────────────────────────

export interface RoutineInput {
  name: string
  restSeconds?: number
  items: Array<{ exerciseId: number; defaultSets: number }>
}

export async function listRoutines(db: HealthNoteDB): Promise<Routine[]> {
  return db.routines.orderBy('order').toArray()
}

/** 루틴 입력 검사. 앞뒤 공백을 지운 이름을 돌려준다 */
export function validateRoutineInput(input: RoutineInput): string {
  const name = input.name.trim()
  if (name.length === 0) throw new ValidationError('루틴 이름을 입력해 주세요')
  if (name.length > ROUTINE_NAME_MAX) {
    throw new ValidationError(`루틴 이름은 ${ROUTINE_NAME_MAX}자까지예요`)
  }
  if (input.items.length === 0) throw new ValidationError('종목을 1개 이상 넣어 주세요')
  for (const item of input.items) {
    if (
      !Number.isInteger(item.defaultSets) ||
      item.defaultSets < ROUTINE_SETS_MIN ||
      item.defaultSets > ROUTINE_SETS_MAX
    ) {
      throw new ValidationError(`세트 수는 ${ROUTINE_SETS_MIN}~${ROUTINE_SETS_MAX} 사이로 정해 주세요`)
    }
  }

  return name
}

export async function createRoutine(db: HealthNoteDB, input: RoutineInput): Promise<number> {
  const name = validateRoutineInput(input)
  return db.transaction('rw', [db.routines, db.routineItems], async () => {
    if ((await db.routines.filter((r) => r.name === name).count()) > 0) {
      throw new ValidationError('같은 이름의 루틴이 있어요')
    }
    const last = await db.routines.orderBy('order').last()
    const routineId = await db.routines.add({
      name,
      order: last ? last.order + 1 : 0,
      ...(input.restSeconds !== undefined ? { restSeconds: input.restSeconds } : {}),
    })
    await db.routineItems.bulkAdd(
      input.items.map((item, order) => ({
        routineId,
        exerciseId: item.exerciseId,
        order,
        defaultSets: item.defaultSets,
      })),
    )
    return routineId
  })
}

/** 루틴 삭제. 과거 운동 기록은 그대로 둔다 */
export async function deleteRoutine(db: HealthNoteDB, routineId: number): Promise<void> {
  await db.transaction('rw', [db.routines, db.routineItems], async () => {
    await db.routineItems.where('routineId').equals(routineId).delete()
    await db.routines.delete(routineId)
  })
}

/** F-02: 오늘의 루틴 추천 */
export async function recommendRoutine(db: HealthNoteDB): Promise<Routine | undefined> {
  const routines = await listRoutines(db)
  const doneWorkouts = await db.workouts.where('status').equals('done').toArray()
  const lastWithRoutine = doneWorkouts
    .filter((w) => w.routineId !== undefined)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0]
  const id = nextRoutineId(routines, lastWithRoutine?.routineId)
  return routines.find((r) => r.id === id)
}
