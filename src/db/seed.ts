import type { Transaction } from 'dexie'
import { DEFAULT_SETTINGS } from './types'
import type { BodyPart, Exercise, Routine, RoutineItem } from './types'

// 기본 종목 목록 — 기획서 12-4. id 는 1부터 순서대로 고정
const EXERCISE_LIST: Array<[string, BodyPart]> = [
  ['벤치프레스', 'chest'],
  ['인클라인 벤치프레스', 'chest'],
  ['덤벨 벤치프레스', 'chest'],
  ['인클라인 덤벨 프레스', 'chest'],
  ['체스트 프레스 머신', 'chest'],
  ['딥스', 'chest'],
  ['케이블 크로스오버', 'chest'],
  ['데드리프트', 'back'],
  ['랫풀다운', 'back'],
  ['바벨 로우', 'back'],
  ['시티드 로우', 'back'],
  ['풀업', 'back'],
  ['덤벨 로우', 'back'],
  ['오버헤드 프레스', 'shoulders'],
  ['덤벨 숄더 프레스', 'shoulders'],
  ['사이드 레터럴 레이즈', 'shoulders'],
  ['리어 델트 플라이', 'shoulders'],
  ['바벨 컬', 'biceps'],
  ['덤벨 컬', 'biceps'],
  ['해머 컬', 'biceps'],
  ['케이블 푸시다운', 'triceps'],
  ['라잉 트라이셉스 익스텐션', 'triceps'],
  ['오버헤드 트라이셉스 익스텐션', 'triceps'],
  ['스쿼트', 'legs'],
  ['레그 프레스', 'legs'],
  ['루마니안 데드리프트', 'legs'],
  ['레그 익스텐션', 'legs'],
  ['레그 컬', 'legs'],
  ['카프 레이즈', 'legs'],
  ['크런치', 'abs'],
  ['행잉 레그 레이즈', 'abs'],
  ['러닝머신', 'cardio'],
  ['사이클', 'cardio'],
]

export const SEED_EXERCISES: Exercise[] = EXERCISE_LIST.map(([name, bodyPart], i) => ({
  id: i + 1,
  name,
  bodyPart,
  isCustom: false,
}))

// 예시 3분할 루틴 — 기획서 12-4 (가슴·삼두 / 등·이두 / 하체·어깨)
const ROUTINE_LIST: Array<{ name: string; items: Array<[string, number]> }> = [
  {
    name: '가슴·삼두',
    items: [
      ['벤치프레스', 4],
      ['인클라인 덤벨 프레스', 3],
      ['케이블 크로스오버', 3],
      ['케이블 푸시다운', 3],
      ['오버헤드 트라이셉스 익스텐션', 3],
    ],
  },
  {
    name: '등·이두',
    items: [
      ['랫풀다운', 3],
      ['바벨 로우', 4],
      ['시티드 로우', 3],
      ['바벨 컬', 3],
      ['해머 컬', 3],
    ],
  },
  {
    name: '하체·어깨',
    items: [
      ['스쿼트', 4],
      ['레그 프레스', 3],
      ['루마니안 데드리프트', 3],
      ['오버헤드 프레스', 4],
      ['사이드 레터럴 레이즈', 3],
    ],
  },
]

function exerciseIdByName(name: string): number {
  const found = SEED_EXERCISES.find((e) => e.name === name)
  if (!found) throw new Error(`기본 종목에 없는 이름: ${name}`)
  return found.id
}

export const SEED_ROUTINES: Routine[] = ROUTINE_LIST.map((r, i) => ({
  id: i + 1,
  name: r.name,
  order: i,
}))

export const SEED_ROUTINE_ITEMS: RoutineItem[] = ROUTINE_LIST.flatMap((r, ri) =>
  r.items.map(([name, sets], order) => ({
    id: 0, // 아래에서 순번 부여
    routineId: ri + 1,
    exerciseId: exerciseIdByName(name),
    order,
    defaultSets: sets,
  })),
).map((item, i) => ({ ...item, id: i + 1 }))

/** DB 를 처음 만들 때 한 번 실행 (Dexie populate 이벤트) */
export function seedDatabase(tx: Transaction): void {
  void tx.table('settings').add(DEFAULT_SETTINGS)
  void tx.table('exercises').bulkAdd(SEED_EXERCISES)
  // 스프린트 1: 첫 실행 설정(F-01) 전까지 예시 루틴을 기본으로 넣어 둔다
  void tx.table('routines').bulkAdd(SEED_ROUTINES)
  void tx.table('routineItems').bulkAdd(SEED_ROUTINE_ITEMS)
}
