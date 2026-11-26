// 기록·성장 조회 — 기능 정의서 F-03·F-04·F-14·F-15
import type { HealthNoteDB } from './db'
import type { Workout, WorkoutSet } from './types'
import { bestE1RM, compareTrend, topSetWeight, totalVolume, weeklyWorkoutDays } from '../domain/rules'
import type { Trend } from '../domain/rules'
import { getSettings } from './repo'

export interface WorkoutListItem {
  workoutId: number
  routineName: string
  startedAt: number
  durationMs: number
  totalVolumeKg: number
  setCount: number
  exerciseNames: string[]
  memo?: string
}

/** 완료한 운동을 최근 것부터 */
async function doneWorkoutsDesc(db: HealthNoteDB): Promise<Workout[]> {
  const list = await db.workouts.where('status').equals('done').toArray()
  return list.sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt))
}

/** F-14 기록 목록 */
export async function listWorkoutHistory(db: HealthNoteDB): Promise<WorkoutListItem[]> {
  const [workouts, routines, exercises] = await Promise.all([
    doneWorkoutsDesc(db),
    db.routines.toArray(),
    db.exercises.toArray(),
  ])
  const routineNames = new Map(routines.map((r) => [r.id, r.name]))
  const exerciseNames = new Map(exercises.map((e) => [e.id, e.name]))
  const sets = await db.workoutSets
    .where('workoutId')
    .anyOf(workouts.map((w) => w.id))
    .toArray()
  const byWorkout = new Map<number, WorkoutSet[]>()
  for (const s of sets) {
    const list = byWorkout.get(s.workoutId) ?? []
    list.push(s)
    byWorkout.set(s.workoutId, list)
  }

  return workouts.map((w) => {
    const ws = (byWorkout.get(w.id) ?? []).filter((s) => s.done)
    const order = [...new Map(ws.sort((a, b) => a.exerciseOrder - b.exerciseOrder).map((s) => [s.exerciseId, s])).keys()]
    return {
      workoutId: w.id,
      routineName: (w.routineId !== undefined && routineNames.get(w.routineId)) || '자유 운동',
      startedAt: w.startedAt,
      durationMs: (w.finishedAt ?? w.startedAt) - w.startedAt,
      totalVolumeKg: totalVolume(ws),
      setCount: ws.length,
      exerciseNames: order.map((id) => exerciseNames.get(id) ?? '알 수 없는 종목'),
      ...(w.memo ? { memo: w.memo } : {}),
    }
  })
}

export interface ProgressPoint {
  workoutId: number
  date: number
  topWeightKg: number | null
  e1rmKg: number | null
  volumeKg: number
  sets: Array<{ weightKg: number | null; reps: number | null }>
}

/** F-15 종목 하나의 운동별 기록 (오래된 것부터) */
export async function getExerciseProgress(
  db: HealthNoteDB,
  exerciseId: number,
): Promise<ProgressPoint[]> {
  const sets = await db.workoutSets
    .where('exerciseId')
    .equals(exerciseId)
    .filter((s) => s.done)
    .toArray()
  const ids = [...new Set(sets.map((s) => s.workoutId))]
  const workouts = (await db.workouts.bulkGet(ids)).filter(
    (w): w is Workout => w !== undefined && w.status === 'done',
  )
  return workouts
    .map((w) => {
      const ws = sets.filter((s) => s.workoutId === w.id).sort((a, b) => a.setNumber - b.setNumber)
      return {
        workoutId: w.id,
        date: w.finishedAt ?? w.startedAt,
        topWeightKg: topSetWeight(ws),
        e1rmKg: bestE1RM(ws),
        volumeKg: totalVolume(ws),
        sets: ws.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
      }
    })
    .sort((a, b) => a.date - b.date)
}

export interface ExerciseWithHistory {
  exerciseId: number
  name: string
  sessionCount: number
  lastDate: number
}

/** 성장 화면의 종목 목록: 완료 기록이 있는 종목, 최근에 한 순서 */
export async function listExercisesWithHistory(db: HealthNoteDB): Promise<ExerciseWithHistory[]> {
  const [workouts, exercises] = await Promise.all([doneWorkoutsDesc(db), db.exercises.toArray()])
  const finished = new Map(workouts.map((w) => [w.id, w.finishedAt ?? w.startedAt]))
  const sets = await db.workoutSets
    .where('workoutId')
    .anyOf([...finished.keys()])
    .filter((s) => s.done)
    .toArray()
  const stats = new Map<number, { sessions: Set<number>; lastDate: number }>()
  for (const s of sets) {
    const st = stats.get(s.exerciseId) ?? { sessions: new Set<number>(), lastDate: 0 }
    st.sessions.add(s.workoutId)
    st.lastDate = Math.max(st.lastDate, finished.get(s.workoutId) ?? 0)
    stats.set(s.exerciseId, st)
  }
  const names = new Map(exercises.map((e) => [e.id, e.name]))
  return [...stats.entries()]
    .map(([exerciseId, st]) => ({
      exerciseId,
      name: names.get(exerciseId) ?? '알 수 없는 종목',
      sessionCount: st.sessions.size,
      lastDate: st.lastDate,
    }))
    .sort((a, b) => b.lastDate - a.lastDate)
}

export interface ExerciseTrend {
  exerciseId: number
  name: string
  trend: Trend
  latestTopKg: number
  diffKg: number
}

export interface HomeStats {
  weeklyDays: number
  weeklyGoal: number
  last?: {
    workoutId: number
    routineName: string
    date: number
    /** 지난 운동의 종목별 최고 무게를 그 전 기록과 비교 (비교할 기록이 있는 종목만) */
    trends: ExerciseTrend[]
  }
}

/** F-03·F-04 홈: 이번 주 운동일과 지난 운동 vs 그 전 */
export async function getHomeStats(db: HealthNoteDB, now = Date.now()): Promise<HomeStats> {
  const [workouts, settings] = await Promise.all([doneWorkoutsDesc(db), getSettings(db)])
  const stats: HomeStats = {
    weeklyDays: weeklyWorkoutDays(
      workouts.map((w) => w.finishedAt ?? w.startedAt),
      now,
    ),
    weeklyGoal: settings.weeklyGoal,
  }
  const last = workouts[0]
  if (!last) return stats

  const [routine, lastSets] = await Promise.all([
    last.routineId !== undefined ? db.routines.get(last.routineId) : undefined,
    db.workoutSets.where('workoutId').equals(last.id).filter((s) => s.done).toArray(),
  ])
  const exerciseIds = [...new Set(lastSets.sort((a, b) => a.exerciseOrder - b.exerciseOrder).map((s) => s.exerciseId))]
  const trends: ExerciseTrend[] = []
  for (const exerciseId of exerciseIds) {
    const points = await getExerciseProgress(db, exerciseId)
    const idx = points.findIndex((p) => p.workoutId === last.id)
    const latestTop = points[idx]?.topWeightKg ?? null
    const previousTop = idx > 0 ? points[idx - 1].topWeightKg : null
    const trend = compareTrend(latestTop, previousTop)
    if (trend === null || latestTop === null || previousTop === null) continue
    const exercise = await db.exercises.get(exerciseId)
    trends.push({
      exerciseId,
      name: exercise?.name ?? '알 수 없는 종목',
      trend,
      latestTopKg: latestTop,
      diffKg: Math.round((latestTop - previousTop) * 100) / 100,
    })
  }
  stats.last = {
    workoutId: last.id,
    routineName: routine?.name ?? '자유 운동',
    date: last.finishedAt ?? last.startedAt,
    trends,
  }
  return stats
}
