// 백업·복원·내보내기 — 기능 정의서 F-19
import type { HealthNoteDB } from './db'
import { BODY_PART_LABELS, DEFAULT_SETTINGS } from './types'
import type { BodyPart, Exercise, Routine, RoutineItem, Settings, Workout, WorkoutSet } from './types'
import { MEMO_MAX, ROUTINE_NAME_MAX, ROUTINE_SETS_MAX, ROUTINE_SETS_MIN, ValidationError } from './repo'
import { DEFAULT_STEP, EXERCISE_NAME_MAX, GOAL_MAX, GOAL_MIN, REST_MAX, REST_MIN, WEIGHT_STEPS } from './manage'
import { MAX_REPS, MAX_WEIGHT } from '../domain/rules'

export const BACKUP_APP = 'health-note'
export const BACKUP_VERSION = 1

export interface BackupData {
  exercises: Exercise[]
  routines: Routine[]
  routineItems: RoutineItem[]
  workouts: Workout[]
  workoutSets: WorkoutSet[]
  settings: Settings[]
}

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: number
  data: BackupData
}

const TABLES = ['exercises', 'routines', 'routineItems', 'workouts', 'workoutSets', 'settings'] as const

/** 전체 데이터를 백업 객체로 */
export async function exportBackup(db: HealthNoteDB, now = Date.now()): Promise<Backup> {
  return db.transaction('r', TABLES.map((t) => db[t]), async () => ({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now,
    data: {
      exercises: await db.exercises.toArray(),
      routines: await db.routines.toArray(),
      routineItems: await db.routineItems.toArray(),
      workouts: await db.workouts.toArray(),
      workoutSets: await db.workoutSets.toArray(),
      settings: await db.settings.toArray(),
    },
  }))
}

/** 이보다 큰 파일은 읽지 않는다 (10년 매일 운동해도 수 MB) */
export const BACKUP_MAX_CHARS = 20_000_000

type Rec = Record<string, unknown>
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const isId = (v: unknown): v is number => isInt(v, 1)
const isTime = (v: unknown): v is number => isInt(v, 0)
const isName = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max
const isBodyPart = (v: unknown): v is BodyPart =>
  typeof v === 'string' && Object.hasOwn(BODY_PART_LABELS, v)

function corrupt(what: string): never {
  throw new ValidationError(`백업 파일이 손상됐어요 (${what})`)
}

/** 선택 필드: 없으면 통과, 있으면 검사. 틀리면 ok: false */
function optional<T>(v: unknown, ok: (v: unknown) => v is T): { ok: boolean; value?: T } {
  if (v === undefined) return { ok: true }
  return ok(v) ? { ok: true, value: v } : { ok: false }
}

/**
 * 표 하나를 검사하며 아는 필드만 골라 새 객체로 만든다. 모르는 필드(__proto__ 포함)는 버린다.
 * 한 줄이라도 틀리거나 id 가 겹치면 ValidationError.
 */
function cleanTable<T extends { id: number }>(list: unknown, what: string, clean: (r: Rec) => T | null): T[] {
  if (!Array.isArray(list)) corrupt(what)
  const ids = new Set<number>()
  return list.map((r) => {
    const row = isObj(r) ? clean(r) : null
    if (!row || ids.has(row.id)) corrupt(what)
    ids.add(row.id)
    return row
  })
}

function cleanExercise(r: Rec): Exercise | null {
  if (!isId(r.id) || !isName(r.name, EXERCISE_NAME_MAX) || !isBodyPart(r.bodyPart)) return null
  if (typeof r.isCustom !== 'boolean') return null
  return { id: r.id, name: r.name, bodyPart: r.bodyPart, isCustom: r.isCustom }
}

function cleanRoutine(r: Rec): Routine | null {
  if (!isId(r.id) || !isName(r.name, ROUTINE_NAME_MAX) || !isInt(r.order, 0)) return null
  const rest = optional(r.restSeconds, (v): v is number => isInt(v, REST_MIN, REST_MAX))
  if (!rest.ok) return null
  const routine: Routine = { id: r.id, name: r.name, order: r.order }
  if (rest.value !== undefined) routine.restSeconds = rest.value
  return routine
}

