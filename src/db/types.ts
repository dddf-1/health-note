// 저장 데이터 정의 — 기획서 12-5

export type BodyPart =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'abs'
  | 'cardio'
  | 'other'

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  chest: '가슴',
  back: '등',
  shoulders: '어깨',
  biceps: '이두',
  triceps: '삼두',
  legs: '하체',
  abs: '복근',
  cardio: '유산소',
  other: '기타',
}

/** 종목 (Exercise) */
export interface Exercise {
  id: number
  name: string
  bodyPart: BodyPart
  /** 사용자가 직접 추가한 종목인지 */
  isCustom: boolean
}

/** 루틴 (Routine) — order 는 "오늘의 루틴 추천"(F-02) 순환 순서 */
export interface Routine {
  id: number
  name: string
  order: number
  /** 이 루틴의 기본 휴식 시간(초). 없으면 설정값 사용 */
  restSeconds?: number
}

/** 루틴 종목 (RoutineItem) — 루틴과 종목 연결 */
export interface RoutineItem {
  id: number
  routineId: number
  exerciseId: number
  order: number
  defaultSets: number
}

export type WorkoutStatus = 'active' | 'done'

/** 운동 (Workout) — 하루 한 번의 운동 세션 */
export interface Workout {
  id: number
  /** 루틴 없이 시작한 운동이면 없음 */
  routineId?: number
  startedAt: number
  finishedAt?: number
  status: WorkoutStatus
  memo?: string
}

/** 세트 (WorkoutSet) — 기록의 최소 단위. 무게는 항상 kg 로 저장 */
export interface WorkoutSet {
  id: number
  workoutId: number
  exerciseId: number
  /** 운동 안에서 종목 순서 (0부터) */
  exerciseOrder: number
  /** 종목 안에서 세트 번호 (1부터) */
  setNumber: number
  weightKg: number | null
  reps: number | null
  done: boolean
  doneAt?: number
}

export type WeightUnit = 'kg' | 'lb'

/** 설정 (Settings) — 1건만 존재 */
export interface Settings {
  id: 'app'
  unit: WeightUnit
  /** 무게 증감 단위 (표시 단위 기준: kg 이면 kg, lb 이면 lb) */
  weightStep: number
  /** 기본 휴식 시간(초) */
  restSeconds: number
  /** 주간 목표 운동일 */
  weeklyGoal: number
  /** 첫 실행 안내(F-01)를 마친 시각 */
  onboardedAt?: number
  /** 마지막으로 백업 파일을 저장한 시각 (F-19) */
  lastBackupAt?: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  unit: 'kg',
  weightStep: 2.5,
  restSeconds: 90,
  weeklyGoal: 4,
}

/** 무게·횟수 한 쌍 */
export interface SetValue {
  weightKg: number | null
  reps: number | null
}
