// 백업·복원·내보내기 — 기능 정의서 F-19
import type { HealthNoteDB } from './db'
import { DEFAULT_SETTINGS } from './types'
import type { Exercise, Routine, RoutineItem, Settings, Workout, WorkoutSet } from './types'
import { ValidationError } from './repo'

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

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const hasId = (v: unknown) => isObj(v) && typeof v.id === 'number'

/** 파일 내용 검사. 이 앱의 백업이 아니거나 깨졌으면 ValidationError */
export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ValidationError('백업 파일을 읽을 수 없어요')
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP || !isObj(raw.data)) {
    throw new ValidationError('이 앱의 백업 파일이 아니에요')
  }
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    throw new ValidationError('더 새 버전 앱에서 만든 백업이에요. 앱을 업데이트해 주세요')
  }
  const data = raw.data
  for (const t of TABLES) {
    const list = data[t]
    if (!Array.isArray(list)) throw new ValidationError('백업 파일이 손상됐어요')
    if (t !== 'settings' && !list.every(hasId)) throw new ValidationError('백업 파일이 손상됐어요')
  }
  const sets = data.workoutSets as WorkoutSet[]
  const workoutIds = new Set((data.workouts as Workout[]).map((w) => w.id))
  if (!sets.every((s) => workoutIds.has(s.workoutId))) {
    throw new ValidationError('백업 파일이 손상됐어요')
  }
  return raw as unknown as Backup
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