function cleanWorkout(r: Rec): Workout | null {
  if (!isId(r.id) || !isTime(r.startedAt)) return null
  if (r.status !== 'active' && r.status !== 'done') return null
  // 루틴을 지워도 지난 운동은 남으므로 routineId 는 없는 루틴을 가리킬 수 있다
  const routineId = optional(r.routineId, isId)
  const finishedAt = optional(r.finishedAt, isTime)
  const memo = optional(r.memo, (v): v is string => typeof v === 'string' && v.length <= MEMO_MAX)
  if (!routineId.ok || !finishedAt.ok || !memo.ok) return null
  const workout: Workout = { id: r.id, startedAt: r.startedAt, status: r.status }
  if (routineId.value !== undefined) workout.routineId = routineId.value
  if (finishedAt.value !== undefined) workout.finishedAt = finishedAt.value
  if (memo.value !== undefined) workout.memo = memo.value
  return workout
}

/** 설정은 틀린 값만 기본값으로 바꾼다 (기록이 아니라서 거절할 만큼 중요하지 않음) */
function cleanSettings(list: unknown): Settings[] {
  if (!Array.isArray(list)) corrupt('설정')
  const s = list.find((r): r is Rec => isObj(r) && r.id === 'app')
  if (!s) return []
  const unit = s.unit === 'lb' || s.unit === 'kg' ? s.unit : DEFAULT_SETTINGS.unit
  const settings: Settings = {
    id: 'app',
    unit,
    weightStep:
      typeof s.weightStep === 'number' && WEIGHT_STEPS[unit].includes(s.weightStep)
        ? s.weightStep
        : DEFAULT_STEP[unit],
    restSeconds: isInt(s.restSeconds, REST_MIN, REST_MAX) ? s.restSeconds : DEFAULT_SETTINGS.restSeconds,
    weeklyGoal: isInt(s.weeklyGoal, GOAL_MIN, GOAL_MAX) ? s.weeklyGoal : DEFAULT_SETTINGS.weeklyGoal,
  }
  if (isTime(s.onboardedAt)) settings.onboardedAt = s.onboardedAt
  if (isTime(s.lastBackupAt)) settings.lastBackupAt = s.lastBackupAt
  return [settings]
}

/**
 * 파일 내용 검사. 이 앱의 백업이 아니거나 깨졌으면 ValidationError.
 * 백업 파일은 남이 준 파일일 수도 있으므로, 모든 필드의 타입·범위와 표 사이 연결을 확인하고
 * 아는 필드만 담은 새 객체를 돌려준다.
 */
export function parseBackup(text: string): Backup {
  if (text.length > BACKUP_MAX_CHARS) throw new ValidationError('백업 파일이 너무 커요')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ValidationError('백업 파일을 읽을 수 없어요')
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP || !isObj(raw.data)) {
    throw new ValidationError('이 앱의 백업 파일이 아니에요')
  }
  if (!isInt(raw.version, 1) || raw.version > BACKUP_VERSION) {
    if (typeof raw.version === 'number' && raw.version > BACKUP_VERSION) {
      throw new ValidationError('더 새 버전 앱에서 만든 백업이에요. 앱을 업데이트해 주세요')
    }
    corrupt('버전')
  }
  const data = raw.data

  const exercises = cleanTable(data.exercises, '종목', cleanExercise)
  const routines = cleanTable(data.routines, '루틴', cleanRoutine)
  const exerciseIds = new Set(exercises.map((e) => e.id))
  const routineIds = new Set(routines.map((r) => r.id))

  const routineItems = cleanTable(data.routineItems, '루틴 종목', (r): RoutineItem | null => {
    if (!isId(r.id) || !isId(r.routineId) || !isId(r.exerciseId)) return null
    if (!routineIds.has(r.routineId) || !exerciseIds.has(r.exerciseId)) return null
    if (!isInt(r.order, 0) || !isInt(r.defaultSets, ROUTINE_SETS_MIN, ROUTINE_SETS_MAX)) return null
    return { id: r.id, routineId: r.routineId, exerciseId: r.exerciseId, order: r.order, defaultSets: r.defaultSets }
  })

  const workouts = cleanTable(data.workouts, '운동 기록', cleanWorkout)
  if (workouts.filter((w) => w.status === 'active').length > 1) corrupt('진행 중인 운동이 여러 개')
  const workoutIds = new Set(workouts.map((w) => w.id))

  const workoutSets = cleanTable(data.workoutSets, '세트', (r): WorkoutSet | null => {
    if (!isId(r.id) || !isId(r.workoutId) || !isId(r.exerciseId)) return null
    if (!workoutIds.has(r.workoutId) || !exerciseIds.has(r.exerciseId)) return null
    if (!isInt(r.exerciseOrder, 0) || !isInt(r.setNumber, 1)) return null
    if (r.weightKg !== null && !isNum(r.weightKg, 0, MAX_WEIGHT)) return null
    if (r.reps !== null && !isInt(r.reps, 0, MAX_REPS)) return null
    if (typeof r.done !== 'boolean') return null
    const doneAt = optional(r.doneAt, isTime)
    if (!doneAt.ok) return null
    const set: WorkoutSet = {
      id: r.id,
      workoutId: r.workoutId,
      exerciseId: r.exerciseId,
      exerciseOrder: r.exerciseOrder,
      setNumber: r.setNumber,
      weightKg: r.weightKg,
      reps: r.reps,
      done: r.done,
    }
    if (doneAt.value !== undefined) set.doneAt = doneAt.value
    return set
  })

  return {
    app: BACKUP_APP,
    version: raw.version,
    exportedAt: isTime(raw.exportedAt) ? raw.exportedAt : 0,
    data: { exercises, routines, routineItems, workouts, workoutSets, settings: cleanSettings(data.settings) },
  }
}

