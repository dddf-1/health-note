import Dexie, { type EntityTable } from 'dexie'
import { seedDatabase } from './seed'
import type { Exercise, Routine, RoutineItem, Settings, Workout, WorkoutSet } from './types'

export type HealthNoteDB = Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  routines: EntityTable<Routine, 'id'>
  routineItems: EntityTable<RoutineItem, 'id'>
  workouts: EntityTable<Workout, 'id'>
  workoutSets: EntityTable<WorkoutSet, 'id'>
  settings: EntityTable<Settings, 'id'>
}

export function createDb(name = 'health-note'): HealthNoteDB {
  const db = new Dexie(name) as HealthNoteDB

  // 인덱스: 첫 칸은 기본 키(++ 는 자동 증가), 나머지는 조회에 쓰는 필드
  db.version(1).stores({
    exercises: '++id, name, bodyPart',
    routines: '++id, order',
    routineItems: '++id, routineId',
    workouts: '++id, status, startedAt, finishedAt, routineId',
    workoutSets: '++id, workoutId, exerciseId',
    settings: 'id',
  })

  db.on('populate', (tx) => seedDatabase(tx))
  return db
}

/** 앱 전체에서 쓰는 DB */
export const db = createDb()