/** 지금 데이터를 모두 지우고 백업으로 바꾼다 */
export async function importBackup(db: HealthNoteDB, backup: Backup): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
    for (const t of TABLES) await db[t].clear()
    const { data } = backup
    await db.exercises.bulkAdd(data.exercises)
    await db.routines.bulkAdd(data.routines)
    await db.routineItems.bulkAdd(data.routineItems)
    await db.workouts.bulkAdd(data.workouts)
    await db.workoutSets.bulkAdd(data.workoutSets)
    const settings = data.settings.find((s) => s.id === 'app')
    await db.settings.put({ ...DEFAULT_SETTINGS, ...settings, id: 'app' })
  })
}

/**
 * CSV 셀. 글자 값이 = + - @ 탭 CR 로 시작하면 엑셀·구글 시트가 수식으로 실행하므로
 * 앞에 ' 를 붙여 글자로 보이게 한다 (CSV 수식 주입 방지). 숫자 열은 그대로.
 */
export const csvCell = (v: string | number | null | undefined) => {
  let s = v === null || v === undefined ? '' : String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 엑셀·구글 시트용 CSV: 완료한 운동의 완료 세트, 한 줄에 한 세트 (BOM 포함) */
export async function exportSetsCsv(db: HealthNoteDB): Promise<string> {
  const [workouts, sets, exercises, routines] = await Promise.all([
    db.workouts.where('status').equals('done').toArray(),
    db.workoutSets.toArray(),
    db.exercises.toArray(),
    db.routines.toArray(),
  ])
  const exerciseNames = new Map(exercises.map((e) => [e.id, e.name]))
  const routineNames = new Map(routines.map((r) => [r.id, r.name]))
  const byWorkout = new Map(workouts.map((w) => [w.id, w]))
  const rows = sets
    .filter((s) => s.done && byWorkout.has(s.workoutId))
    .sort((a, b) => {
      const wa = byWorkout.get(a.workoutId)!
      const wb = byWorkout.get(b.workoutId)!
      return wa.startedAt - wb.startedAt || a.exerciseOrder - b.exerciseOrder || a.setNumber - b.setNumber
    })
    .map((s) => {
      const w = byWorkout.get(s.workoutId)!
      return [
        localDate(w.startedAt),
        (w.routineId !== undefined && routineNames.get(w.routineId)) || '자유 운동',
        exerciseNames.get(s.exerciseId) ?? '',
        s.setNumber,
        s.weightKg,
        s.reps,
        w.memo,
      ]
        .map(csvCell)
        .join(',')
    })
  const header = '날짜,루틴,종목,세트,무게(kg),횟수,메모'
  return '﻿' + [header, ...rows].join('\n') + '\n'
}
